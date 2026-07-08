// ============================================================
// Öğrenci uygulaması — ŞİFRESİZ SÜRÜM
// Giriş yalnızca e-posta ile yapılır; kimlik doğrulama Firebase Auth
// yerine doğrudan Firestore'daki "users" koleksiyonu üzerinden yapılır.
// ============================================================
import {
  db, doc, getDoc, setDoc, updateDoc, serverTimestamp, arrayUnion,
  loadOptions, esc, debounce
} from "./common.js";
import { OPENALEX_MAILTO } from "./firebase-config.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let uid = null;          // e-postadan türetilen belge kimliği
let profile = null;
let OPT = null;
let data = {};          // sihirbaz verisi
let currentStage = 1;
const STAGE_COUNT = 11;
const STAGE_NAMES = [
  "İlgi alanı seç", "Alanı daralt", "Problem kur", "Anahtar kelime üret",
  "İlk literatürü oku", "Boşluğu belirle", "Soruları yaz", "Yöntemle eşleştir",
  "Yapılabilirlik", "Pilot deneme", "Fikir özeti"
];

const emailToId = (email) => email.trim().toLowerCase().replace(/[^a-z0-9]/g, "_");

// ------------------------------------------------------------
// EKRAN YÖNETİMİ
// ------------------------------------------------------------
function show(id) {
  ["authScreen", "waitScreen", "rejectScreen", "appScreen"].forEach(s =>
    $("#" + s).hidden = (s !== id));
}

// ------------------------------------------------------------
// GİRİŞ / KAYIT — sadece e-posta, şifre yok
// ------------------------------------------------------------
$("#tabLogin").onclick = () => { switchTab(true); };
$("#tabRegister").onclick = () => { switchTab(false); };
function switchTab(login) {
  $("#tabLogin").classList.toggle("active", login);
  $("#tabRegister").classList.toggle("active", !login);
  $("#loginForm").hidden = !login;
  $("#registerForm").hidden = login;
  msg("");
}
function msg(text, cls = "info") {
  const el = $("#authMsg");
  el.className = "msg" + (text ? " " + cls : "");
  el.textContent = text;
}

$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const email = $("#loginEmail").value.trim();
  if (!email) { msg("E-posta adresinizi yazın.", "err"); return; }
  msg("Giriş yapılıyor…");
  await enterWith(email);
};

$("#registerForm").onsubmit = async (e) => {
  e.preventDefault();
  msg("Kayıt oluşturuluyor…");
  const email = $("#regEmail").value.trim();
  const id = emailToId(email);
  try {
    const existing = await getDoc(doc(db, "users", id));
    if (existing.exists()) {
      msg("Bu e-posta zaten kayıtlı. Giriş yapmayı deneyin.", "err");
      return;
    }
    await setDoc(doc(db, "users", id), {
      email,
      ad: $("#regName").value.trim(),
      soyad: $("#regSurname").value.trim(),
      program: $("#regProgram").value.trim(),
      status: "pending",
      createdAt: serverTimestamp()
    });
    await enterWith(email);
  } catch (err) { msg("Hata: " + err.message, "err"); }
};

["waitLogout", "rejectLogout", "logoutBtn"].forEach(id => {
  const el = $("#" + id);
  if (el) el.onclick = () => { uid = null; profile = null; show("authScreen"); };
});
$("#waitRefresh").onclick = () => { if (profile) enterWith(profile.email); };

async function enterWith(email) {
  const id = emailToId(email);
  try {
    const snap = await getDoc(doc(db, "users", id));
    if (!snap.exists()) {
      msg("Bu e-posta ile kayıt bulunamadı. Önce \"Kayıt ol\" ile üye olun.", "err");
      return;
    }
    uid = id;
    profile = snap.data();
    if (profile.status === "approved") { await startApp(); }
    else if (profile.status === "rejected") { show("rejectScreen"); }
    else { show("waitScreen"); }
  } catch (err) {
    msg("Giriş yapılamadı: " + err.message, "err");
  }
}

show("authScreen");

// ------------------------------------------------------------
// UYGULAMA BAŞLATMA
// ------------------------------------------------------------
async function startApp() {
  OPT = await loadOptions();
  const snap = await getDoc(doc(db, "submissions", uid));
  data = snap.exists() ? (snap.data().data || {}) : {};

  $("#whoAmI").textContent = `${profile.ad} ${profile.soyad}`.trim() || profile.email;
  buildRail();
  buildDynamicUI();
  restoreInputs();
  renderAlanRows();
  renderLitRows();
  bindAutosave();
  goStage(1);
  show("appScreen");
}

// ------------------------------------------------------------
// SOL RAY VE GEZİNME
// ------------------------------------------------------------
function buildRail() {
  const rail = $("#rail");
  for (let i = 1; i <= STAGE_COUNT; i++) {
    const b = document.createElement("button");
    b.className = "stage-btn"; b.dataset.stage = i;
    b.innerHTML = `<span class="num">${String(i).padStart(2, "0")}</span>
                   <span>${esc(STAGE_NAMES[i - 1])}</span><span class="done" hidden>✓</span>`;
    b.onclick = () => goStage(i);
    rail.appendChild(b);
  }
}

function goStage(n) {
  currentStage = n;
  $$(".stage").forEach(s => s.classList.toggle("visible", +s.dataset.stage === n));
  $$(".stage-btn").forEach(b => b.classList.toggle("active", +b.dataset.stage === n));
  $("#prevBtn").disabled = n === 1;
  $("#nextBtn").disabled = n === STAGE_COUNT;
  window.scrollTo({ top: 0 });
  updateProgress();
}
$("#prevBtn").onclick = () => goStage(Math.max(1, currentStage - 1));
$("#nextBtn").onclick = () => goStage(Math.min(STAGE_COUNT, currentStage + 1));

function stageDone(i) {
  switch (i) {
    case 1: return (data["s1.alanlar"] || []).length >= 3;
    case 2: return !!(data["s2.konuCumlesi"] || "").trim();
    case 3: return !!(data["s3.paragraf"] || "").trim();
    case 4: return !!((data["s4.konu.en"] || data["s4.konu.tr"] || "").trim());
    case 5: return (data["s5.kaynaklar"] || []).length >= 1;
    case 6: return !!(data["s6.paragraf"] || "").trim();
    case 7: return !!(data["s7.ana"] || "").trim();
    case 8: return !!(data["s8.yontem"] || "").trim();
    case 9: return !!(data["s9.veri"] || "").trim();
    case 10: return !!(data["s10.deneme"] || "").trim();
    case 11: return !!(data["s11.baslik"] || "").trim();
  }
  return false;
}

function updateProgress() {
  let done = 0;
  $$(".stage-btn").forEach(b => {
    const ok = stageDone(+b.dataset.stage);
    b.querySelector(".done").hidden = !ok;
    if (ok) done++;
  });
  const pct = Math.round(done / STAGE_COUNT * 100);
  $("#progressFill").style.width = pct + "%";
  $("#progressLabel").textContent = `%${pct} tamamlandı (${done}/${STAGE_COUNT} aşama)`;
  return pct;
}

// ------------------------------------------------------------
// DİNAMİK ARAYÜZ (seçenek havuzları)
// ------------------------------------------------------------
function checkGroup(containerId, key, list, max = 99) {
  const c = $("#" + containerId);
  c.innerHTML = "";
  list.forEach(item => {
    const l = document.createElement("label");
    l.innerHTML = `<input type="checkbox" value="${esc(item)}"> <span>${esc(item)}</span>`;
    const inp = l.querySelector("input");
    inp.checked = (data[key] || []).includes(item);
    inp.onchange = () => {
      let arr = data[key] || [];
      if (inp.checked) {
        if (arr.length >= max) { inp.checked = false; alert(`En fazla ${max} seçim yapabilirsiniz.`); return; }
        arr = [...arr, item];
      } else arr = arr.filter(x => x !== item);
      data[key] = arr;
      if (key === "s1.alanlar") renderAlanRows();
      queueSave();
    };
    c.appendChild(l);
  });
}

function buildDynamicUI() {
  checkGroup("alanChecks", "s1.alanlar", OPT.alanlar, 5);
  checkGroup("hedefChecks", "s2.hedef", OPT.hedefGruplar, 2);
  checkGroup("beceriChecks", "s2.beceri", OPT.beceriler, 2);
  checkGroup("aracChecks", "s2.arac", OPT.araclar, 2);
  checkGroup("baglamChecks", "s2.baglam", OPT.baglamlar, 2);
  checkGroup("veriChecks", "s2.veri", OPT.veriTurleri, 2);
  checkGroup("pilotChecks", "s10.tur", OPT.pilotSecenekleri, 2);

  // Boşluk türleri: onay + kanıt alanı
  const bc = $("#boslukChecks");
  bc.innerHTML = "";
  OPT.bosluklar.forEach((b, i) => {
    const wrap = document.createElement("div");
    wrap.style.marginBottom = "12px";
    wrap.innerHTML = `
      <label style="display:flex;gap:8px;font-weight:600;font-size:.88rem">
        <input type="checkbox" data-bosluk="${esc(b)}"> ${esc(b)}
      </label>
      <input type="text" data-k="s6.kanit.${i}" placeholder="Kanıt / kaynak…" style="margin-top:4px">`;
    const inp = wrap.querySelector("input[type=checkbox]");
    inp.checked = (data["s6.turler"] || []).includes(b);
    inp.onchange = () => {
      let arr = data["s6.turler"] || [];
      arr = inp.checked ? [...arr, b] : arr.filter(x => x !== b);
      data["s6.turler"] = arr; queueSave();
    };
    bc.appendChild(wrap);
  });

  // Soru kalıpları
  const kl = $("#kalipList");
  kl.innerHTML = "";
  OPT.soruKaliplari.forEach(k => {
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "btn ghost sm";
    btn.style.cssText = "display:block;width:100%;text-align:left;margin:4px 0;font-weight:400";
    btn.textContent = k;
    btn.onclick = () => {
      const ta = document.querySelector('[data-k="s7.ana"]');
      ta.value = k; data["s7.ana"] = k; queueSave(); ta.focus();
    };
    kl.appendChild(btn);
  });

  // Yöntem seçenekleri
  const ys = $("#yontemSelect");
  ys.innerHTML = '<option value="">Seçin…</option>' +
    OPT.yontemler.map(y => `<option>${esc(y)}</option>`).join("");

  // Soru tipi → yöntem önerisi
  const MAP = {
    "Katılımcılar ne düşünüyor? (görüş)": "Nitel veya nicel → görüşme, açık uçlu form, anket",
    "Katılımcılar bir ölçeğe ne düzeyde katılıyor?": "Nicel → anket, ölçek",
    "Uygulama öncesi–sonrası değişim var mı?": "Nicel / deneysel → ön test–son test, performans puanı",
    "Katılımcılar süreci nasıl deneyimliyor?": "Nitel → görüşme, günlük, gözlem notu",
    "Hem düzeyi hem nedeni anlamak istiyorum": "Karma yöntem → anket + görüşme",
    "Ders kitabında / metinde ne var?": "Doküman analizi → metin, görsel, etkinlik, tema kodları",
    "AI çıktıları nasıl özellikler gösteriyor?": "İçerik analizi / rubrik → AI çıktıları, puanlama rubriği, karşılaştırma",
    "Bir temsil nasıl kuruluyor?": "İçerik / söylem analizi → ders kitabı, görsel, metin, görev yönergeleri"
  };
  document.querySelector('[data-k="s8.tip"]').addEventListener("change", (e) => {
    const box = $("#yontemOneri");
    const v = MAP[e.target.value];
    box.style.display = v ? "block" : "none";
    if (v) box.innerHTML = "<b>Önerilen eşleşme:</b> " + esc(v);
  });
}

// ------------------------------------------------------------
// AŞAMA 1: seçilen alan satırları
// ------------------------------------------------------------
function renderAlanRows() {
  const tbody = $("#alanRows");
  const alanlar = data["s1.alanlar"] || [];
  const detay = data["s1.detay"] || {};
  tbody.innerHTML = "";
  if (!alanlar.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="hint">Henüz alan seçilmedi.</td></tr>'; return;
  }
  alanlar.forEach(a => {
    const d = detay[a] || {};
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><b>${esc(a)}</b></td>
      <td><textarea data-alan="${esc(a)}" data-f="neden">${esc(d.neden || "")}</textarea></td>
      <td><textarea data-alan="${esc(a)}" data-f="sorun">${esc(d.sorun || "")}</textarea></td>
      <td><textarea data-alan="${esc(a)}" data-f="baglam">${esc(d.baglam || "")}</textarea></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll("textarea").forEach(ta => {
    ta.addEventListener("input", () => {
      const det = data["s1.detay"] || {};
      det[ta.dataset.alan] = det[ta.dataset.alan] || {};
      det[ta.dataset.alan][ta.dataset.f] = ta.value;
      data["s1.detay"] = det; queueSave();
    });
  });
}

// ------------------------------------------------------------
// AŞAMA 4: kombinasyon üretici
// ------------------------------------------------------------
$("#komboBtn").onclick = () => {
  const g = (k) => (data[k] || "").trim();
  const combos = [];
  const push = (parts) => { const p = parts.filter(Boolean); if (p.length >= 2) combos.push(p.map(x => `"${x}"`).join(" AND ")); };
  ["tr", "en", "de"].forEach(l => {
    push([g(`s4.konu.${l}`), g(`s4.grup.${l}`)]);
    push([g(`s4.konu.${l}`), g(`s4.odak.${l}`)]);
    push([g(`s4.konu.${l}`), g(`s4.grup.${l}`), g(`s4.odak.${l}`)]);
    push([g(`s4.konu.${l}`), g(`s4.baglam.${l}`)]);
  });
  const uniq = [...new Set(combos)];
  const el = $("#komboList");
  if (!uniq.length) { el.innerHTML = '<p class="hint">Önce en az iki hücre doldurun.</p>'; return; }
  data["s4.kombolar"] = uniq; queueSave();
  el.innerHTML = "<h3>Denenecek kombinasyonlar</h3>" + uniq.map(c => `
    <div class="lit-result" style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <code style="font-size:.82rem">${esc(c)}</code>
      <button class="btn sm acc" data-q="${esc(c)}" type="button">Bu sorguyla ara →</button>
    </div>`).join("");
  el.querySelectorAll("button").forEach(b => b.onclick = () => {
    $("#litQuery").value = b.dataset.q.replace(/"/g, "");
    goStage(5); searchLiterature();
  });
};

// ------------------------------------------------------------
// AŞAMA 5: OpenAlex literatür araması
// ------------------------------------------------------------
function reconstructAbstract(inv) {
  if (!inv) return "";
  const words = [];
  for (const [w, positions] of Object.entries(inv))
    positions.forEach(p => words[p] = w);
  return words.join(" ");
}

async function searchLiterature() {
  const q = $("#litQuery").value.trim();
  if (!q) return;
  const box = $("#litResults");
  box.innerHTML = '<p class="hint">Aranıyor…</p>';
  // Arama kaydını tut (danışman istatistikleri için)
  logSearch(q);
  try {
    let url = `https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=8&sort=relevance_score:desc`;
    const year = $("#litYear").value;
    if (year) url += `&filter=from_publication_date:${year}-01-01`;
    if (OPENALEX_MAILTO && !OPENALEX_MAILTO.includes("ornek@")) url += `&mailto=${encodeURIComponent(OPENALEX_MAILTO)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("OpenAlex yanıt vermedi (" + res.status + ")");
    const json = await res.json();
    const works = json.results || [];
    if (!works.length) { box.innerHTML = '<p class="hint">Sonuç bulunamadı. Sorguyu sadeleştirmeyi veya İngilizce aramayı deneyin.</p>'; return; }
    box.innerHTML = works.map((w, i) => {
      const authors = (w.authorships || []).slice(0, 3).map(a => a.author?.display_name).filter(Boolean).join(", ")
        + ((w.authorships || []).length > 3 ? " vd." : "");
      const venue = w.primary_location?.source?.display_name || "";
      const abs = reconstructAbstract(w.abstract_inverted_index);
      const link = w.doi || w.primary_location?.landing_page_url || w.id;
      const oa = w.open_access?.is_oa ? ' · <span style="color:var(--ok);font-weight:700">Açık erişim</span>' : "";
      return `<div class="lit-result">
        <h4>${esc(w.title || "Başlıksız")}</h4>
        <div class="meta">${esc(authors)} · ${w.publication_year || "?"} · ${esc(venue)} · Atıf: ${w.cited_by_count ?? 0}${oa}</div>
        ${abs ? `<div class="abs" id="abs${i}">${esc(abs)}</div>` : '<div class="hint">Özet mevcut değil.</div>'}
        <div class="lit-actions">
          <a class="btn sm ghost" href="${esc(link)}" target="_blank" rel="noopener">Kaynağa git ↗</a>
          ${abs ? `<button class="btn sm ghost" type="button" data-abs="abs${i}">Özetin tamamı</button>` : ""}
          <button class="btn sm acc" type="button" data-add="${i}">Notlarıma ekle</button>
        </div>
      </div>`;
    }).join("");
    box.querySelectorAll("[data-abs]").forEach(b => b.onclick = () =>
      document.getElementById(b.dataset.abs).classList.toggle("open"));
    box.querySelectorAll("[data-add]").forEach(b => b.onclick = () => {
      const w = works[+b.dataset.add];
      const authors = (w.authorships || []).slice(0, 3).map(a => a.author?.display_name).filter(Boolean).join(", ");
      addLitRow({
        kaynak: `${authors} (${w.publication_year || "?"}). ${w.title || ""}. ${w.primary_location?.source?.display_name || ""}. ${w.doi || ""}`.trim(),
        amac: "", yontem: "", bulgu: "", anlam: ""
      });
      b.textContent = "Eklendi ✓"; b.disabled = true;
    });
  } catch (err) {
    box.innerHTML = `<p class="msg err" style="display:block">Arama başarısız: ${esc(err.message)}</p>`;
  }
}
$("#litSearchBtn").onclick = searchLiterature;
$("#litQuery").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); searchLiterature(); } });

async function logSearch(q) {
  try {
    await setDoc(doc(db, "submissions", uid), {
      aramalar: arrayUnion({ q, t: Date.now() })
    }, { merge: true });
  } catch (e) { /* sessiz */ }
}

// Literatür notu satırları
function addLitRow(row) {
  const arr = data["s5.kaynaklar"] || [];
  arr.push(row);
  data["s5.kaynaklar"] = arr;
  renderLitRows(); queueSave();
}
$("#litAddRow").onclick = () => addLitRow({ kaynak: "", amac: "", yontem: "", bulgu: "", anlam: "" });

function renderLitRows() {
  const tbody = $("#litRows");
  const arr = data["s5.kaynaklar"] || [];
  tbody.innerHTML = "";
  if (!arr.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="hint">Henüz kaynak eklenmedi.</td></tr>'; return;
  }
  arr.forEach((r, i) => {
    const tr = document.createElement("tr");
    const cell = (f) => `<td><textarea data-i="${i}" data-f="${f}">${esc(r[f] || "")}</textarea></td>`;
    tr.innerHTML = cell("kaynak") + cell("amac") + cell("yontem") + cell("bulgu") + cell("anlam") +
      `<td><button class="btn sm danger" type="button" data-del="${i}">✕</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll("textarea").forEach(ta => ta.addEventListener("input", () => {
    data["s5.kaynaklar"][+ta.dataset.i][ta.dataset.f] = ta.value; queueSave();
  }));
  tbody.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
    data["s5.kaynaklar"].splice(+b.dataset.del, 1); renderLitRows(); queueSave();
  });
}

// ------------------------------------------------------------
// GENEL GİRDİ BAĞLAMA VE OTOMATİK KAYIT
// ------------------------------------------------------------
function restoreInputs() {
  $$("[data-k]").forEach(el => { if (data[el.dataset.k] != null) el.value = data[el.dataset.k]; });
  // s8.tip önerisini tetikle
  document.querySelector('[data-k="s8.tip"]').dispatchEvent(new Event("change"));
  // kombinasyonlar
  if ((data["s4.kombolar"] || []).length) $("#komboBtn").click();
}

function bindAutosave() {
  $$("[data-k]").forEach(el => {
    el.addEventListener("input", () => { data[el.dataset.k] = el.value; queueSave(); });
    el.addEventListener("change", () => { data[el.dataset.k] = el.value; queueSave(); });
  });
}

const saveState = (cls, text) => { const el = $("#saveState"); el.className = "savestate " + cls; el.textContent = text; };
const doSave = async () => {
  saveState("saving", "Kaydediliyor…");
  try {
    await setDoc(doc(db, "submissions", uid), {
      data,
      ogrenci: `${profile.ad} ${profile.soyad}`.trim(),
      email: profile.email,
      program: profile.program || "",
      progress: updateProgress(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    saveState("saved", "Kaydedildi ✓");
  } catch (e) {
    console.error(e); saveState("", "Kaydedilemedi!");
  }
};
const queueSave = debounce(doSave, 1200);

// ------------------------------------------------------------
// AŞAMA 11: otomatik doldurma, önizleme, dışa aktarma
// ------------------------------------------------------------
$("#ozetDoldur").onclick = () => {
  const set = (k, v) => { if (v && !(data[k] || "").trim()) { data[k] = v; const el = document.querySelector(`[data-k="${k}"]`); if (el) el.value = v; } };
  set("s11.alan", (data["s1.alanlar"] || [])[0] || "");
  set("s11.konu", data["s2.konuCumlesi"]);
  set("s11.problem", data["s3.paragraf"]);
  set("s11.bosluk", data["s6.paragraf"]);
  set("s11.ana", data["s7.ana"]);
  set("s11.alt", [data["s7.alt1"], data["s7.alt2"], data["s7.alt3"]].filter(x => (x || "").trim()).map((s, i) => `${i + 1}. ${s}`).join("\n"));
  set("s11.yontem", [data["s8.yontem"], data["s8.gerekce"]].filter(Boolean).join(" — "));
  set("s11.veriKaynagi", data["s8.veriKaynagi"] || data["s9.veri"]);
  set("s11.pilotNotu", data["s10.gozlem"]);
  set("s11.kaynakca", (data["s5.kaynaklar"] || []).map((r, i) => `${i + 1}. ${r.kaynak}`).filter(x => x.length > 4).join("\n"));
  queueSave();
};

function ozetHTML() {
  const g = (k) => esc(data[k] || "—").replace(/\n/g, "<br>");
  const row = (t, k) => `<h3 style="margin:14px 0 2px;font-size:11pt;border-bottom:1px solid #ccc">${t}</h3><p style="margin:2px 0 8px">${g(k)}</p>`;
  return `
    <h2>Araştırma Fikri Özeti</h2>
    <p><b>Öğrenci:</b> ${esc(profile.ad + " " + profile.soyad)} &nbsp; <b>Program:</b> ${esc(profile.program || "—")} &nbsp; <b>Tarih:</b> ${new Date().toLocaleDateString("tr-TR")}</p>
    ${row("Geçici başlık", "s11.baslik")}
    ${row("Genel alan", "s11.alan")}
    ${row("Daraltılmış konu", "s11.konu")}
    ${row("Problem", "s11.problem")}
    ${row("Literatür boşluğu", "s11.bosluk")}
    ${row("Amaç", "s11.amac")}
    ${row("Ana araştırma sorusu", "s11.ana")}
    ${row("Alt sorular", "s11.alt")}
    ${row("Yöntem ve gerekçesi", "s11.yontem")}
    ${row("Veri kaynağı", "s11.veriKaynagi")}
    ${row("Ön araştırmadan çıkan not", "s11.pilotNotu")}
    ${row("Beklenen katkı", "s11.katki")}
    ${row("İlk kaynakça", "s11.kaynakca")}
    <p style="margin-top:16px;font-size:9pt;color:#666">Bu belge kesin tez konusu değil, danışmanla tartışılacak bir başlangıç belgesidir.</p>`;
}

$("#ozetOnizle").onclick = () => {
  const p = $("#ozetPreview");
  p.innerHTML = ozetHTML();
  p.style.display = "block";
  p.scrollIntoView({ behavior: "smooth" });
};

$("#ozetIndir").onclick = () => {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
    <head><meta charset="utf-8"><title>Araştırma Fikri Özeti</title>
    <style>body{font-family:'Times New Roman',serif;font-size:11pt;line-height:1.4}h2{font-size:14pt}</style></head>
    <body>${ozetHTML()}</body></html>`;
  const blob = new Blob(["\ufeff" + html], { type: "application/msword;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const ad = `${profile.ad}_${profile.soyad}`.replace(/\s+/g, "_") || "ogrenci";
  a.download = `Arastirma_Fikri_Ozeti_${ad}.doc`;
  a.click(); URL.revokeObjectURL(a.href);
};

$("#ozetYazdir").onclick = () => {
  $("#ozetOnizle").click();
  setTimeout(() => window.print(), 300);
};
