// ============================================================
// Danışman paneli
// ============================================================
import {
  auth, db, onAuthStateChanged, signOut, signInWithEmailAndPassword,
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs,
  DEFAULT_OPTIONS, getAppConfig, esc, fmtDate, authError
} from "./common.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let users = [];       // {id, ...profil}
let subs = [];        // {id, ...çalışma}
let appCfg = null;

function msg(text, cls = "info") {
  const el = $("#authMsg");
  el.className = "msg" + (text ? " " + cls : "");
  el.textContent = text;
}

$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  msg("Giriş yapılıyor…");
  try {
    await signInWithEmailAndPassword(auth, $("#loginEmail").value.trim(), $("#loginPass").value);
  } catch (err) { msg(authError(err), "err"); }
};
$("#logoutBtn").onclick = () => signOut(auth);

// E-postaları büyük/küçük harf ve boşluk farkından bağımsız karşılaştır
const normEmail = (e) => String(e || "").trim().toLowerCase();

// Yetkili danışman e-postaları — doğrudan koda gömülü (veritabanına bağımlı değil).
// Yeni danışman eklemek için bu listeye satır ekleyin.
const ADVISOR_EMAILS = [
  "bbasaran@anadolu.edu.tr"
].map(normEmail);

onAuthStateChanged(auth, async (user) => {
  if (!user) { $("#authScreen").hidden = false; $("#panelScreen").hidden = true; return; }
  const me = normEmail(user.email);
  if (!ADVISOR_EMAILS.includes(me)) {
    msg("Bu hesap danışman olarak yetkilendirilmemiş: " + user.email, "err");
    await signOut(auth);
    return;
  }
  // config/app varsa seçenek listelerini oku (yoksa varsayılanlar kullanılır)
  try {
    const snap = await getDoc(doc(db, "config", "app"));
    appCfg = snap.exists() ? snap.data() : {};
  } catch (err) { appCfg = {}; }
  $("#whoAmI").textContent = user.email;
  $("#authScreen").hidden = true;
  $("#panelScreen").hidden = false;
  await loadAll();
});

// ------------------------------------------------------------
// SEKME GEZİNMESİ
// ------------------------------------------------------------
$$(".panel-tabs button").forEach(b => b.onclick = () => {
  $$(".panel-tabs button").forEach(x => x.classList.toggle("active", x === b));
  ["ogrenciler", "calismalar", "istatistik", "ayarlar"].forEach(t =>
    $("#tab-" + t).hidden = (t !== b.dataset.tab));
});

// ------------------------------------------------------------
// VERİ YÜKLEME
// ------------------------------------------------------------
async function loadAll() {
  const [uSnap, sSnap] = await Promise.all([
    getDocs(collection(db, "users")),
    getDocs(collection(db, "submissions"))
  ]);
  users = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  subs = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderUsers();
  renderSubs();
  renderStats();
  renderOptions();
}

// ------------------------------------------------------------
// ÖĞRENCİLER SEKMESİ
// ------------------------------------------------------------
const BADGE = { pending: ["pending", "Onay bekliyor"], approved: ["approved", "Onaylı"], rejected: ["rejected", "Reddedildi"] };

function mailtoLink(u, approved) {
  const subject = approved
    ? "Araştırma Sihirbazı — kaydınız onaylandı"
    : "Araştırma Sihirbazı — kaydınız hakkında";
  const body = approved
    ? `Sayın ${u.ad} ${u.soyad},\n\nAraştırma Konusu Geliştirme Sihirbazı'ndaki kaydınız onaylanmıştır. Aşağıdaki adresten e-posta ve şifrenizle giriş yapabilirsiniz:\n\n${location.origin}${location.pathname.replace("danisman.html", "")}\n\nÇalışmalarınızda başarılar dilerim.`
    : `Sayın ${u.ad} ${u.soyad},\n\nAraştırma Sihirbazı kaydınızla ilgili olarak...`;
  return `mailto:${encodeURIComponent(u.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function renderUsers() {
  const order = { pending: 0, approved: 1, rejected: 2 };
  const sorted = [...users].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
  $("#userList").innerHTML = `
    <table class="t"><thead><tr>
      <th>Ad Soyad</th><th>E-posta</th><th>Program</th><th>Kayıt</th><th>Durum</th><th style="width:300px">İşlem</th>
    </tr></thead><tbody>` +
    (sorted.length ? sorted.map(u => {
      const [cls, lab] = BADGE[u.status] || ["", u.status];
      return `<tr>
        <td><b>${esc(u.ad)} ${esc(u.soyad)}</b></td>
        <td>${esc(u.email)}</td>
        <td>${esc(u.program || "—")}</td>
        <td>${fmtDate(u.createdAt)}</td>
        <td><span class="badge ${cls}">${lab}</span></td>
        <td>
          ${u.status !== "approved" ? `<button class="btn sm ok" data-act="approve" data-id="${u.id}">Onayla</button>` : ""}
          ${u.status !== "rejected" ? `<button class="btn sm danger" data-act="reject" data-id="${u.id}">Reddet</button>` : ""}
          <a class="btn sm ghost" href="${mailtoLink(u, u.status === "approved")}">E-posta gönder</a>
          <button class="btn sm ghost" data-act="delete" data-id="${u.id}">Sil</button>
        </td></tr>`;
    }).join("") : '<tr><td colspan="6" class="hint">Henüz kayıtlı kullanıcı yok.</td></tr>') +
    "</tbody></table>";

  $("#userList").querySelectorAll("[data-act]").forEach(b => b.onclick = async () => {
    const u = users.find(x => x.id === b.dataset.id);
    if (b.dataset.act === "delete") {
      if (!confirm(`${u.email} kullanıcısını ve profilini silmek istiyor musunuz?`)) return;
      await deleteDoc(doc(db, "users", u.id));
    } else {
      const status = b.dataset.act === "approve" ? "approved" : "rejected";
      await updateDoc(doc(db, "users", u.id), { status });
      if (status === "approved" && confirm("Onaylandı. Öğrenciye bildirim e-postası hazırlansın mı?"))
        window.location.href = mailtoLink(u, true);
    }
    await loadAll();
  });
}

// ------------------------------------------------------------
// ÇALIŞMALAR SEKMESİ
// ------------------------------------------------------------
function renderSubs() {
  const sorted = [...subs].sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
  $("#subList").innerHTML = `
    <table class="t"><thead><tr>
      <th>Öğrenci</th><th>Daraltılmış konu</th><th>İlerleme</th><th>Arama</th><th>Son güncelleme</th><th></th>
    </tr></thead><tbody>` +
    (sorted.length ? sorted.map(s => `
      <tr>
        <td><b>${esc(s.ogrenci || s.email || s.id)}</b><br><small class="muted">${esc(s.email || "")}</small></td>
        <td style="max-width:340px">${esc((s.data?.["s2.konuCumlesi"] || "—").slice(0, 140))}</td>
        <td><b>%${s.progress ?? 0}</b></td>
        <td>${(s.aramalar || []).length}</td>
        <td>${fmtDate(s.updatedAt)}</td>
        <td><button class="btn sm" data-view="${s.id}">Görüntüle</button></td>
      </tr>`).join("") : '<tr><td colspan="6" class="hint">Henüz çalışma yok.</td></tr>') +
    "</tbody></table>";

  $("#subList").querySelectorAll("[data-view]").forEach(b => b.onclick = () =>
    openDetail(subs.find(x => x.id === b.dataset.view)));
}

const SEC = [
  ["1. İlgi alanları", d => (d["s1.alanlar"] || []).join("; ")],
  ["1. Gerekçeler", d => Object.entries(d["s1.detay"] || {}).map(([a, v]) => `• ${a}: ${v.neden || ""} | sorun: ${v.sorun || ""} | bağlam: ${v.baglam || ""}`).join("\n")],
  ["2. Daraltma seçimleri", d => ["hedef", "beceri", "arac", "baglam", "veri"].map(k => (d["s2." + k] || []).join(", ")).filter(Boolean).join(" · ")],
  ["2. Daraltılmış konu", d => d["s2.konuCumlesi"]],
  ["3. Problem paragrafı", d => d["s3.paragraf"]],
  ["4. Anahtar kelimeler (EN)", d => [d["s4.konu.en"], d["s4.grup.en"], d["s4.odak.en"], d["s4.baglam.en"]].filter(Boolean).join(" · ")],
  ["5. Kaynaklar", d => (d["s5.kaynaklar"] || []).map((r, i) => `${i + 1}. ${r.kaynak}`).join("\n")],
  ["6. Boşluk türleri", d => (d["s6.turler"] || []).join("; ")],
  ["6. Boşluk paragrafı", d => d["s6.paragraf"]],
  ["7. Ana soru", d => d["s7.ana"]],
  ["7. Alt sorular", d => [d["s7.alt1"], d["s7.alt2"], d["s7.alt3"]].filter(Boolean).join("\n")],
  ["8. Yöntem", d => [d["s8.yontem"], d["s8.veriKaynagi"], d["s8.gerekce"]].filter(Boolean).join(" — ")],
  ["9. Yapılabilirlik", d => [d["s9.veri"], d["s9.kimden"], d["s9.sayi"], d["s9.degerlendirme"]].filter(Boolean).join(" · ")],
  ["10. Pilot", d => [(d["s10.tur"] || []).join(", "), d["s10.deneme"], d["s10.sonuc"], d["s10.potansiyel"]].filter(Boolean).join("\n")],
  ["11. Geçici başlık", d => d["s11.baslik"]],
  ["11. Amaç", d => d["s11.amac"]],
  ["11. Beklenen katkı", d => d["s11.katki"]],
  ["11. İlk kaynakça", d => d["s11.kaynakca"]]
];

function openDetail(s) {
  const d = s.data || {};
  $("#modalBody").innerHTML = `
    <h2>${esc(s.ogrenci || s.email || "")}</h2>
    <p class="muted">%${s.progress ?? 0} ilerleme · ${(s.aramalar || []).length} literatür araması · son güncelleme ${fmtDate(s.updatedAt)}</p>
    <div class="ozet-view">` +
    SEC.map(([t, f]) => {
      const v = (f(d) || "").trim();
      return v ? `<h4>${t}</h4><p>${esc(v)}</p>` : "";
    }).join("") +
    ((s.aramalar || []).length ? `<h4>Literatür aramaları</h4><p>${esc(s.aramalar.slice(-15).map(a => a.q).join("\n"))}</p>` : "") +
    "</div>";
  $("#modalBg").classList.add("open");
}
$("#modalClose").onclick = () => $("#modalBg").classList.remove("open");
$("#modalBg").onclick = (e) => { if (e.target.id === "modalBg") $("#modalBg").classList.remove("open"); };

// CSV dışa aktarma
$("#csvBtn").onclick = () => {
  const head = ["Öğrenci", "E-posta", "İlerleme %", "Arama sayısı", "Daraltılmış konu", "Problem", "Ana soru", "Yöntem", "Geçici başlık"];
  const q = (v) => '"' + String(v ?? "").replace(/"/g, '""').replace(/\n/g, " ") + '"';
  const rows = subs.map(s => {
    const d = s.data || {};
    return [s.ogrenci, s.email, s.progress ?? 0, (s.aramalar || []).length,
      d["s2.konuCumlesi"], d["s3.paragraf"], d["s7.ana"], d["s8.yontem"], d["s11.baslik"]].map(q).join(";");
  });
  const blob = new Blob(["\ufeff" + head.map(q).join(";") + "\n" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "arastirma_sihirbazi_calismalar.csv";
  a.click(); URL.revokeObjectURL(a.href);
};

// ------------------------------------------------------------
// İSTATİSTİKLER
// ------------------------------------------------------------
function countBy(list) {
  const m = {};
  list.forEach(x => { if (x) m[x] = (m[x] || 0) + 1; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}
function bars(el, pairs, top = 8) {
  const max = pairs[0]?.[1] || 1;
  $(el).innerHTML = pairs.length ? pairs.slice(0, top).map(([k, v]) => `
    <div class="bar"><span class="lab">${esc(k)}</span>
      <span class="track"><span class="fill" style="width:${Math.round(v / max * 100)}%;display:block"></span></span>
      <span class="val">${v}</span></div>`).join("")
    : '<p class="hint">Veri yok.</p>';
}

function renderStats() {
  const approved = users.filter(u => u.status === "approved").length;
  const pending = users.filter(u => u.status === "pending").length;
  const totalSearches = subs.reduce((n, s) => n + (s.aramalar || []).length, 0);
  const avgProgress = subs.length ? Math.round(subs.reduce((n, s) => n + (s.progress || 0), 0) / subs.length) : 0;
  const finished = subs.filter(s => (s.progress || 0) >= 90).length;

  $("#statCards").innerHTML = [
    [users.length, "Toplam kayıt"],
    [pending, "Onay bekleyen"],
    [approved, "Onaylı öğrenci"],
    [subs.length, "Başlanan çalışma"],
    ["%" + avgProgress, "Ortalama ilerleme"],
    [finished, "Tamamlanan (≥%90)"],
    [totalSearches, "Literatür araması"]
  ].map(([n, l]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join("");

  bars("#alanStats", countBy(subs.flatMap(s => s.data?.["s1.alanlar"] || [])));
  bars("#grupStats", countBy(subs.flatMap(s => s.data?.["s2.hedef"] || [])));
  bars("#yontemStats", countBy(subs.map(s => s.data?.["s8.yontem"])));

  const searches = subs.flatMap(s => (s.aramalar || []).map(a => ({ ...a, kim: s.ogrenci || s.email })))
    .sort((a, b) => b.t - a.t).slice(0, 20);
  $("#aramaStats").innerHTML = searches.length
    ? "<table class='t'><thead><tr><th>Sorgu</th><th>Öğrenci</th><th>Zaman</th></tr></thead><tbody>" +
      searches.map(a => `<tr><td><code>${esc(a.q)}</code></td><td>${esc(a.kim)}</td><td>${new Date(a.t).toLocaleString("tr-TR")}</td></tr>`).join("") +
      "</tbody></table>"
    : '<p class="hint">Henüz arama yapılmadı.</p>';
}

// ------------------------------------------------------------
// AYARLAR
// ------------------------------------------------------------
const OPT_MAP = [
  ["optAlanlar", "alanlar"], ["optHedef", "hedefGruplar"], ["optBeceri", "beceriler"],
  ["optArac", "araclar"], ["optBaglam", "baglamlar"], ["optVeri", "veriTurleri"],
  ["optKalip", "soruKaliplari"]
];

function renderOptions() {
  const opts = { ...DEFAULT_OPTIONS, ...(appCfg?.options || {}) };
  OPT_MAP.forEach(([el, key]) => $("#" + el).value = (opts[key] || []).join("\n"));
  $("#optAdvisors").value = (appCfg?.advisorEmails || []).join("\n");
}

$("#saveOptions").onclick = async () => {
  const lines = (el) => $("#" + el).value.split("\n").map(s => s.trim()).filter(Boolean);
  const advisorEmails = lines("optAdvisors");
  if (!ADVISOR_EMAILS.includes(normEmail(auth.currentUser.email)) && !advisorEmails.map(normEmail).includes(normEmail(auth.currentUser.email))) {
    if (!confirm("Uyarı: kendi e-postanız danışman listesinde yok; kaydederseniz panele erişiminizi kaybedersiniz. Yine de devam edilsin mi?")) return;
  }
  const options = {};
  OPT_MAP.forEach(([el, key]) => options[key] = lines(el));
  try {
    await setDoc(doc(db, "config", "app"), { advisorEmails, options }, { merge: true });
    $("#optMsg").textContent = "Kaydedildi ✓";
    appCfg = await getAppConfig();
    setTimeout(() => $("#optMsg").textContent = "", 3000);
  } catch (e) {
    $("#optMsg").textContent = "Hata: " + e.message;
  }
};
