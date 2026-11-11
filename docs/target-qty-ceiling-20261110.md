# Aturan Pembulatan Target Qty — Samsung Kalteng

**Disetujui pengguna pada 10 November 2026.**

## Aturan tunggal
- **Target Qty pada semua tampilan dibulatkan ke atas** menuju bilangan bulat terdekat: `Math.ceil(value)`.
- Angka dipresentasikan dalam lokal `id-ID` memakai pemisah ribuan titik.
- Nilai sumber **tetap presisi** di database; tidak ada migrasi maupun UPDATE massal.
- Nilai Qty realisasi VALID, Qty GAP, persentase achievement, Amount, dan pembatasan maksimal alokasi menggunakan data aslinya tanpa pembulatan ke atas secara sembarang.
- Input saat mengedit tetap menyajikan nilai asli agar pengguna tidak mengubah data secara tidak sengaja. Ringkasan Target Qty dan hasil CSV yang bersumber dari tabel UI selalu memakai pembulatan ke atas.

## Contoh yang harus lolos

| Nilai target numerik | Tampilan Target Qty |
|---:|---:|
| 3794.25 | 3.795 |
| 1.955 | 2 |
| 3.911 | 4 |
| 34.218 | 35 |
| 4.888 | 5 |
| 3 | 3 |
| 0 | 0 |

Sebagai input asli dari database, target disimpan dalam format numerik. Penulisan Indonesia `3.794,25` secara internal direpresentasikan sebagai angka `3794.25`.

## Tampilan terpengaruh
- Dashboard utama: Target Qty dan tabel toko.
- Target Saya EC / Target TL: Target Qty, Target MTD Qty, Target Daily Qty, rincian target.
- Coverage dan Performa EC.
- Focus Model: target induk Admin, target EC individual, total alokasi, batas dan sisa alokasi, aktivitas perubahan Qty.
- Grafik Sellout: nilai target di Pace terhadap Target.
- Artificial Insight: Target MTD dan kebutuhan harian.
- Pratinjau total target Qty impor Master Database.

## Catatan rekonsiliasi
Pembulatan hanya untuk penyajian dan dilakukan **setelah** penjumlahan saat menampilkan total. Karena itu, jika banyak baris target pecahan, menjumlahkan setiap angka yang telah dibulatkan secara visual bisa berbeda dari total yang dihitung dari nilai asli, lalu dibulatkan. Ini mencegah perubahan definisi target/achievement tanpa migrasi bisnis terpisah.

## Pengujian
`tests/market-metrics.cjs` memeriksa semua contoh di atas, angka mentah tidak berubah, dan penggunaan formatter konsisten di komponen antarmuka. GitHub Actions `ops-smoke.yml` menjalankan tes tersebut.

## Rilis
Perubahan ikut PR #29 `feat/dashboard-targets-wow-insights`. Frontend belum boleh digabung ke produksi sampai preview dari SHA final bisa dibuat dan diverifikasi karena Vercel Free harian sebelumnya mengembalikan HTTP 402.
