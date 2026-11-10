# Hasil aktivasi backend Focus Model EC — Supabase Produksi
**10 November 2026 — release partially deployed; frontend gated**

## Persetujuan
Pengguna menyetujui migrasi Focus Model ke Supabase produksi, verifikasi RLS/RPC dan rilis dashboard via Vercel **setelah memeriksa preview**.

## Migrasi berhasil
- Proyek: `xirmqdcdqpocdfqqvxmh` (`tl-sepri`, PostgreSQL 17.11, region Singapore).
- Migrasi Supabase: `20261110162801_focus_model_tl_to_ec_scoped_allocations_20261110` → **success:true**.
- SQL yang diterapkan tepat dari `docs/sql/20261110-focus-ec-allocations-staging.sql`, blob SHA `e2f4eb148ad50427ee3f5da6c87005970a7cb5ad`.
- Baru: `focus_model_ec_allocations`, `focus_model_allocation_history`, `set_focus_model_ec_allocation(uuid,uuid,text,uuid,numeric,numeric)`, parent capacity trigger `focus_ec_parent_capacity_guard`.
- Parent `focus_targets_read_authorized` sekarang hanya Admin/TL/TSO dengan coverage. EC tidak mendapat SELECT parent hanya alokasi personal.

## Verifikasi produksi — PASS
- Ketiga tabel parent/alokasi/audit: `relrowsecurity=true`.
- Allocation: `authenticated SELECT=true`; direct INSERT/UPDATE/DELETE=false; `anon SELECT=false`.
- Audit: `authenticated SELECT=true`, direct INSERT=false; RLS mengecek role + cakupan.
- RPC: authenticated EXECUTE=true; anon EXECUTE=false; SECURITY DEFINER dengan identitas `auth.uid()`, role `current_app_role()`, TL coverage, store assignment dan parent row FOR UPDATE.
- Policy `focus_ec_recovery_gate` dan `focus_ec_history_recovery_gate` keduanya RESTRICTIVE. RLS EC memerlukan penempatan toko aktif pada tanggal Asia/Pontianak.
- Parent capacity trigger enabled; tiga FK dan satu UNIQUE pada alokasi.
- Pengujian read-only dengan `SET LOCAL ROLE authenticated` tanpa JWT: parent/alokasi/audit tanpa data, RPC menolak. Dieksekusi dalam transaksi yang di-ROLLBACK.
- Jumlah parent target, alokasi EC, riwayat masing-masing = **0**; tidak ada data uji atau target fiktif.
- Test sebelum migrasi: GoTrue+PostgREST lokal E2E PASS https://github.com/sepriseprisepri/tl-sepri/actions/runs/42853194261; PostgreSQL17 PASS https://github.com/sepriseprisepri/tl-sepri/actions/runs/42853193603; UI PASS https://github.com/sepriseprisepri/tl-sepri/actions/runs/42853193666.

## Security advisor setelah migrasi
- `authenticated_security_definer_function_executable`: 6 warning (5 sebelumnya + RPC baru yang sengaja exposed ke authenticated). Harus tetap diaudit dan jangan membuka ke anon.
- `auth_leaked_password_protection`: warning existing/disabled.
- `rls_enabled_no_policy` pada 2 tabel password recovery internal: status INFO dan akses langsung ditutup.
- Tidak ada klaim bahwa warning awal sudah ditangani.

## Vercel — BLOKIR EKSTERNAL, BELUM RILIS
- Vercel `create_deployment` dari branch `feat/dashboard-targets-wow-insights` menolak dengan HTTP 402 `api-deployments-free-per-day`, retryAfter 86400 (~24 jam).
- Tidak mengganti paket, billing, team atau membuat resource berbayar.
- Preview lama SHA `ca4ae09...` tidak cocok commit final dan **bukan** bukti QA tampilan final.
- **PR #29 belum di-merge dan frontend produksi tetap pada branch `main` sebelum PR**. Tidak ada pengalihan domain.
- Saat kuota reset: buat preview dari SHA final; cek halaman login, mobile widths, ADMIN parent editor, TL form, EC self-only, TSO readonly, dashboard chart/date; verifikasi browser + RLS. Baru merge PR #29 ke main; pantau Vercel production READY & alias.

## Rollback
- `docs/focus-model-production-rollback-20261110.md`.
- Bila ada masalah sebelum frontend dirilis, revoke EXECUTE RPC untuk authenticated sebagai kill switch tanpa DROP TABLE. Simpan data audit.
- Jangan restore policy EC parent yang lebih longgar tanpa penilaian privacy.

## Tindakan Admin
- Periode target yang ada status `draft` dan belum ada plafon per toko/model. Admin memasukkan angka resmi secara manual pada menu Focus Model setelah frontend dirilis. TL baru dapat membagikan Qty/Amt setelah parent target tersedia.
