# Tahap Lanjutan QA Password Recovery — Simulasi Handler (2026-11-10)

**Status:** Pengujian isolasi terhadap Edge Function sebenarnya, dengan dependensi Supabase dan Cloudflare dibuat tiruan (mock). Tidak ada koneksi ke Supabase produksi, tidak ada password pengguna yang diubah, tidak ada deploy.

## Perubahan
- `supabase/functions/password-recovery/index.ts`: action `reissue` hanya dapat dipanggil oleh Admin aktif pada status `failed`, `expired`, `awaiting_delivery`, atau `delivered`. Permintaan di-*claim* dari status sebelumnya agar dua Admin tidak mengeluarkan password secara bersamaan. Target harus berada dalam status pemulihan terkunci, kecuali kegagalan sebelum profil sempat dikunci. Pembuatan ulang password baru akan mengganti password sebelumnya dan memulai jendela 24 jam baru.
- `password-recovery.js`: panel Admin menambahkan `Terbitkan ulang` dengan verifikasi identitas dan konfirmasi sebelum mengeksekusi.
- Perbaikan bug HMAC: `crypto.subtle.importKey` sekarang menggunakan `{name:"HMAC",hash:"SHA-256"}`.
- `tests/password-recovery-mock-integration.cjs`: menjalankan handler nyata yang ditranspilasi dari TypeScript, menggunakan mock untuk Supabase Auth, database, dan Turnstile.

## Hasil simulasi otomatis

| Skenario | Hasil |
|---|---|
| CAPTCHA kosong | PASS: ditolak HTTP 400 |
| CAPTCHA salah | PASS: ditolak HTTP 400 |
| Pengguna tidak diketahui setelah CAPTCHA valid | PASS: respons generik, tanpa bocor identitas |
| Aksi Admin tanpa bearer JWT | PASS: ditolak HTTP 401 |
| Aksi Admin dengan JWT salah | PASS: ditolak HTTP 401 |
| TL mencoba approve reset | PASS: ditolak HTTP 403 |
| Admin reissue reset gagal untuk TL terkunci | PASS: password baru dibuat, status `awaiting_delivery` |
| Password sudah lewat 24 jam | PASS: rotasi ditolak HTTP 410 |
| Admin reissue setelah kedaluwarsa | PASS: jendela baru dan password baru |
| TL mengganti password setelah reissue | PASS: profil kembali aktif dan request `completed` |

**CI PASS:** https://github.com/sepriseprisepri/tl-sepri/actions/runs/42751057522

## Batas bukti dan isu tersisa

Pengujian ini bukan *full stack integration test*. Data SQL/Edge/Cloudflare belum dijalankan pada Supabase lokal maupun project staging. Tetap **NO-GO untuk produksi** sampai:

1. Jalankan migration draft + guard RLS pada Supabase lokal dengan akun dummy.
2. Uji benar-benar sebagai `anon`/`authenticated` bahwa tabel antrean reset dan fungsi rate limiting tidak bisa diakses dari browser.
3. Verifikasi tiap RLS/RPC menolak JWT akun `must_change_password=true`, termasuk sesi lama.
4. Uji dua Admin approve/reissue bersamaan pada PostgreSQL nyata, reissue saat password tidak lagi bisa disalurkan, dan kegagalan parsial update Auth vs status DB.
5. Daftarkan domain + localhost di Cloudflare Turnstile; simpan `TURNSTILE_SECRET_KEY`, `PASSWORD_RECOVERY_IP_SALT` di server; atur `SAMSUNG_TURNSTILE_SITE_KEY` publik di deployment setelah lolos QA.
6. Hardening sumber fingerprint IP harus menggunakan reverse proxy terpercaya; header `x-forwarded-for` tidak boleh diasumsikan dapat dipercaya.
7. Tetapkan jalur Admin untuk menangani request berstatus `processing` yang macet dan permintaan ganda. Pelajari audit tanpa menampilkan rahasia.
8. Uji login EC dan TL beserta rotasi terhadap Supabase Auth sungguhan di lingkungan terisolasi.
9. Jaga PR #28 draft dan jangan deploy produksi tanpa persetujuan final pemilik.

## Eksekusi lokal di Windows

Jika staging lokal nanti diaktifkan, ambil tooling yang telah disiapkan di branch `feat/ec-tl-sales-ux-nov2026/staging-local/`. **Belum dibuktikan berjalan di Windows lokal milik pemilik project**. Alternatif menjalankan tests tanpa database:

```powershell
git fetch origin
git switch feat/admin-approved-password-recovery
git pull --ff-only origin feat/admin-approved-password-recovery
node tests/password-recovery-smoke.cjs
node tests/password-recovery-mock-integration.cjs
```

Perintah ini hanya menguji kode tanpa password nyata dan tanpa koneksi ke Supabase.
