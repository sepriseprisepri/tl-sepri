# Samsung Kalteng — staging Supabase lokal (Windows)

Lingkungan ini **hanya di PC Windows**. Tidak memakai kuota project Supabase Free/cloud dan tidak menyalin database produksi. Ini melengkapi, bukan mengganti, website `samsung-kalteng` yang berjalan.

## Prasyarat

- Windows 10/11, Docker Desktop (WSL2 engine aktif, Docker sudah berjalan), Node.js LTS + npm.
- Ruang disk cukup untuk image Docker; dokumentasi Supabase menyarankan RAM **minimal sekitar 7 GB** untuk seluruh layanan.
- Koneksi internet pada kali pertama untuk mengunduh CLI dan image Docker.

## Mulai (PowerShell)

Clone branch pengembangan bila belum ada:

```powershell
git clone https://github.com/sepriseprisepri/tl-sepri.git
cd tl-sepri
git switch feat/ec-tl-sales-ux-nov2026
```

Jika repository sudah ada, lakukan `git fetch origin` dan beralih ke branch tersebut, **jangan menimpa perubahan lokal tanpa backup**.

Jalankan dari root repository:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\staging-local\Start-Staging.ps1
```

Skrip otomatis (1) memeriksa Docker dan Node, (2) membuat jaringan Docker `samsung-kalteng-local` yang mengikat port pada **127.0.0.1**, (3) menjalankan `supabase init` di **folder staging-local**, (4) menjalankan `supabase start --network-id`, (5) menampilkan status.

**Penting:** Script tidak menjalankan `supabase login`, `link`, `db push`, `db pull`, `migration up --linked`, maupun API cloud. Hanya stack Supabase lokal. Gunakan data dummy, bukan pengguna/IMEI/penjualan riil.

Akses saat port default tersedia:

| Layanan | Alamat lokal |
| --- | --- |
| Supabase Studio | http://127.0.0.1:54323 |
| Supabase API | http://127.0.0.1:54321 |
| PostgreSQL | 127.0.0.1:54322 |
| Email test (Mailpit) | http://127.0.0.1:54324 |

Tampilkan nilai koneksi yang benar menggunakan `Status-Staging.ps1`; port bisa berbeda bila config diubah.

## Cek dan hentikan

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\staging-local\Status-Staging.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\staging-local\Stop-Staging.ps1
```

Perintah Stop tidak menghapus volume/data; **tidak memakai** opsi `--all` atau `--no-backup`.

## Pengujian fitur Samsung

Tahap pertama hanya menghidupkan stack database kosong. **Belum ada tabel Samsung atau akun EC/TL otomatis**. Sebelum menerapkan SQL dalam `docs/sql/`, lakukan hal-hal berikut:

1. Siapkan baseline skema dan fungsi yang diperlukan dari definisi yang telah ditinjau, tanpa menarik data/kredensial produksi.
2. Siapkan fixtures **dummy**: role Admin/TL/EC, dua toko, dua EC, target periode, model, penugasan.
3. Jalankan dan review draft `docs/sql/20261110-focus-model-ec-allocations-draft.sql` dan `docs/sql/20261110-competitor-same-day-corrections-draft.sql` **hanya pada lokal**. Draft kedua memerlukan tabel dasar competitor; jangan dieksekusi sebelum dependensi terpenuhi.
4. Jalankan semua skenario pada `docs/focus-model-staging-validation-20261110.md`, termasuk dua sesi TL menulis bersamaan. Pemeriksaan terhadap mock saja tidak menggantikan RLS test nyata.
5. Untuk menguji frontend, gunakan konfigurasi **khusus localhost**, API URL lokal dan publishable/anon key hasil `supabase status`. Jangan pernah menaruh service_role key di browser atau commit file `.env`.

Staging lokal tidak mempunyai koneksi otomatis dengan website Vercel. Jangan mengubah env production.

## Biaya dan batasan

Supabase CLI lokal gratis dan tidak mengonsumsi slot project Free di cloud. Docker Desktop dapat memiliki persyaratan lisensi berbeda untuk organisasi tertentu. Kinerja memerlukan RAM/disk dan dapat memakai internet untuk mengunduh image.

## Referensi

- https://supabase.com/docs/guides/local-development
- https://supabase.com/docs/guides/local-development/cli/getting-started
- https://github.com/supabase/cli/releases
