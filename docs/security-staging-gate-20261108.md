# Samsung Kalteng / TL SEPRI — Supabase Staging & Security Gate
**Audit tanggal:** 8 November 2026  
**Production project:** `xirmqdcdqpocdfqqvxmh` (`tl-sepri`, ap-southeast-1)
**Status:** READ-ONLY AUDIT COMPLETED; STAGING NOT PROVISIONED; NO PRODUCTION MUTATIONS

## Baseline yang terbukti di produksi

- `list_projects`: hanya satu proyek Supabase `tl-sepri` aktif/healthy. `list_branches`: kosong.
- Seluruh **18/18** tabel publik yang ditemukan memiliki RLS aktif.
- Lima fungsi `public` berikut `SECURITY DEFINER`, dapat `EXECUTE` oleh `authenticated`, tetapi **tidak** oleh `anon`: `can_access_store(uuid)`, `can_manage_targets()`, `commit_master_database(jsonb)`, `current_app_role()`, `is_admin()`.
- Policy `sales_promos_read_verified` memerlukan role aktif dan `published`, `verification_state='verified'`, `verified_at IS NOT NULL` serta cakupan nasional/toko. Policy `sales_promos_admin_manage` menulis hanya bila `is_admin()`.
- Database promo: 57 program nasional diterbitkan dan 6 draft yang ditahan pada audit terakhir.
- Security Advisor: WARN `authenticated_security_definer_function_executable` (5 fungsi), WARN `auth_leaked_password_protection` (fitur disabled).

Perlu ditegaskan: keberadaan `EXECUTE` tidak otomatis berarti eskalasi privilege. Namun permukaan RPC tetap sensitif dan harus diuji terhadap bypass otorisasi, terutama untuk `commit_master_database`.

## Analisis fungsi & larangan patch membabi buta

| Fungsi | Penggunaan / pemeriksaan awal | Risiko & tindakan aman |
|---|---|---|
| `current_app_role()` | Membaca role profil aktif; digunakan kebijakan RLS | Menghapus `EXECUTE` bisa mematahkan seluruh SELECT/RLS. Uji dependensi terlebih dahulu. |
| `is_admin()` | Evaluasi role Admin; digunakan RLS dan fungsi lain | Pertahankan sampai pendekatan helper privat dan kebijakan teruji. |
| `can_access_store(uuid)` | Cakupan EC/TL/TSO/Admin, banyak policy store | Perlu uji akses lintas toko; jangan sekadar REVOKE. |
| `can_manage_targets()` | Wrapper role Admin; cek seluruh policy yang memanggil | Jika tidak ada pemanggil langsung, tetap cek dependensi sebelum perubahan. |
| `commit_master_database(jsonb)` | Fungsi impor berprivilege; memeriksa `auth.uid()` dan profil Admin aktif pada awal fungsi | Uji anon, EC, TL, TSO, Admin nonaktif dan payload tidak sah pada staging; periksa SQL injection, `search_path`, ukuran dan validasi payload, transaksi serta audit. |

Supabase linter merekomendasikan, per fungsi: `REVOKE EXECUTE`, ubah ke `SECURITY INVOKER`, atau pertahankan izin dengan justifikasi bila memang diperlukan. Karena fungsi-fungsi ini terkait RLS, keputusan tidak boleh diterapkan seragam.

## Jalur staging dan biaya

**Belum ada staging Supabase**. Supabase Branching menghasilkan lingkungan terisolasi, tetapi bisa memerlukan fitur plan atau biaya komputasi. Jangan mengaktifkan branch, membuat proyek berbayar, menambah metode pembayaran, atau melakukan deployment database tanpa persetujuan biaya yang eksplisit dari pemilik proyek.

Pilihan:
1. **Staging lokal via Supabase CLI/Docker** untuk validasi RLS dan migrasi tanpa biaya cloud baru; perlu lingkungan kerja yang dapat menjalankan container, migrasi lengkap, serta seed data sintetis.
2. **Supabase development branch** dari proyek yang sama (jika tersedia dan biaya disetujui); gunakan project_ref staging terpisah dan jangan pernah menyalin data personal produksi.
3. **Proyek Supabase staging terpisah** bila organisasi mempunyai kapasitas gratis yang benar-benar tersedia, tetapi tetap perlu persetujuan dan migrasi awal; pertimbangkan biaya setelah kuota diverifikasi.

## Test plan staging (wajib, belum dijalankan)

**A. Struktur dan isolasi** — Pastikan URL, kunci dan project_ref staging berbeda dengan produksi. Jalankan `tests/security-staging-readonly-20261108.sql`, cocokkan tabel, RLS, fungsi serta policy. Buat fixture sintetis: akun `admin_active`, `admin_inactive`, `tso`, `tl`, `ec`, dua toko dengan penugasan terpisah, satu promo terbit dan satu draft. *Dilarang memakai identitas/penjualan riil*.

**B. Matriks akses RLS** — Uji lewat Supabase client dengan JWT masing-masing:
- Anon/tidak login: tidak dapat membaca data terlindungi, memanggil RPC berprivilege, atau memodifikasi data.
- EC: hanya data pribadi/gerai yang ditetapkan; tidak boleh UPDATE promo, target global atau master database.
- TL/TSO: hanya coverage berwenang; dilarang cross-store dan memanggil `commit_master_database` untuk menulis.
- Admin aktif: baca cakupan penuh sesuai kebijakan dan fungsi impor hanya untuk payload sah.
- Admin tidak aktif: tidak dapat membaca/menulis objek berprivilege.
- Promo nasional yang `published=true`, `verified` dan `verified_at IS NOT NULL`: terlihat konsisten bagi empat role aktif. Draft tidak terlihat pengguna selain Admin; frontend tidak memiliki tombol publish.

**C. Penyalahgunaan RPC** — Kirim payload tidak sah dan lintas toko untuk `commit_master_database` pada *staging*, dalam transaksi terisolasi yang di-rollback. Verifikasi permission denial, tidak ada perubahan yang tertinggal, audit history, status error yang aman, dan tidak ada pengungkapan rahasia.

**D. Performa & regresi** — Uji query dashboard, raw sellout, target, filter channel, alur promo, error handling, dan lint Supabase sebelum/sesudah patch. Jalankan suite GitHub yang sudah ada.

**E. Auth** — Pertimbangkan aktivasi `Leaked Password Protection` melalui konfigurasi Auth setelah memverifikasi dampak UX dan kebijakan paket. Ini bukan migrasi SQL; persetujuan konfigurasi produksi diperlukan.

## Patch Stage 1 — desain, bukan eksekusi

1. Pisahkan helper otorisasi dari permukaan API publik jika dapat dibuktikan aman: schema non-exposed, `search_path` dikunci, GRANT `USAGE` dan `EXECUTE` minimum kepada role yang benar-benar membutuhkannya. Tulis ulang policy untuk menunjuk helper baru. Uji recursive RLS dan performa.
2. `commit_master_database`: pertahankan pemeriksaan Admin aktif di awal; audit validasi item dan batas payload, tentukan apakah RPC perlu berada di schema exposed. **Jangan** ubah ke invoker tanpa meninjau hak tabel; dapat mematahkan impor.
3. Siapkan migrasi terpisah, reviewer, snapshot dan hasil staging. Production apply hanya setelah hasil matriks uji lulus dan disetujui.

## Rollback yang harus tersedia sebelum patch

- Ekspor definisi fungsi, grant, seluruh policy, dan metadata dari *staging* sebelum patch. Catat checksum migrasi.
- Bila akses yang sah terputus, kembalikan definisi fungsi dan policy persis dari snapshot (di staging terlebih dulu), lalu jalankan ulang tes anon/EC/TL/TSO/Admin.
- Jangan rollback dengan `DISABLE ROW LEVEL SECURITY` atau membuka `EXECUTE` untuk `PUBLIC`.
- Setiap rollback produksi harus disetujui, sempit cakupannya dan menyertakan pengujian pasca-rollback.

## Kriteria exit

- Ada `project_ref` staging yang bukan produksi serta fixture sintetis.
- Audit RLS, Auth, dan seluruh matriks role via JWT lulus.
- Semua 5 risiko fungsi punya keputusan yang terdokumentasi; tidak ada peningkatan akses data lintas role.
- Peringatan password leak ditangani atau risikonya diterima secara eksplisit.
- CI + test end-to-end lulus; migration & rollback teruji sebelum perubahan produksi.

**Referensi:** https://supabase.com/docs/guides/observability/advisors?lint=0029_authenticated_security_definer_function_executable ; https://supabase.com/docs/guides/deployment/branching ; https://supabase.com/docs/guides/local-development/testing/overview
