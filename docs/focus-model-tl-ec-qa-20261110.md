# Focus Model — Alokasi Individual EC oleh TL
**Samsung Kalteng / TL SEPRI** · 10 November 2026  
**Status:** Implementasi pada branch `feat/dashboard-targets-wow-insights`; **migrasi produksi belum dijalankan**.

## Alur bisnis

- **Admin** tetap membuat `focus_model_targets` sebagai plafon resmi per periode + toko + model.
- **TL** aktif dengan `coverage_assignments` berlaku dapat membagikan target Qty dan Amount kepada EC aktif yang mempunyai profil `role=ec`, `manpower.site_id` sesuai toko, dan `store_assignments` aktif pada toko yang sama.
- **EC** membaca **hanya** alokasi untuk `profiles.manpower_id` miliknya dan toko penempatan saat ini. EC tidak bisa membuat/mengubah/menghapus alokasi, melihat riwayat TL, atau membaca target EC lain.
- Kebijakan `focus_targets_read_authorized` pada tabel parent **dipersempit**: hanya Admin/TL/TSO dapat membaca target toko. EC tetap bisa membaca alokasi individual tanpa mengambil target toko di API. Ini mencegah target toko bocor melalui network inspector.
- **TL/Admin** melihat ringkasan target model toko, total Qty/Amt yang dialokasikan, sisa alokasi, realisasi VALID oleh EC teralokasi, gap, achievement dan riwayat 25 aktivitas.
- Toko dan EC di luar coverage TL tidak dapat dialokasikan; `tso` dapat membaca dalam coverage, tetapi **tidak** dapat mengubah.
- Alokasi lama setelah EC pindah toko tidak tampil kepada EC di toko baru; TL yang masih membawahi toko asal dapat **menghapus alokasi lama** untuk membebaskan plafon.
- Saat model ditutup/nonaktif, TL tidak bisa memberi target baru namun dapat menghapus alokasi lama. Periode `closed` menolak perubahan.
- Komponen frontend menangani kondisi saat tabel belum dimigrasikan dengan pesan khusus, alih-alih menampilkan seolah fitur sudah aktif.

## Aturan teknis

- `public.focus_model_ec_allocations`: kunci unik (period_id,store_id,model_code,manpower_id), FK gabungan ke parent `focus_model_targets`, CHECK Qty/Amt tidak negatif, penanggung jawab assigner dan updated_at.
- `public.focus_model_allocation_history`: append-only dari RPC, dengan Qty/Amt sebelum-sesudah, actor, timestamp dan action create/update/delete. DML via API pengguna tidak diberikan.
- `public.set_focus_model_ec_allocation(uuid,uuid,text,uuid,numeric,numeric)`: satu-satunya jalur tulis; `SECURITY DEFINER` dengan `search_path=pg_catalog,pg_temp`, eksplisit auth.uid()/current_app_role() dan verifikasi relasi. EXECUTE hanya untuk `authenticated`; anon/PUBLIC dicabut. Qty=0 dan Amt=0 menghapus hanya alokasi yang ada.
- **Serialisasi transaksi:** `SELECT FOR UPDATE` terhadap parent model store memastikan dua TL/Admin tidak dapat bersama-sama melebihi plafon Qty **atau** Amt. Trigger parent melarang Admin menurunkan target toko di bawah Qty/Amt yang sudah dialokasikan. FK RESTRICT mencegah parent dengan alokasi aktif terhapus diam-diam.
- RLS: tabel baru `ENABLE ROW LEVEL SECURITY` serta `AS RESTRICTIVE` recovery guard, pembacaan TL berdasarkan active coverage dan EC berdasarkan `manpower_id` dan toko aktif; tidak ada policy INSERT/UPDATE/DELETE langsung. Audit hanya TL/Admin/TSO dalam scope. Tidak ada service-role di frontend.
- SQL membandingkan tanggal penempatan menggunakan timezone **Asia/Pontianak**. Timestamp audit tersimpan dalam timestamptz dan disajikan WIB.
- **Perhitungan realisasi** di frontend: hanya `raw_sellout.eula_status=VALID`, tanggal periode sampai tanggal lokal berjalan, pasangan `site_id+promoter_id`, dengan model yang cocok setelah normalisasi `model_code` atau `display_name`. Jika satu alias/nama digunakan lebih dari satu kode model, transaksi dengan alias ambigu **tidak** dihitung (menghindari pencapaian ganda). Model dengan penamaan berbeda perlu mapping master yang diverifikasi. EULA PENDING tidak dihitung.
- Qty dibulatkan **hanya untuk tampilan**. Angka target/rasio dalam database dan logika perhitungan tetap presisi numerik.

## Source

- `docs/sql/20261110-focus-ec-allocations-staging.sql` — DRAFT migration.
- `focus-model-allocations.js` — Form TL, kartu EC, tabel alokasi, filter, edit/hapus dan audit.
- `ops-modules.js` — Integrasi halaman Focus Model dengan data sellout yang dibatasi RLS.
- `index.html` — Load modul frontend.
- `tests/sql/focus-allocations-bootstrap.sql` — Fixture role/profil/coverage/manpower dummy.
- `tests/sql/focus-allocations-assertions.sql` — Izin dan integritas data.
- `tests/focus-model-ui.cjs` — Simulator EC/TL UI, save RPC, target dan realisasi pribadi.
- `.github/workflows/focus-allocations-postgres.yml` — PostgreSQL 16 disposable plus race dua alokasi.
- `.github/workflows/ops-smoke.yml` — Regresi JavaScript fitur lama + baru.

## QA / release gate

- PostgreSQL 16 lokal: cek TL hanya toko sendiri, Admin, EC self-select, anon ditolak, RPC tanpa hak ditolak, Qty/Amt cap, riwayat edit/hapus, rotasi password, pindah toko, model nonaktif, parent target tidak boleh turun, dan **dua transaksi bersamaan tidak melampaui plafon**.
- UI Node.js: TL form memanggil RPC, EC tetap melihat target/realisasi pribadi meski parent focus model targets **tidak tersedia melalui RLS** (2 VALID dari 6 = 33,3%), status migrasi belum ada dapat ditangani.
- Smoke test sebelumnya (dashboard, login, promo, monitoring) tetap lulus.
- **PASS PostgreSQL 17 terisolasi** (major version sama dengan produksi): concurrency, RLS, batas target, penempatan EC yang kedaluwarsa dan audit: https://github.com/sepriseprisepri/tl-sepri/actions/runs/42853193603.
- **PASS Supabase CLI GoTrue/PostgREST lokal end-to-end**, akun dummy login JWT sungguhan, akses data melalui REST API, Admin mengisi plafon target, TL membagikan alokasi, EC tidak membaca target toko/EC lain, batas Qty/Amt, wajib rotasi password, penempatan kedaluwarsa, dan dua RPC bersamaan: https://github.com/sepriseprisepri/tl-sepri/actions/runs/42853194261.
- **PASS UI/operasional** termasuk form Admin target induk, tampilan TL/EC/TSO dan saved filters dashboard: https://github.com/sepriseprisepri/tl-sepri/actions/runs/42853193666.
- **Belum diuji pada hosted staging terpisah** karena koneksi Supabase hanya memiliki satu proyek produksi. Test local tidak mereproduksi seluruh constraints/tabel integrasi produksi.
- **Belum tersedia preview Vercel dari commit terbaru** karena kuota deployment harian sebelumnya habis. Jangan memakai preview lama sebagai bukti UI final.

## Kesiapan data bisnis (audit read-only produksi)

- Total `focus_model_targets` = **0**: saat ini belum ada plafon target toko/model yang dapat dibagikan TL.
- `focus_model_settings` aktif = **5**; `coverage_assignments` TL aktif = **129**; manpower EC aktif = **33**; akun EC aktif = **27**.
- Periode target tersedia **1 draft**. RPC alokasi mengizinkan `active` atau `draft` (bukan `closed`).
- Admin mendapat formulir **Plafon Focus Model per Toko** pada halaman Focus Model untuk memasukkan target model dan toko secara manual, melalui API dengan RLS `focus_targets_admin_manage`.
- Tidak membuat target dummy/numerik otomatis pada produksi. **Admin perlu menentukan dan menyimpan plafon sebelum TL dapat mengalokasikan.**

## Catatan pengamanan tambahan

- RLS EC alokasi membutuhkan `manpower.site_id` cocok dengan toko **dan** `store_assignments` masih berlaku pada tanggal WIB. Pengujian memutus penempatan tanpa mengubah `manpower.site_id` dan memastikan SELECT EC langsung kosong.
- TSO mendapatkan tampilan realisasi EC di wilayah baca RLS, tanpa editor alokasi dan tanpa akses audit.
- Pengujian PostgreSQL 17 menggunakan fixture terisolasi; pengujian GoTrue/PostgREST menggunakan container lokal GitHub Actions. Keduanya **tidak** memerlukan proyek Supabase/cloud berbayar.

## Deploy dan rollback (memerlukan persetujuan)

1. Backup schema dan definisi policy/function; buat staging terisolasi dari **schema-only** dan akun dummy, tanpa data pelanggan. Pastikan Auth/Store Assignments/EC profile integritas.
2. Terapkan migrasi pada staging dan jalankan tes role nyata melalui PostgREST + RPC, termasuk TL berbeda, EC berbeda, promo lama, dan UI mobile.
3. Setelah disetujui, migrasi produksi **sebelum** frontend. Verifikasi keberadaan tabel, RLS/grants dan RPC, baru deploy code dari PR #29 ke Vercel.
4. Pilot TL + EC akun uji sebelum penggunaan massal; pantau penolakan auth dan kesalahan alokasi.
5. Rollback frontend ke commit sebelum PR #29. Jangan `DROP TABLE` jika sudah ada alokasi produksi; **pertahankan data dan audit**. Matikan hak EXECUTE RPC jika perlu penghentian penulisan, lalu restore backend dari backup atau migrasi balik yang ditinjau.

**Tidak ada biaya API AI atau provider berita baru pada fitur ini. Tidak mengubah database maupun password pengguna produksi saat pembangunan.**
