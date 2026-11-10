# Audit RLS/RPC/Storage Pra-rilis Password Recovery — 10 Nov 2026

**Sumber:** inspeksi metadata dan kebijakan SQL pada Supabase proyek Samsung Kalteng secara **SELECT-only**. Semua modifikasi pada branch GitHub, **tidak ada penulisan ke database produksi**.

## Ringkasan inventaris

- **20 tabel publik**; RLS sudah aktif pada seluruh 20. Tidak ada view/materialized view dalam schema `public` saat pemeriksaan.
- **19 tabel bisnis/konfigurasi** perlu pembatas tambahan selama recovery. Tabel `profiles` harus tetap dapat dibaca untuk identitas/flag `must_change_password`, tetapi update tetap dibatasi.
- **8 fungsi publik** ditemukan, termasuk 5 `SECURITY DEFINER` yang dapat dipanggil role `authenticated`: `current_app_role()`, `is_admin()`, `can_access_store(uuid)`, `can_manage_targets()`, `commit_master_database(jsonb)`.
- **Storage:** tidak ada bucket dan tidak ada kebijakan `storage` milik aplikasi pada saat audit.
- Advisori keamanan resmi Supabase: 5 executable `SECURITY DEFINER` (warning) dan fitur leaked-password protection belum aktif (warning).
- Kebijakan `profiles_select_self_or_admin` mengizinkan self-read untuk proses redirect password wajib (sesuai rancangan), tidak boleh dihapus tanpa mendesain ulang sesi onboarding.

## Temuan penting

**A. Ownership-only READ:** beberapa policy `manpower`, `coverage_assignments`, `ec_target_allocations`, `store_assignments` mengizinkan akses sendiri melalui `auth.uid()`/ID manpower tanpa memeriksa `current_app_role()`. Jika token lama tetap berlaku saat reset, guard pada frontend saja tidak cukup. **P0**.

**B. Jalur penulisan dan RPC:** policy INSERT pada `competitor_sellout` memeriksa `profiles.is_active` tetapi tidak secara eksplisit `must_change_password`. Policy `store_shadow_history` untuk Admin memeriksa role Admin secara langsung tanpa helper. RPC `commit_master_database(jsonb)` adalah `SECURITY DEFINER`, dan pemeriksaan Admin aktif di dalamnya tidak mengecek flag rotasi. **P0**: perbaiki atau uji per jalur sebelum rilis; restrictive table RLS tidak melindungi RPC SECURITY DEFINER dengan BYPASSRLS.

**C. Grants anon:** banyak tabel masih mempunyai privilege SQL `anon` yang luas meski kebijakan RLS saat ini menutup akses mereka. Ini bukan bukti kebocoran data tetapi merupakan permukaan serangan yang tidak perlu. Audit fungsi nyata pada tiap tabel sebelum menyiapkan draft REVOKE agar tidak merusak fitur lama.

**D. Kebijakan keamanan:** fitur leaked-password protection nonaktif; enabling memerlukan review dan izin terpisah untuk pengaturan Auth produksi.

**E. Rate limit:** header `x-forwarded-for` bukan identitas IP tepercaya bila browser dapat mengirimnya. Draft fungsi kini menggunakan fingerprint HMAC dari employee ID yang dinormalisasi dan menerima rate claim atomik. Ini mengatasi IP spoofing pada pemilihan bucket, tetapi tetap membutuhkan perlindungan gateway anti-abuse lintas banyak ID.

## Draft patch (belum diterapkan)

- `docs/sql/20261110-password-recovery-rls-guard-staging.sql`: `current_app_role()` mensyaratkan akun aktif dan `must_change_password=false`.
- `docs/sql/20261110-password-recovery-restrictive-rls-staging.sql`: restriktif `FOR ALL` pada 19 tabel, komposisi AND terhadap seluruh policy yang sudah ada, serta restriktif `FOR UPDATE` pada profiles. Tidak mengubah grant untuk role yang sudah aktif.
- `tests/sql/recovery-bootstrap.sql`: fixture `manpower` dengan policy owner-only yang sengaja lemah untuk regresi.
- `tests/sql/recovery-assertions.sql`: membuktikan akun reset tidak dapat membaca manpower sendiri sebelum selesai mengganti password; aktif EC tetap dapat membaca bagiannya.
- `.github/workflows/recovery-postgres-integration.yml`: menjalankan draft pada disposable PostgreSQL.
- `.github/workflows/recovery-fullstack-local.yml`: menjalankan draft restrictive RLS pada layanan GoTrue/Edge/PostgREST lokal dengan akun dummy.

## Persyaratan sebelum persetujuan produksi

1. Uji skema-only asli seluruh 20 tabel + 8 fungsi `public` di staging terisolasi, termasuk perilaku per-role dan semua operasi SELECT/INSERT/UPDATE/DELETE serta RPC; fixture kecil tidak mewakili seluruh skema produksi.
2. Patch secara eksplisit `commit_master_database(jsonb)` agar memeriksa `must_change_password=false` pada akun pemanggil, bukan hanya `is_active`. Tinjau privilege dan search_path semua SECURITY DEFINER.
3. Tinjau privilege `anon` dan siapkan REVOKE terpisah dengan regression test.
4. Review Turnstile domain resmi, CSP, anti-abuse lintas IP/akun, dan secret management; jangan gunakan key dummy di hosting.
5. Verifikasi kondisi crash/partial failure, concurrent two-Admin approvals, audit, kebijakan retensi dan jalur delivery yang terverifikasi.
6. Buat rencana backup/rollback untuk migrasi dan deploy berkoordinasi.
7. Minta **persetujuan produksi final terpisah** untuk setiap migration/Edge Function/merge/deploy/akun.

**Keputusan:** Tidak ada deployment produksi; status PR tetap Draft / NO-GO hingga seluruh gate lolos.
