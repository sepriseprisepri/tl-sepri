# P0 Hardening — Lupa/Reset Password (10 Nov 2026)

**Scope:** kode PR #28, **belum dideploy/diuji di Supabase produksi**. CI statis: https://github.com/sepriseprisepri/tl-sepri/actions/runs/42750219579 (PASS).

## Perubahan sudah di-commit

1. **Server-side Turnstile:** `password-recovery` mengharuskan `captcha_token`, memverifikasinya ke Cloudflare Siteverify dengan `TURNSTILE_SECRET_KEY`, memeriksa success + hostname resmi/localhost. Fail-closed bila konfigurasi secret hilang; tidak membuat request tanpa token valid. UI memakai `window.SAMSUNG_TURNSTILE_SITE_KEY`; widget di-render secara dinamis, token tidak disimpan persisten dan reset setelah request.
2. **Rate limit atomik:** `public.password_recovery_claim_rate(text)` melakukan INSERT ... ON CONFLICT DO UPDATE dengan batas maksimal 5 percobaan/jam per fingerprint; hanya `service_role` mendapat EXECUTE. Counters privat disimpan pada tabel `password_recovery_rate_buckets`. Ini mengatasi SELECT-then-INSERT race pada burst request. IP dari header `x-forwarded-for` **belum dapat dipercaya** tanpa reverse proxy; perlindungan berlapis di gateway tetap wajib.
3. **Tutup bypass rotasi lama:** Endpoint EC lama memeriksa `password_recovery_requests`, lalu menolak pemulihan aktif/expired/failed yang belum completed. Frontend tidak lagi fallback ke jalur lama saat Edge Function baru memberikan HTTP 404; fallback legacy hanya pada `NO_RECOVERY_REQUEST`.
4. **Staging RLS gate:** draft `docs/sql/20261110-password-recovery-rls-guard-staging.sql` memperbarui `public.current_app_role()` agar akun dengan `must_change_password=true` tidak memperoleh role bisnis meski `is_active` terlanjur true.

## Konfigurasi yang belum dibuat

- Cloudflare Turnstile site key untuk domain resmi dan localhost (**belum ada**, tidak boleh menebak).
- Supabase Edge Function secret `TURNSTILE_SECRET_KEY` dan `PASSWORD_RECOVERY_IP_SALT` 32+ karakter; tidak disimpan di GitHub.
- Konfigurasi Edge Function *anonymous requests*: `verify_jwt=false` **hanya** dengan validasi JWT eksplisit yang sudah ada di jalur `list/approve/rotate`, bukan mempercayai `apikey` sebagai otorisasi pengguna.
- Trusted client IP di ingress; gunakan header yang diproduksi oleh proxy terpercaya dan pastikan user tidak dapat memalsukan nilainya.
- Data dummy, PostgreSQL dan Supabase Auth terisolasi untuk uji.

## Masih wajib sebelum rilis produksi

- Eksekusi SQL staging dan pembuktian `service_role` punya akses RPC sementara `anon/authenticated` ditolak.
- Uji 6+ request concurrent dalam satu bucket, distributed abuse, spoofed IP, CAPTCHA expired/wrong hostname/replay.
- Uji EC/TL dari login sementara sampai rotasi, termasuk expiry 24 jam; pengujian token lama, semua RLS dan RPC dengan JWT pemulihan.
- Recovery proses berstatus `failed`, `processing`, `awaiting_delivery`, atau `expired`: **belum ada reissue/retry**; masih ada risiko lockout akun nyata.
- Audit keberhasilan update Auth/password/DB secara parsial; eksekusi persetujuan admin memerlukan penanganan atomic/retry tambahan.
- Penolakan permintaan oleh Admin dan audit log keamanan belum lengkap.
- Evaluasi `allowlist` origin dan dependensi browser; CSP disarankan.
- Verifikasi `password-recovery` dan kode `provision-ec-accounts` dipasang secara atomik/terkoordinasi bersama migrasi yang dibutuhkan; tidak boleh deploy salah satunya saja.
- Jalankan pengujian lokal Windows `staging-local/Start-Staging.ps1` dari branch pengembangan terpisah (tidak otomatis ada di PR #28).
- **Jangan deploy/merge atau mengubah produksi sebelum persetujuan dan hasil integration test sebenarnya.**

## Interpretasi CI

PASS berarti **tes JS statis di GitHub berhasil**, bukan bukti SQL berjalan, Edge Function berhasil deploy, Cloudflare site key valid, atau akun dapat melakukan recovery.
