# Samsung Kalteng — Aether Command UI/UX System

## Tujuan
Menyelaraskan login, dashboard, dan modul operasional yang sudah ada menjadi sistem desain premium futuristik **tanpa membuat ulang aplikasi** atau mengubah Supabase data, RLS, login, maupun workflow penjualan.

## Visual language
| Token | Nilai | Penggunaan |
|---|---|---|
| Midnight base | `#060B15` | Background utama |
| Raised surfaces | `#0F1C2C` | Cards / sidebar |
| Electric cyan | `#56DFFC` | Fokus, tombol, active navigation |
| Electric blue | `#4988F8` | Gradient, progress amount |
| Mint | `#55E3B9` | KPI positif & valid EULA |
| Violet | `#AF91FF` | Glow sekunder, sangat terbatas |
| Muted text | `#94A9C1` | Label dan metadata |
| White text | `#ECF8FF` | Judul dan nilai KPI |

- **Headings:** Rajdhani 500/600/700, fallback Space Grotesk
- **Body:** Space Grotesk 400/500/600/700, fallback Inter/system
- **Glass surfaces:** gradien gelap + blur lembut + border tipis
- **Glows:** hanya untuk fokus, active state, dan elemen penting; jangan jadikan latar penuh neon
- **Grid + orbit dekoratif:** hanya login; dekorasi tidak memblokir klik, tidak dipakai sebagai navigasi

## Pola interaksi
1. **Login:** kartu terpusat, ID/Kode TL, password, reveal/hide dengan tombol aksesibel; error dijelaskan sebagai teks.
2. **Sidebar:** menu berdasarkan role dari data yang sudah ada, ikon SVG seragam, active state, keyboard focus, tombol menu mobile dengan `aria-expanded`, tutup via Escape.
3. **Dashboard:** header peran, intro, tombol refresh, timestamp pembacaan data terakhir dan quick actions.
4. **KPI:** coverage, target, sellout valid, achievement Amt; progress bar Qty/Amt dengan nilai dapat dibaca screen reader dan batas 0–100 untuk lebar visual. Nilai di atas 100% tetap ditampilkan di teks.
5. **Modul read-only:** panel, filter pencarian, tabel responsif dan ekspor CSV; frontend tidak memintas RLS dan tidak pernah menampilkan data di luar hasil query yang diizinkan.

## Responsive design
- `>=1024px`: sidebar fixed-width 268px, halaman konten fleksibel.
- `<=1023px`: navigation collapsible, header sticky dengan menu accessible.
- `<=639px`: typographic scale dan padding lebih ringkas, tabel scroll horizontal.
- `<=420px`: touch target navigasi disederhanakan, label tombol lebih kecil tanpa mengurangi ukuran interaksi.

## Accessibility
- Fokus terlihat pada semua kontrol.
- `prefers-reduced-motion` mematikan animasi nonesensial.
- `prefers-contrast: more` menaikkan kontras border dan label.
- Ikon navigasi `aria-hidden` karena label tetap teks.
- Elemen refresh memiliki status tekstual yang jujur: *Data dimuat pukul …*, bukan klaim data streaming real-time.

## Quality gate
- `node tests/ops-smoke.cjs` menjaga akses dan rendering modul read-only.
- `node tests/ui-regression.cjs` memeriksa struktur DOM, dependency CSS, aksesibilitas dasar, breakpoint, hook login, dan sintaks JavaScript.
- Vercel Preview READY tidak menggantikan visual QA di browser dengan ukuran layar nyata. Uji desktop, tablet, dan Android sebelum menganggap desain selesai sepenuhnya.

## Tambahan yang direkomendasikan untuk fase berikutnya
- **Data-quality alerts:** indikator mapping promoter belum lengkap, store tanpa target, transaksi pending lama. Sumber harus dari query nyata, bukan dummy.
- **Global store search:** pencarian Site ID/nama store di dalam cakupan role, bukan membuka seluruh database.
- **Saved filters & density mode:** mode tampilan tabel compact/comfortable dan filter tersimpan yang tidak memengaruhi otorisasi.
- **Aksesibilitas menyeluruh:** keyboard-only E2E, screen-reader audit, kontras WCAG 2.2 AA di semua role.
- **PWA ringan:** shell offline dan pengingat koneksi untuk petugas lapangan. Jangan cache data sensitif atau sesi di luar kontrol keamanan.

## Keamanan dan batasan
Jangan menyisipkan `service_role` ke frontend; tidak ada perubahan pada autentikasi, coverage, SQL, EC target, sellout, atau proses provisioning TL_BMU. Akses akun baru tetap membutuhkan tindakan Admin dan ganti password pertama kali. Komponen Survey/Input Sellout yang belum didukung backend resmi harus tetap diberi status placeholder, bukan tombol yang terlihat berfungsi padahal tidak.
