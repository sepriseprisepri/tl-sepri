# Hasil Pengujian PostgreSQL Sebenarnya — Terisolasi (10 November 2026)

**Status:** PASS pada disposable PostgreSQL 16 via GitHub Actions, memakai data dummy dan tanpa koneksi ke Supabase produksi.

- Run: https://github.com/sepriseprisepri/tl-sepri/actions/runs/42751376600
- Workflow: `.github/workflows/recovery-postgres-integration.yml`
- SQL sumber: `docs/sql/20261110-password-recovery-approval-draft.sql` dan `docs/sql/20261110-password-recovery-rls-guard-staging.sql`
- Fixture: `tests/sql/recovery-bootstrap.sql`
- Assertions: `tests/sql/recovery-assertions.sql`

## Bukti hasil pengujian

| Pemeriksaan | Hasil |
|---|---|
| Draft migration dibuat di PostgreSQL 16 | PASS |
| Table antrean & counter dengan FORCE RLS | PASS |
| Role `anon` / `authenticated` tidak mendapat akses tabel rahasia | PASS |
| Role biasa tidak mendapat EXECUTE pada RPC limit | PASS |
| `service_role` berhak memanggil fungsi limit | PASS |
| TL dengan `is_active=false`, `must_change_password=true` tidak memperoleh business role | PASS |
| TL dengan `is_active=true` tetapi `must_change_password=true` tetap ditolak | PASS |
| EC aktif tetap punya role dan melihat fixture data yang diizinkan | PASS |
| Setelah TL mengganti flag `must_change_password=false`, role normal pulih | PASS |
| Rate-limit satu fingerprint per jam: lima panggilan diterima, keenam dan ketujuh ditolak | PASS |
| Simulasi **12 klaim SQL bersamaan** dalam satu fingerprint/bucket: 5 diterima, 7 ditolak | PASS |
| Pengujian semua RLS/RPC produksi Samsung Kalteng | BELUM |
| Full Supabase Auth login–reset–Edge Functions + Turnstile di stack lokal | BELUM |

## Bug yang ditangkap

Draft migrasi `password_recovery_claim_rate` sebelumnya terpotong/SQL tidak valid. File diperbaiki sebelum CI PostgreSQL ini dijalankan dan berhasil.

## Interpretasi dan batasan

Pengujian ini menjalankan **PostgreSQL nyata**, tetapi bukan stack Supabase penuh: `auth.users` dan `auth.uid()` disimulasikan sebagai fixture SQL, serta data bisnis memakai **satu tabel contoh** yang dilindungi RLS. Karena itu tes ini **tidak membuktikan** seluruh kebijakan data produksi aman maupun komunikasi Auth/Edge Function real.

Lingkungan Supabase produksi tidak diubah. PR tetap Draft/NO-GO untuk deployment. Berikutnya: jalankan project lokal dengan Docker Supabase, migrasi + fungsi recovery, Turnstile testing sitekey/secret, akun dummy TL/EC/Admin, dan tes seluruh RLS/RPC termasuk stale JWT serta failure injection. Pastikan rollback/reissue untuk state `processing` yang macet sebelum produksi.
