# Hasil Audit Integrasi Supabase (READ-ONLY) — 2026-11-10

**Project produksi:** `tl-sepri` (`xirmqdcdqpocdfqqvxmh`). **Metode:** pemeriksaan metadata Supabase dan query `SELECT` saja. **TIDAK ADA** migrasi, deploy Edge Function, percobaan password, pengubahan sesi atau reset pengguna.

## 1. Hasil pengujian kontrak server

| Kontrak | Hasil | Bukti / penjelasan |
|---|---|---|
| `public.profiles` memuat `id,employee_id,role,is_active,must_change_password,manpower_id` | PASS | Semua kolom tersedia pada metadata |
| `auth.users` terhubung dengan profil aktif | PASS | 32 dari 32 profil aktif terhubung ke Auth |
| Email Auth sesuai pola `{employee_id}@login.tlsepri.internal` | PASS untuk 32 aktif | Admin 1, EC 27, TL 4 |
| RLS pada semua tabel `public` | PASS secara konfigurasi | 20 dari 20 tabel memiliki RLS aktif |
| Tabel `public.password_recovery_requests` | BLOCKED | Belum ada di produksi (memang belum diterapkan) |
| Edge Function `password-recovery` | BLOCKED | Belum dideploy |
| Edge Functions sebelumnya | INFO | `provision-ec-accounts` aktif `verify_jwt=false`; `provision-tl-bmu` aktif `verify_jwt=true` |
| Restriksi REST untuk pengguna dalam masa pemulihan | **BELUM TERBUKTI** | Banyak kebijakan RLS mengandalkan helper; belum diuji dengan JWT akun recovery |
| Pemblokiran rotasi setelah expiry 24h, termasuk endpoint lama | **BLOCKER** | `provision-ec-accounts` memiliki jalur `rotate_password` lama tanpa pengecekan masa berlaku request baru |
| Antispam anonim: CAPTCHA + rate limit atomik | **BLOCKER** | Draft hanya memakai hitungan IP dan akun; rentan race/distributed abuse |
| Pemulihan setelah kegagalan parsial | **BLOCKER** | Jika reset Auth berhasil tetapi pembaruan status gagal, password sementara baru hilang dan akun harus di-reissue |
| Konfirmasi identitas oleh Admin + pengiriman rahasia privat | BELUM TERUJI | UI sudah ada, tidak ada pengiriman WhatsApp/email otomatis |

## 2. Penilaian RLS yang relevan

Fungsi `public.current_app_role()` memiliki syarat `profiles.is_active = true`. Fungsi `public.is_admin()` bergantung pada itu. Fungsi `public.can_access_store()` memakai `current_app_role()` dan pengecekan `is_active` untuk jalur EC.

Ini merupakan *defense* parsial untuk profil yang ditandai tidak aktif selama recovery. **Jangan simpulkan seluruh data aman**: kebijakan `profiles_select_self_or_admin` masih dapat menampilkan profil sendiri, sebagian jalur ke fungsi/RPC bisa memiliki perilaku lain, dan tidak ada hasil pengujian RLS dengan JWT akun yang sedang direset.

Juga, beberapa policy tidak secara langsung menggunakan `must_change_password`; jika `profiles.is_active` dipulihkan terlalu awal, pemeriksaan rotasi dapat terlewati oleh akses langsung ke API.

## 3. Risiko logika backend yang harus diperbaiki

1. **Prioritas P0 — Rotasi lama bypass expiry:** Endpoint `provision-ec-accounts` menerima `rotate_password` untuk EC `is_active=false` dan `must_change_password=true` tanpa memeriksa `password_recovery_requests.expires_at`. Akun recovery baru akan terlihat seperti akun onboarding lama. Jangan deploy sistem baru sebelum ada otorisasi rotation yang seragam, terpisah dan terlindungi.
2. **Prioritas P0 — Token lama/JWT:** password baru tidak otomatis mencabut sesi yang sudah ada. Uji seluruh RPC, endpoint dan RLS terhadap user yang direcovery. Hindari memberi akses bisnis hanya berdasarkan JWT + peran tanpa status pemulihan yang tepercaya.
3. **Prioritas P0 — Anonymous abuse:** CAPTCHA yang diverifikasi server dan rate limit atomik/trusted ingress belum ada; jangan deploy Edge Function sebagai endpoint anonim sebelum ini aman.
4. **Prioritas P1 — Expired/reissue:** Setelah 24 jam, `auth.users` masih menyimpan hash password sementara. Rotasi backend akan menolak request kedaluwarsa, tetapi admin harus dapat reissue setelah verifikasi; tidak tersedia saat ini.
5. **Prioritas P1 — Partial failure recovery:** state `processing`, `failed`, `awaiting_delivery` harus memiliki prosedur rekonsiliasi dan reissue tanpa menyimpan password plaintext.
6. **Prioritas P1 — Audit:** Setiap approval, rejection, delivery, dan completion harus tercatat tanpa sekret; batasi retention data fingerprint.
7. **Prioritas P1 — UI/Admin:** `Lupa Password` dan `Reset Password` sama-sama memasukkan antrean, namun pembeda prioritas/penolakan permintaan belum diterapkan.

## 4. Test matriks berikutnya (hanya staging terpisah atau lokal)

| ID | Skenario | Harapan |
|---|---|---|
| INT-01 | ID valid/missing, kirim request anonim | Jawaban generik identik; tidak ada enumerasi |
| INT-02 | 6+ request IP sama dalam 1 jam | Rate limit efektif, termasuk concurrency |
| INT-03 | Permintaan akun Admin/nonaktif | Tidak membuat request yang diproses |
| INT-04 | Antrian sebagai Admin / TL / EC | Hanya Admin aktif boleh list & approve |
| INT-05 | Dua Admin approve request bersamaan | Hanya satu transisi status + satu password aktif |
| INT-06 | Reset EC & TL | Semua role dapat login ke halaman wajib rotasi |
| INT-07 | Langsung panggil REST/RPC dengan JWT recovery | Data bisnis ditolak sampai completion |
| INT-08 | Expired setelah 24 jam | Rotasi ditolak di **semua** endpoint, termasuk legacy |
| INT-09 | Auth update gagal / profile update gagal | Tidak ada kebocoran rahasia; bisa reissue |
| INT-10 | Rotasi sukses + signout + login password baru | Dashboard dibuka hanya setelah benar-benar selesai |
| INT-11 | Sesi lama sebelum reset | Tidak dapat mengakses data bisnis selama recovery |
| INT-12 | A11y/mobile/modal focus | Navigasi keyboard, close, focus kembali berfungsi |

## 5. Putusan saat ini

**NO-GO untuk integrasi produksi dan reset akun.** Pemeriksaan read-only pada proyek yang sedang aktif berhasil untuk kecocokan awal, tetapi *integration test lengkap* tidak mungkin dilakukan tanpa menyediakan backend terisolasi dan data dummy. Jalankan `staging-local/Start-Staging.ps1` yang telah disiapkan pada branch sebelumnya, atau project staging cloud terpisah bila nanti tersedia.

Keputusan ini menjaga instruksi sebelumnya: **jangan menjalankan perubahan produksi tanpa persetujuan final eksplisit.**
