# Tahap Pengamanan RPC Master Database — 10 November 2026

**STATUS: PATCH STAGING DIUJI, BUKAN PRODUKSI.**

## Dasar dan perubahan

Definisi `public.commit_master_database(jsonb)` diambil melalui query `pg_get_functiondef` dari Supabase produksi secara **read-only**. File `docs/sql/20261110-commit-master-database-recovery-guard-staging.sql` menyalin fungsi yang digunakan produksi dan hanya menambahkan kondisi:

```sql
and must_change_password is false
```

pada otorisasi admin `profiles` yang sudah memeriksa `auth.uid()`, `role='admin'`, dan `is_active=true`. Ini menghindari menulis ulang seluruh bisnis transaksi master database. Perubahan lain tidak dimasukkan ke definisi fungsionalnya. Ia tetap merupakan fungsi `SECURITY DEFINER`, yang wajib ditinjau oleh reviewer sebelum penerapan.

## Pengujian — PASS

- [PostgreSQL isolated integration](https://github.com/sepriseprisepri/tl-sepri/actions/runs/42758434290): **PASS**
- [Operational smoke](https://github.com/sepriseprisepri/tl-sepri/actions/runs/42758434277): **PASS**
- `tests/sql/recovery-master-commit-rpc-assertions.sql` menjalankan fungsi lengkap dalam PostgreSQL 16 sementara, dengan `auth.uid()` dan profil dummy.
- EC aktif tidak dapat menjalankan RPC Admin: **PASS**.
- Admin aktif dengan `must_change_password=true` tidak dapat menjalankan RPC Admin: **PASS**.
- Setelah Admin menyelesaikan rotasi, fungsi melewati pemeriksaan Admin dan masuk ke validasi payload/periode normal: **PASS**.
- Tidak ada impor data bisnis dilakukan oleh tes; payload dummy kosong sengaja menolak sebelum modifikasi.
- RLS tambahan 19 tabel dan pembatas 12 request bersamaan lulus pada PostgreSQL sementara.

## Risiko yang belum ditutup

1. Pengujian ini menggunakan fungsi yang disalin dari metadata produksi, tetapi **bukan restore seluruh schema produksi**. Kasus sukses mengimpor data Master Database penuh belum diuji untuk regresi (sengaja).
2. `SECURITY DEFINER` tetap memiliki search_path `public,auth` yang diwarisi dari produksi. Hardening search_path dan privilege `EXECUTE` perlu ditinjau tanpa merusak referensi fungsi.
3. Lima fungsi `SECURITY DEFINER` dapat dipanggil role `authenticated`; Supabase security advisor masih WARN. Untuk helper `current_app_role`, `is_admin`, `can_access_store` dan `can_manage_targets`, opsi `SECURITY INVOKER`/privileges memerlukan tes dependensi pada RLS.
4. Grant luas ke `anon` pada sebagian tabel harus diperketat dengan uji fitur existing.
5. Email/WhatsApp delivery, Turnstile hostname/secret produksi, anti-abuse gateway, audit retention, serta dua Admin bersamaan belum tervalidasi pada stack produksi.
6. Full-stack Supabase lokal menguji fungsi recovery & RLS dummy, bukan seluruh RPC dan schema nyata produksi.

## Rencana tahap berikutnya

- Bangun **schema-only staging** dari skema produksi melalui proses yang ditinjau (tanpa customer data, tanpa Auth secrets); gunakan akun dummy.
- Verifikasi SELECT/INSERT/UPDATE/DELETE, semua SECURITY DEFINER RPC, token lama, dan import Master Database sukses dengan payload dummy.
- Rancang perubahan GRANT dan penguatan search_path berdasar hasil tes regresi dan gunakan schema-only snapshot untuk validasi.
- Jangan menjalankan migrasi, deploy, merge PR, atau reset akun produksi tanpa **persetujuan final eksplisit**.
