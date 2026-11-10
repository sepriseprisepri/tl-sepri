# Paket Rilis & Rollback — Admin-Approved Password Recovery
**Tanggal:** 10 November 2026  
**Keputusan saat dokumen ditulis:** PRE-RELEASE / **BELUM DISETUJUI UNTUK PRODUKSI**.

## Lingkup yang sudah disiapkan
- Login: tombol Lupa Password, modal gagal login, pilihan lupa/reset.
- Pengajuan anonim → antrean Admin → verifikasi identitas manual → persetujuan.
- Password sementara unik, tampil satu kali kepada Admin, rotasi wajib sebelum membuka data bisnis.
- Masa pemulihan maksimal 24 jam; reissue bila kedaluwarsa/gagal; klaim ulang processing macet setelah 15 menit.
- RLS dan RPC guard, Turnstile server verification, account-subject atomic throttling.
- Pengujian Supabase lokal TL/EC & PostgreSQL dummy; impor Master Database yang berhasil diuji dengan fixture sesuai kolom yang digunakan RPC (bukan replika lengkap semua skema/constraint).

## Persyaratan mutlak sebelum menyetujui penerapan
1. **Cloudflare Turnstile riil:** sitekey untuk `samsung-kalteng.vercel.app`; secret disimpan sebagai secret Supabase (BUKAN GitHub dan bukan frontend); perbarui CSP agar memuat widget; uji token valid/invalid/replay dan domain yang salah. Kunci test `1x000...` **dilarang** di produksi.
2. **Anti-abuse gateway:** rate limiting lintas ID/IP di ingress terpercaya, bukan header `x-forwarded-for` yang dikirim pengguna. Account-based rate-claim hanya melindungi per ID; tidak cukup terhadap serangan terdistribusi.
3. **Skema produksi penuh:** simpan `schema-only` PostgreSQL dump ke media privat, tidak mencakup rows pelanggan, token atau password. Restorasi di staging. Jalankan keseluruhan 20 tabel RLS, 8 RPC, dan regresi operasi bisnis. Draft fixture CI tidak memuat seluruh constraint produksi.
4. **Audit grant:** evaluasi dan uji REVOKE privilese anon yang tidak digunakan; audit 5 SECURITY DEFINER (termasuk search_path) tanpa merusak RLS. Review fitur leaked-password protection sebelum mengubah pengaturan Auth.
5. **Konsistensi:** test inject kegagalan DB/Auth di setiap tahap (terutama setelah Auth sukses, sebelum status delivery); dua Admin approve/reissue paralel; observabilitas `processing` macet, rotasi gagal.
6. **Keamanan distribusi:** Admin harus melakukan verifikasi identitas penerima; kirim via kanal privat satu-ke-satu; jangan simpan password sementara di GitHub, audit log, CSV, URL, query string, atau grup WhatsApp. Gunakan skrip dukungan untuk reset ulang bila secret hilang.
7. **Persetujuan final terpisah** untuk migrasi SQL dan fungsi, konfigurasi platform, merge PR, Vercel deploy dan reset akun sebenarnya. Persetujuan menyiapkan desain **bukan** izin mengganti kredensial.

## Urutan deploy yang aman (HANYA setelah persetujuan)
1. Catat SHA rilis, cek backup dan ekspor definisi fungsi serta RLS untuk rollback; pastikan kapasitas Vercel/Supabase tidak membebankan biaya baru.
2. Jalankan migrasi tabel permintaan dan rate bucket; verifikasi RLS/revoke anon, grants, `password_recovery_claim_rate`.
3. Pasang guard `current_app_role`, restrictive RLS untuk 19 tabel, dan patch `commit_master_database`; uji dengan dummy token serta query langsung. Jangan menjalankan perubahan sebagian.
4. Siapkan Turnstile production secrets dan abuse gate. Deploy `password-recovery` dan versi `provision-ec-accounts` yang menutup legacy bypass **secara terkoordinasi**; cek CORS dan verifikasi server JWT untuk action non-anon.
5. Uji smoke dengan dummy pada staging final; verifikasi admin queue, timeout, expired, sesi lama, reissue, dan failure injection.
6. Setelah semua lulus, merge PR #28 dan deploy frontend Vercel dengan `SAMSUNG_TURNSTILE_SITE_KEY` (sitekey publik, bukan secret).
7. Pilot dua akun **dummy atau akun uji yang telah disetujui secara eksplisit**; hanya setelah pilot dan verifikasi manual, jalankan reset akun sebenarnya satu per satu/gelombang kecil bila disetujui.
8. Setelah rilis cek uptime, antrian tertahan, error rate, dan masalah lockout; hentikan approval bila terjadi insiden.

## Rollback / penghentian saat insiden
- **Segera hentikan persetujuan dan penerbitan password baru** lewat kontrol akses/rollback endpoint yang telah diverifikasi; jangan menghapus tabel request berstatus aktif.
- Roll back frontend ke commit yang diketahui aman jika UI bermasalah; pertahankan backend rotasi bagi akun yang telanjur reset agar mereka tidak terkunci.
- Rollback RLS / RPC dilakukan berdasarkan `pg_get_functiondef` dan `pg_policies` yang diekspor **sebelum** perubahan; pengembalian full policy harus ditinjau, karena roll back ke RLS lemah bisa membuka akses token lama.
- **Password lama tidak dapat dipulihkan.** Bila reset telah terjadi, buat password sementara baru melalui prosedur reissue yang diaudit, bukan restore hash/CSV.
- Jangan menyampaikan temporary password selain lewat kanal privat; jika secret hilang, invalidasi dan terbitkan ulang.
- Rekonsiliasi status `processing`, `awaiting_delivery`, `failed`; jangan otomatis memulihkan `is_active=true` sebelum rotasi selesai.
- Audit lengkap dan pemulihan terarah lebih aman daripada rollback parsial skema sambil kredensial sudah berubah.

## Peta bukti dan berkas
- `.github/workflows/recovery-postgres-integration.yml`
- `.github/workflows/recovery-fullstack-local.yml`
- `tests/sql/recovery-master-commit-happy-path.sql`
- `tests/recovery-supabase-local-e2e.cjs`
- `docs/sql/20261110-password-recovery-approval-draft.sql`
- `docs/sql/20261110-password-recovery-rls-guard-staging.sql`
- `docs/sql/20261110-password-recovery-restrictive-rls-staging.sql`
- `docs/sql/20261110-commit-master-database-recovery-guard-staging.sql`

**Status operasional akhir:** Code & tests terisolasi dapat selesai, tetapi penerapan cloud produksi masih terhalang konfigurasi pemilik domain/Turnstile, pengujian skema lengkap, dan persetujuan final.
