# Rencana Reset Password Pertama — Samsung Kalteng / TL SEPRI

**DRAFT — PERSETUJUAN UNTUK PERSIAPAN SAJA. BELUM ADA IZIN EKSEKUSI RESET PRODUKSI.**

Tanggal audit: 2026-11-10. Lingkungan yang diaudit: project Supabase produksi `tl-sepri`; query **SELECT-only**. Jangan mengunggah password, token, Auth service role key, secret, atau CSV berisi password ke GitHub/PR/log/chat.

## 1. Scope tepat

Dari 40 profil: 32 aktif, 38 belum pernah login (`auth.users.last_sign_in_at IS NULL`), dan **30 aktif yang belum login**: 4 TL + 26 EC. Ada 2 akun yang pernah login dan 8 akun nonaktif yang **dikecualikan**. TSO tidak memiliki profil pada saat audit.

### TL aktif, belum tercatat login (4)
`005065`, `032914`, `053456`, `063383`.

### EC aktif, belum tercatat login (26)
`037299`, `039876`, `041975`, `051305`, `061634`, `063978`, `065152`, `065246`, `067850`, `068065`, `068263`, `069549`, `069890`, `070432`, `071318`, `071402`, `072524`, `074436`, `074888`, `075565`, `075740`, `076194`, `076462`, `076519`, `076531`, `076533`.

**Tidak direset:** `063109`, `TL_BMU_KAL_02`, `MT-01249`, `MT-01266`, `MT-01281`, `MT-01898`, `MT-02107`, `MT-02560` (profil nonaktif), juga Admin dan satu EC yang sudah pernah login. Scope harus diperiksa ulang sesaat sebelum eksekusi karena status login dapat berubah.

## 2. Hambatan aplikasi saat ini: WAJIB DIPERBAIKI DULU

- `supabase/functions/provision-ec-accounts/index.ts`: cabang `rotate_password` mewajibkan `caller.role === 'ec'`, `must_change_password=true`, **`is_active=false`**, dan manpower EC yang sah. Cabang admin `reset_password` yang sudah ada secara eksplisit menonaktifkan profil sebelum mengganti password. Endpoint ini khusus EC, bukan TL.
- `supabase/functions/provision-tl-bmu/index.ts`: cabang `rotate_password` hanya untuk TL `TL_BMU_KAL_02`. **Empat TL aktif dalam scope tidak memiliki jalur rotasi yang sesuai.**
- `index.html`: formulir rotasi diarahkan ke `provision-ec-accounts` untuk EC, dan `provision-tl-bmu` untuk TL. `enterApp` mengalihkan akun ber-flag `must_change_password` ke halaman rotasi, namun jalur backend harus cocok.
- Mengubah `must_change_password=true` pada TL aktif tanpa memperbaiki backend **dapat mengunci akun di halaman rotasi**. Jangan gunakan fitur reset EC yang ada secara massal tanpa uji.
- Bedakan autentikasi berhasil dari akses aplikasi; `last_sign_in_at` dapat berubah walaupun user kemudian gagal memuat profil/dashboard.

## 3. Rancangan backend yang harus selesai dan diuji sebelum reset

Implementasikan endpoint server-side (Edge Function) terpisah, setelah review, mis. `credential-recovery`:

1. **Preview read-only, admin-only**: otentikasi JWT di server, baca role admin dari `profiles` (bukan JWT `user_metadata`), cek admin aktif, verifikasi daftar target dengan `auth.users`, `profiles`, `manpower`, dan status login terbaru. Hanya akun `is_active=true`, `last_sign_in_at IS NULL`, role `tl/ec`; target dipilih berdasarkan allowlist ID eksplisit, bukan semua akun hasil query saat eksekusi. Output hanya ID/status, tanpa token/secret.
2. **Eksekusi terproteksi**: dua tahap, dengan persetujuan final manusia dan allowlist tetap. Nonaktifkan tombol bulk secara default, jangan mengirim service-role ke browser. Gunakan otorisasi admin server-side, rate limit, audit per akun, idempotensi, dan blokir reset pada target di luar allowlist / sudah login.
3. **Password sementara**: gunakan CSPRNG `crypto.getRandomValues` dengan rejection sampling bila memetakan bytes ke alfabet (menghindari bias modulo); panjang 24–32 karakter, minimal huruf besar, kecil, angka, simbol sesuai kebijakan. Unik per akun. Jangan pakai ID, tanggal lahir, nama, atau password universal. Jangan mengklaim bisa membaca password lama.
4. **Konsistensi fail-closed**: tetapkan recovery state `must_change_password=true` serta akses aplikasi dibatasi **sebelum** mengganti kredensial Auth; jika sebagian langkah gagal, simpan status kesalahan **tanpa password** dan beri jalur retry aman. Jangan secara otomatis mengaktifkan akun yang sebelumnya nonaktif. Larang pembacaan data bisnis selama recovery, walaupun JWT lama belum kedaluwarsa, lewat RLS/policy atau mekanisme server-side yang benar-benar diuji.
5. **Rotasi mandiri untuk kedua role**: pengguna yang masuk dengan password sementara hanya boleh melihat halaman ubah password. Endpoint menerima `new_password` untuk identitas JWT sendiri (tidak boleh mengubah user lain), minimal 14 karakter + huruf/angka, pemeriksaan reuse sesuai kemampuan provider, validasi CSRF/origin bila relevan. Setelah sukses, barulah clear `must_change_password`, pulihkan `is_active` sesuai status semula, sign out dan minta login ulang. Uji kasus password berhasil diganti tetapi update profil gagal.
6. **Sekret satu kali**: kembalikan password sementara hanya sekali ke UI admin untuk disampaikan secara privat *per akun* setelah identitas penerima diverifikasi. Hindari localStorage, query string, file plaintext, browser analytics, audit logs, screenshots, email massal dan output CI. Lebih baik gunakan mekanisme pemulihan berbasis tautan resmi jika dapat menerima email, dibanding mengirim password.
7. **Riwayat audit nonrahasia**: `request_id`, actor admin, ID target, role, waktu, outcome, recovery_required, delivery_acknowledged (opsional); tanpa password/hash/token. Audit tidak boleh bisa diakses EC/TL.
8. **Pembatasan batch**: lakukan pilot **1 EC + 1 TL**, lalu kelompok kecil, lalu sisanya setelah pemilik akun memastikan login + rotasi sukses. Jangan mengganti semua 30 kredensial sekaligus tanpa jalur pemulihan tervalidasi.

## 4. Test gate yang wajib dilewati

- Admin dapat preview; TL/EC/anon ditolak.
- Setiap target benar-benar aktif, belum pernah login dan punya Auth + profil + manpower tertaut; daftar yang berubah dibatalkan, bukan diam-diam direset.
- Password sementara unik untuk dua akun berbeda, tidak bocor ke log/DB audit/client bundle.
- User dapat login dengan password sementara, **tidak dapat membuka dashboard/REST bisnis sebelum rotasi**, termasuk refresh tab atau membuka endpoint REST langsung.
- EC dan TL dapat mengganti password tanpa terjebak, lalu login ulang normal.
- Token lama dan sesi ganda ditinjau; waktu hidup JWT dan dampak RLS diuji.
- Gagal update Auth / profil / kirim sekret ditangani idempoten dan dapat diperbaiki per akun tanpa membocorkan password sebelumnya.
- Akun nonaktif dan akun yang sudah login dikecualikan. Race antara login pertama dan reset ditangani.
- Uji semua pada staging/lokal dengan akun dummy sebelum deployment.
- Tinjau kebutuhan Edge Function deploy dan RLS terpisah dari rilis frontend. Jangan memakai `service_role` di client.

## 5. Urutan persetujuan dan eksekusi nanti

1. Audit read-only ulang 30 ID. Review perbedaan hasil.
2. Perbaiki mekanisme backend dan frontend di branch; uji lokal.
3. Jalankan pilot di lingkungan nonproduksi dengan data dummy.
4. Ajukan **persetujuan final terpisah untuk perubahan produksi** (deploy Edge Function, perubahan RLS bila perlu, dan reset masing-masing akun); sebut jumlah akun & risiko lockout.
5. Jika disetujui: pilot akun nyata yang disepakati, verifikasi login/rotasi, lalu reset bertahap.
6. Sampaikan password sementara satu per satu hanya melalui kanal aman. Tandai berhasil terkirim tanpa menyimpan rahasia.
7. Pantau kesalahan login dan dukungan pengguna; rollback harus dipahami: *password lama tidak dapat direkonstruksi*, solusi kegagalan adalah reset baru dengan otorisasi.

## 6. Kondisi saat ini

**HANYA PERSIAPAN.** Tidak ada `auth.admin.updateUserById`, penonaktifan profil, perubahan RLS/SQL, deploy Edge Function, atau pengiriman password yang dijalankan sebagai bagian dari dokumen ini.
