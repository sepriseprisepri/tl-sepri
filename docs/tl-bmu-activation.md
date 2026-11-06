# Samsung Kalteng — Aktivasi TL_BMU_KAL_02 (November 2026)

## Status implementasi
- Source coverage: `store Coverage Website.xlsx` terbaru (129 store unik).
- TL_BMU_KAL_02: **32 store**, pengganti Andre Randicky.
- Legacy profile `063109`: **inactive** dan tidak dapat login.
- Manpower pengganti: `TL_BMU_KAL_02`, Promoter ID `AC-2406310901` (sudah tersimpan).
- Supabase Edge Function `provision-tl-bmu` **terdeploy**, `verify_jwt=true`, membutuhkan JWT pengguna.
- Browser UI, aktivasi Admin, rotasi password dan login alfanumerik di **branch/PR**. Belum berada di `main` sampai PR digabungkan.
- Auth user TL_BMU_KAL_02 **belum dibuat**. Harus dibuat dengan aksi Admin setelah UI tersedia. Dilarang membuatnya dengan SQL langsung pada `auth.users`.

## Mengapa provisioning memakai Edge Function
Supabase Auth harus dipanggil melalui server berprivilege, bukan melalui frontend atau SQL langsung. Fungsi hanya menerima `action: activate` dari profil dengan `role=admin` dan `is_active=true`, serta memverifikasi sumber manpower dan jumlah coverage.

Aktivasi:
1. Admin login. Sistem versi baru menerima alias `Admin` yang memetakan akun existing `090994`; akun lama dapat tetap memakai ID `090994`.
2. Buka **Manpower** → **Verifikasi & aktifkan akun TL_BMU**.
3. Edge Function membuat user Auth baru `tl_bmu_kal_02@login.tlsepri.internal` dengan password sementara **acak** dan langsung membuat profil **inactive**, `must_change_password=true` (tidak bisa membaca data via RLS).
4. Edge Function memindahkan 32 record `coverage_assignments` dari profil lama yang tidak aktif ke profil baru. Operasi akan menolak kondisi ambigu.
5. Admin menyimpan satu-kali password sementara dari respons browser dan memberikannya ke pemegang akun melalui kanal pribadi.
6. TL login dengan `TL_BMU_KAL_02` atau alias Promoter ID `AC-2406310901`; halaman hanya menampilkan form rotasi password. Setelah password baru berhasil disimpan, profil menjadi aktif.
7. TL login ulang dan mengecek tepat 32 store. EC dan TL lainnya tidak berubah.

**Jangan** mengirim password sementara ke grup chat publik, menyimpannya dalam GitHub, atau memasukkannya ke `localStorage`. Respons fungsi memakai `Cache-Control: no-store`.

## Hasil yang diharapkan
- `profiles`: role `tl`, employee_id `TL_BMU_KAL_02`, terhubung ke manpower yang tepat.
- Sebelum ganti password: `is_active=false`, `must_change_password=true` dan data tidak bisa dilihat melalui RLS.
- Setelah ganti password: `is_active=true`, `must_change_password=false`.
- `coverage_assignments`: 129 record aktif dan 129 store berbeda; TL_BMU=32, Meris=34, Defrian=25, Dedi=21, Seprianto=17.
- `raw_sellout`, `store_targets`, `ec_target_allocations`: tidak diubah oleh proses aktivasi.

## Query verifikasi (read-only)
```sql
SELECT p.full_name, p.employee_id, p.is_active, p.must_change_password, count(c.id) stores
FROM public.profiles p
LEFT JOIN public.coverage_assignments c
  ON c.profile_id=p.id AND c.coverage_role='tl' AND c.valid_to IS NULL
WHERE p.role='tl'
GROUP BY p.id, p.full_name,p.employee_id,p.is_active,p.must_change_password
ORDER BY stores DESC;

SELECT count(*) assignments, count(DISTINCT store_id) unique_stores
FROM public.coverage_assignments
WHERE coverage_role='tl' AND valid_to IS NULL;
```

## Smoke test sebelum merge
1. Jalankan pengecekan sintaks JavaScript di `index.html`.
2. Periksa bahwa Admin tidak bisa mengaktifkan akun lain melalui payload `activate` (function sengaja hanya melayani TL_BMU).
3. Uji unauthorized (401) dan logged-in EC (403) pada endpoint.
4. Setelah deployment web, uji login `Admin`, login ID lama `090994`, login EC angka, dan alias TL_BMU.
5. Setelah aktivasi oleh Admin, pastikan TL baru tidak dapat membaca data sampai rotasi password.
6. Bandingkan akses store TL baru (32), Seprianto (17), TL lain (34/25/21).
7. Cek idempotensi: tombol aktivasi kedua tidak membangkitkan password lagi dan tidak mengubah akun yang sudah aktif.

## Rollback dan pengamanan
- Jika terjadi masalah sebelum Admin menekan aktivasi, cukup revert PR; Edge Function tidak menciptakan akun secara otomatis.
- Jika aktivasi sudah berjalan, hentikan sementara akses dengan menonaktifkan profil TL baru melalui Admin. **Jangan** mengaktifkan lagi akun Andre tanpa keputusan eksplisit.
- Simpan audit perubahan coverage sebelumnya; pengembalian coverage hanya melalui transaksi dan verifikasi 129 store.
- Jangan gunakan atau menerbitkan `service_role` di browser.

## Batasan
- Belum ada token Admin dalam percakapan untuk memanggil fungsi aktivasi sehingga akun Auth baru **belum diciptakan**.
- Belum diuji E2E dengan sesi Admin dan TL baru.
- Migrasi login Promoter ID massal EC bukan bagian dari PR ini; akun EC existing tetap bisa memakai Employee ID.
- Belum ada perubahan otomatis ke domain produksi `samsung-kalteng.vercel.app` dari branch.
