# Input Sellout Competitor oleh EC — Implementation & activation gate

## Ketentuan bisnis

- **EC hanya menginput penjualan brand kompetitor.** Contoh brand: Apple, Xiaomi, POCO, OPPO, vivo, realme, Infinix, TECNO, itel, HONOR, Huawei, Motorola, Nokia.
- **EC tidak menginput penjualan Samsung.** RAW Sellout Samsung tetap diimpor Admin melalui file resmi RAW Sellout ke tabel `public.raw_sellout`. Modul ini tidak menulis, menghitung ulang, atau menyisipkan data pada tabel tersebut.
- Data kompetitor disimpan di tabel baru `public.competitor_sellout` dan **tidak dihitung sebagai achievement sellout Samsung**.
- Identitas EC dari sesi `profiles.id`, toko diambil dari tabel `stores` yang RLS-nya dibatasi, sedangkan database memeriksa ulang penugasan di `store_assignments` pada **tanggal transaksi**.
- EC dapat menambah dan melihat catatan sendiri; tidak tersedia fungsi edit atau hapus sampai proses koreksi yang teraudit dirancang.
- Admin, TL, TSO bisa membaca data kompetitor menurut kebijakan akses toko yang sudah berlaku. Penambahan dashboard analitik kompetitor menjadi pekerjaan terpisah.

## Files

| File | Peran |
|---|---|
| `ec-competitor-sellout.js` | Form input responsif dengan validasi, total otomatis, dan riwayat 20 transaksi EC terakhir |
| `index.html` | Menu EC `Input Competitor`, pemanggilan form khusus |
| `docs/sql/20261108-ec-competitor-sellout-draft.sql` | Migration SQL yang sudah diterapkan di Supabase produksi pada 8 November 2026 |
| `tests/ec-competitor-sellout.cjs` | Pengujian isolasi brand, toko, tanggal, qty, harga, wiring frontend, dan struktur kebijakan |

## Aktivasi

Fitur frontend **fail-closed**: sebelum migrasi diterapkan, form tidak muncul; aplikasi menampilkan `Modul Input Competitor sedang menunggu aktivasi database`. Tidak ada fallback ke `raw_sellout`, tidak ada penyimpanan lokal semu.

1. Review migration dengan reviewer keamanan: FK, CHECK brand/model, validitas penugasan EC, kebijakan insert/read, indeks.
2. Pada staging terisolasi gunakan fixture sintetis; uji semua skenario di bawah menggunakan autentikasi riil.
3. Jalankan CI `node tests/promo-master-20261106.cjs` dan `node tests/ec-competitor-sellout.cjs`.
4. **Hanya setelah persetujuan eksplisit perubahan database produksi**, lakukan backup, migrasi, cek advisor RLS, verifikasi peran, lalu aktifkan frontend.
5. Monitor input pertama dan log error; pastikan jumlah RAW Sellout Samsung dan KPI Samsung tidak berubah karena input kompetitor.

## Skenario uji wajib sebelum live (belum dieksekusi)

| Scenario | Expected |
|---|---|
| EC aktif, toko penempatan valid, brand Apple, tanggal valid | Insert berhasil |
| EC tidak aktif | Ditolak |
| EC aktif memilih toko EC lain | Ditolak |
| EC aktif mengirim `ec_profile_id` orang lain | Ditolak |
| EC tanggal di luar periode assignment | Ditolak |
| EC input Samsung di field brand atau model | Ditolak |
| EC mengirim qty negatif, desimal, atau nominal melampaui batas | Ditolak |
| EC input tanggal mendatang | Ditolak |
| EC mencoba update/delete entri | Ditolak |
| EC mencoba insert ke `raw_sellout` | Ditolak oleh RLS RAW |
| TL/TSO non-coverage membaca kompetitor EC lain | Ditolak |
| Admin membaca kompetitor | Diperbolehkan sesuai RLS |
| Submit dua kali dengan `entry_key` sama | Ditolak UNIQUE |
| Dashboard KPI Samsung setelah kompetitor insert | Tidak berubah |

## Rollback

Sebelum migrasi, simpan snapshot schema dan data di staging; untuk produksi, backup database terlebih dahulu. Jika sesudah aktivasi ditemukan isu, **cabut akses UI/fitur input competitor terlebih dahulu**, jangan mematikan RLS. Untuk rollback database, pertahankan data historis yang sudah tercatat dan gunakan migrasi korektif atas kebijakan atau perizinan, bukan langsung `DROP TABLE`.

## Pemeriksaan aktivasi 8 November 2026

- Supabase migration `20261108043427_ec_competitor_sellout_isolated_scoped_rls_20261108`: berhasil.
- `public.competitor_sellout`: dibuat, awalnya 0 transaksi.
- `public.raw_sellout`: 104 transaksi sebelum dan sesudah migrasi, tidak berubah.
- RLS: 19/19 tabel aktif. SQL privilege `anon` SELECT/INSERT false; `authenticated` SELECT/INSERT true dan UPDATE/DELETE false; kebijakan INSERT membatasi EC aktif dan toko penempatan.
- Supabase Advisor tidak menambah warning dari tabel baru. Warning lama terkait 5 SECURITY DEFINER dan proteksi password bocor tetap perlu ditindaklanjuti terpisah.
- GitHub Actions operational smoke lulus sebelum rilis. Pengujian live EC/JWT pertama harus dilakukan bersama pengguna operasional, jangan memakai data penjualan fiktif di produksi.

## Batasan saat ini

- Tidak ada staging cloud karena keterbatasan anggaran. Migrasi produksi telah diterapkan atas instruksi pengguna, namun **pengujian end-to-end menggunakan sesi EC nyata masih perlu dilakukan**.
- Pemeriksaan pascamigrasi membuktikan 19/19 tabel publik RLS aktif, 3 policy baru terpasang, anon tidak memiliki akses, authenticated tidak memiliki izin UPDATE/DELETE, dan 104 baris RAW Samsung tetap tidak berubah.
- Daftar brand merupakan aturan teknis awal; penambahan merek harus menyertakan revisi validasi frontend dan constraint SQL secara bersamaan.
