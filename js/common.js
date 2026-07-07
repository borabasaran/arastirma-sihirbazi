// Ortak modül: Firebase başlatma, varsayılan seçenek listeleri, yardımcılar
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export {
  onAuthStateChanged, signOut, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, sendPasswordResetEmail,
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, serverTimestamp, arrayUnion
};

// ------------------------------------------------------------
// Varsayılan seçenek listeleri (Word taslağındaki havuzlar).
// Danışman panelinden düzenlenirse Firestore'daki config/app
// belgesi bu varsayılanların yerine geçer.
// ------------------------------------------------------------
export const DEFAULT_OPTIONS = {
  alanlar: [
    "Yabancı dil öğretiminde yapay zekâ",
    "Üretken yapay zekâ ile materyal geliştirme",
    "AI destekli yazma becerisi",
    "AI destekli konuşma pratiği",
    "AI avatarlar / sanal konuşma partnerleri",
    "AI çıktılarının pedagojik değerlendirilmesi",
    "Öğretmen adaylarının dijital yeterlikleri",
    "Öğretmenlerin teknoloji kullanımı",
    "AI okuryazarlığı ve eleştirel kullanım",
    "Almanca öğretmen eğitiminde mikro yeterlilikler",
    "Ders kitabı analizi",
    "Ders kitaplarında kültür temsilleri",
    "Ders kitaplarında cinsiyet / meslek temsilleri",
    "Ders kitaplarında aile temsilleri",
    "Kültürlerarası öğrenme",
    "Dil öğreniminde motivasyon",
    "Dil öğreniminde kaygı",
    "Dil öğreniminde öz yeterlik",
    "Okuma becerisi ve metin seçimi",
    "GER / CEFR düzey belirleme",
    "Ölçme ve değerlendirme",
    "Öğrenci özerkliği ve stratejiler",
    "Çok dillilik",
    "Göç, kimlik ve dil öğrenimi",
    "Özel gereksinimli öğrenciler için yabancı dil öğretimi",
    "Müfredat / program / politika analizi"
  ],
  hedefGruplar: [
    "Almanca öğretmen adayları", "Lisans öğrencileri", "Hazırlık öğrencileri",
    "Almanca öğretmenleri", "Akademisyenler", "Ders kitabı kullanıcıları"
  ],
  beceriler: [
    "Yazma", "Konuşma", "Okuma", "Dinleme", "Materyal geliştirme",
    "Değerlendirme", "Kültür / temsil", "Motivasyon / kaygı / öz yeterlik"
  ],
  araclar: [
    "ChatGPT / Claude / Gemini", "AI avatar / konuşma botu",
    "Google Forms / çevrim içi anket", "Ders kitabı / PDF / metin",
    "Öğrenci ürünleri", "Müfredat veya program belgeleri"
  ],
  baglamlar: [
    "Almanca öğretmenliği", "Yabancı dil olarak Almanca", "Türkiye bağlamı",
    "Öğretmen eğitimi", "Lisans dersi", "Uzaktan / dijital öğrenme ortamı"
  ],
  veriTurleri: [
    "Anket", "Görüşme", "Açık uçlu yanıt", "Ders kitabı içeriği",
    "AI çıktısı", "Öğrenci ürünü", "Gözlem / günlük", "Rubrik puanlaması"
  ],
  bosluklar: [
    "Bağlam boşluğu", "Yöntem boşluğu", "Örneklem boşluğu",
    "Veri boşluğu", "Kuramsal boşluk", "Güncellik boşluğu"
  ],
  soruKaliplari: [
    "... öğrencileri / öğretmen adayları ... sürecini nasıl deneyimlemektedir?",
    "Katılımcılar ... hakkında ne düşünmektedir?",
    "Katılımcılar ... aracını hangi amaçlarla ve nasıl kullanmaktadır?",
    "... ile ... arasında nasıl bir fark bulunmaktadır?",
    "... ile ... arasında anlamlı bir ilişki var mıdır?",
    "... süreci hangi aşamalardan oluşmaktadır?",
    "... çıktılarında hangi özellikler, hatalar veya örüntüler öne çıkmaktadır?",
    "... materyallerinde ... nasıl temsil edilmektedir?"
  ],
  yontemler: [
    "Nicel", "Nitel", "Karma yöntem", "Doküman analizi",
    "İçerik analizi", "Söylem analizi", "Deneysel / yarı deneysel",
    "Rubrik değerlendirme"
  ],
  pilotSecenekleri: [
    "Mini anket (10–15 kişi, 5–8 soru)",
    "Kısa görüşme (3–5 kişi, ~10 dk)",
    "Doküman denemesi (2–3 sayfa/etkinlik kodlama)",
    "AI çıktısı denemesi (aynı görev, 2–3 araç)",
    "Literatür mini haritası (10 makale tablosu)",
    "Rubrik denemesi (3–5 çıktı üzerinde)"
  ]
};

export async function loadOptions() {
  try {
    const snap = await getDoc(doc(db, "config", "app"));
    if (snap.exists() && snap.data().options) {
      return { ...DEFAULT_OPTIONS, ...snap.data().options };
    }
  } catch (e) { console.warn("Seçenekler yüklenemedi, varsayılanlar kullanılıyor.", e); }
  return DEFAULT_OPTIONS;
}

export async function getAppConfig() {
  try {
    const snap = await getDoc(doc(db, "config", "app"));
    return snap.exists() ? snap.data() : null;
  } catch (e) { return null; }
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

export function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// Firebase Auth hata kodlarını Türkçeleştir
export function authError(e) {
  const m = {
    "auth/invalid-email": "Geçersiz e-posta adresi.",
    "auth/user-not-found": "Bu e-posta ile kayıtlı kullanıcı bulunamadı.",
    "auth/wrong-password": "Şifre hatalı.",
    "auth/invalid-credential": "E-posta veya şifre hatalı.",
    "auth/email-already-in-use": "Bu e-posta zaten kayıtlı. Giriş yapmayı deneyin.",
    "auth/weak-password": "Şifre en az 6 karakter olmalı.",
    "auth/too-many-requests": "Çok fazla deneme yapıldı. Lütfen biraz bekleyin."
  };
  return m[e.code] || ("Bir hata oluştu: " + (e.message || e.code || e));
}
