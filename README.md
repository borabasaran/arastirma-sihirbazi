# Araştırma Konusu Geliştirme Sihirbazı

Doktora öğrencilerinin bir ilgi alanını **11 aşamada** araştırılabilir bir konu fikrine dönüştürmesini sağlayan web platformu. "Yaz Dönemi Akademik Araştırma Konusu Geliştirme Rehberi" Word taslağının birebir web uyarlamasıdır.

**Bileşenler**

| Dosya | İşlev |
|---|---|
| `index.html` | Öğrenci uygulaması: giriş/kayıt + 11 aşamalı sihirbaz + literatür araması + Word çıktısı |
| `danisman.html` | Danışman paneli: kayıt onayı, çalışma görüntüleme, istatistikler, seçenek düzenleme |
| `firestore.rules` | Firestore güvenlik kuralları |
| `js/firebase-config.js` | **Sizin dolduracağınız** Firebase anahtarları |

**Mimari:** GitHub Pages (statik barındırma) + Firebase ücretsiz Spark planı (Auth + Firestore) + OpenAlex API (literatür — ücretsiz, anahtar gerektirmez, gerçek DOI ve özet döner).

---

## Kurulum (yaklaşık 20 dakika)

### 1. Firebase projesi oluşturun

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project** → örn. `arastirma-sihirbazi` (Analytics kapatılabilir).
2. Sol menü **Build → Authentication → Get started → Email/Password** → etkinleştirin.
3. **Build → Firestore Database → Create database** → *Production mode* → bölge `europe-west1` uygundur.
4. Proje ana sayfasında **Web** simgesine (`</>`) tıklayın, uygulamayı kaydedin; çıkan `firebaseConfig` bloğundaki değerleri **`js/firebase-config.js`** dosyasına yapıştırın. Aynı dosyadaki `OPENALEX_MAILTO` alanına kendi e-postanızı yazın.

### 2. Güvenlik kurallarını yükleyin

Firestore → **Rules** sekmesi → `firestore.rules` dosyasının içeriğini yapıştırın → **Publish**.

### 3. Kendinizi danışman olarak tanımlayın (tek seferlik)

Firestore → **Data** sekmesi:

1. **Start collection** → Collection ID: `config`
2. Document ID: `app`
3. Alan ekleyin: **Field** = `advisorEmails`, **Type** = `array`, ilk öğe olarak kendi e-postanızı yazın (panele gireceğiniz hesap).
4. **Save**.

> Diğer danışman e-postalarını daha sonra panelin **Ayarlar** sekmesinden ekleyebilirsiniz.

### 4. GitHub Pages'i etkinleştirin

Depo sayfasında **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**. Birkaç dakika içinde site şu adreste yayında olur:

```
https://borabasaran.github.io/arastirma-sihirbazi/
```

### 5. Firebase'e alan adını tanıtın

Firebase konsolu → **Authentication → Settings → Authorized domains → Add domain** → `borabasaran.github.io` ekleyin. (Aksi halde GitHub Pages üzerinden giriş engellenir.)

### 6. Danışman hesabınızı oluşturun

`.../danisman.html` adresine gidin. İlk girişte hesabınız yoksa önce **öğrenci sayfasından** (index.html → Kayıt ol) aynı e-postayla bir hesap açın; e-postanız `advisorEmails` listesinde olduğu için panel sizi danışman olarak tanır (öğrenci onay ekranı sizi etkilemez, panel yalnızca e-posta listesine bakar).

---

## Kullanım akışı

1. **Öğrenci** siteden kayıt olur → durumu "onay bekliyor".
2. **Danışman** panelde *Öğrenciler* sekmesinden **Onayla** der; isterse tek tıkla hazır onay e-postası açılır (mailto).
3. Öğrenci giriş yapar; 11 aşamayı doldurur. Tüm girdiler **1,2 sn gecikmeli otomatik kaydedilir** (sağ üstte "Kaydedildi ✓").
4. **Aşama 4**'te sistem TR/EN/DE anahtar kelimelerden arama kombinasyonları üretir; **"Bu sorguyla ara"** düğmesi doğrudan Aşama 5'teki literatür aramasını başlatır.
5. **Aşama 5**'te OpenAlex'ten gerçek makaleler gelir (başlık, yazarlar, yıl, dergi, atıf sayısı, DOI bağlantısı, özet). "Notlarıma ekle" kaynağı okuma notları tablosuna taşır. Her arama danışman istatistiklerine kaydedilir.
6. **Aşama 11**'de "Önceki aşamalardan otomatik doldur" özeti derler; öğrenci **Word (.doc)** olarak indirir veya yazdırır.
7. **Danışman** panelden her öğrencinin tüm aşama verilerini görüntüler, CSV indirir, istatistikleri izler ve *Ayarlar* sekmesinden alan havuzunu kendi disiplinine göre düzenler (başka bölümlerden meslektaşlar için).

## Sık sorulanlar

**Firebase ücretli mi?** Spark (ücretsiz) planı bu ölçek için fazlasıyla yeterlidir (50 bin okuma/gün, 20 bin yazma/gün). Kredi kartı gerekmez.

**Onay e-postası otomatik gidebilir mi?** Ücretsiz katmanda sunucu tarafı e-posta yoktur; panel bunun yerine hazır metinli `mailto:` bağlantısı açar. Tam otomasyon isterseniz [EmailJS](https://www.emailjs.com) ücretsiz katmanı panele eklenebilir.

**API anahtarı herkese görünür, sorun mu?** Firebase web anahtarları gizli değildir; güvenlik Firestore kurallarıyla sağlanır (bu depodaki `firestore.rules` bunu yapar). Yine de Firebase konsolundan *App Check* veya alan kısıtlaması eklenebilir.

**Veriler kime ait?** Tümü sizin Firebase projenizde durur; panelden CSV olarak dışa aktarılabilir.
