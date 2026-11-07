# Master Update Promo Samsung — November 2026

**Sumber:** bulletin internal “MASTER UPDATE PROMO SAMSUNG NOVEMBER 2026” dengan tanggal update **30 Oktober 2026**, disampaikan oleh pengguna untuk portal internal Samsung Kalteng / TL SEPRI.

> **Penting tentang verifikasi**: Data dipindahkan secara setia dari bulletin yang diberikan. **Bukan** pernyataan bahwa Samsung.com mengonfirmasi seluruh program, SKU, diskon, atau cakupan toko. UI membedakan `source_type=internal_bulletin` dari `official_web`. Konfirmasi mekanisme promo melalui TL/TSO/Admin dan syarat program pada tanggal transaksi.

## Implementasi 6 November 2026

- Migration skema: `docs/sql/20261106-promo-provenance.sql`.
- Data migrasi: `docs/sql/20261106-promo-master-import.sql`.
- Nomor record: **61**, masing-masing dengan `import_key` unik, `model_name`, `sku_variant`, `channel_code`, `offer_items` JSONB, `record_kind`, `start_date`, `end_date`, provenance.
- **55 entri diterbitkan sebagai informasi bulletin internal** dan tersedia hanya bagi akun yang lulus RLS.
- **6 entri tidak diterbitkan** karena sumber mengandung ketidakpastian dan membutuhkan pengecekan lanjutan.
- Promo umum Samsung.com dari pembaruan sebelumnya dipertahankan, dengan `source_type=official_web`.

## Pengecualian utama yang wajib terlihat

1. **S25 FE:** cashback trade-in Rp2.000.000 **Traditional saja**. Organized hanya Samsung Care+ Special Price, **tanpa cashback**.
2. **Galaxy A57 5G:** Direct CB Rp1 juta (12/256), Rp700 ribu (8/256), Rp500 ribu (8/128), PWP Rp300 ribu; berlaku offline Traditional + Organized dan E-Store. **Online umum tanpa cashback**; **Trade-in Cashback A57 tidak ada** selama November.
3. **XL Prioritas A57:** additional CB hingga Rp1,5 juta pada sekitar enam toko **belum dipublikasikan**, karena daftar toko dan syarat Shoppel belum disediakan.
4. **S26 FE:** cashback trade-in berbeda untuk 12GB, 8/256GB, dan 8/128GB; jangan gabungkan.
5. **Buds 4 Pro:** **Organized CB Rp500 ribu**; **Traditional PWP diskon 20%**.
6. **Buds 3 FE:** consumer cashback Rp200 ribu **dihapus** pada November; sell-in discount Rp200 ribu bukan consumer CB. PWP 10% tetap.
7. **Watch 8 Classic:** program baru **PWP diskon 20%**, estimasi Rp1.399.000 tidak berarti fixed cashback.
8. **Tab S12:** RNPL **tidak berlaku selama November**; Traditional Buds 4 Pro PWP diskon 20%, Organized Buds 4 Pro cashback Rp500 ribu.
9. **Finance Plus:** Dobel Zero 0% bunga + 0% DP dengan admin **FIX 6% Flagship/TPS**, **FIX 8% A27/A08/A18** (dilebur ke cicilan). Finance Plus Free Admin/Processing Fee adalah **program berbeda**; jangan dipromosikan sebagai Dobel Zero. Biaya layanan Rp50.000 di depan khusus kategori yang disebut di bulletin.
10. **Easy Galaxy:** diperpanjang **hingga 31 Desember 2026**.

## Entri yang membutuhkan klarifikasi Admin

| Kode | Catatan |
|---|---|
| `a57-xl-pending` | Daftar ~6 Site ID XL Prioritas dan syarat program |
| `a18-adaptor-review` | Bulletin menyebut “Apple Adaptor”; konfirmasi istilah/produk |
| `a08-adaptor-review` | Sama: adaptor belum jelas |
| `a07-lte-adaptor` | Sama: adaptor belum jelas |
| `a17-lte-8-128-price` | RRP A17 LTE 8/128GB belum dipastikan; angka modal bukan harga konsumen |
| `buds-core` | Nama “Buds SCORE” dan “Buds Core” berbeda di dokumen; perlu SKU terverifikasi |

Keenam entri ini mempunyai `published=false`, `verification_state=draft`, `requires_review=true` dan **tidak terlihat bagi EC/TL/TSO**. Tidak boleh otomatis menerbitkannya.

## Panduan penggunaan

1. Login ke <https://samsung-kalteng.vercel.app>.
2. Pilih menu **Promo**.
3. Pilih status **Sedang berjalan**, filter model/varian, kategori, atau channel.
4. Baca semua baris benefit, nilai rupiah, status *tidak ada cashback*, dan syarat per channel.
5. Lihat label **Bulletin internal** atau **Sumber Samsung.com**; informasi nasional tetap memerlukan pemeriksaan kelayakan varian/channel sebelum menjanjikan nilai.
6. Panel dan filter **Draft Admin** telah dihapus dari UI. Enam draft historis tetap disimpan untuk audit dan tidak muncul dalam katalog nasional.
7. Dataset import ber-id unik dan migrasi `ON CONFLICT(import_key) DO NOTHING`, sehingga penerapan ulang tidak menimpa koreksi Admin yang dibuat sesudahnya.

## Keamanan

RLS `sales_promotions` dan `sales_promotion_stores` tetap aktif. Admin aktif mendapat akses edit; EC/TL/TSO aktif hanya melihat baris `verified+published` yang memenuhi RLS. Akun nonaktif tidak dapat membaca katalog. Migrasi tidak menyentuh `raw_sellout`, `store_targets`, `coverage_assignments`, maupun akun Auth.

## QA

`node tests/ops-smoke.cjs`
`node tests/ui-regression.cjs`
`node tests/intelligence-smoke.cjs`
`node tests/promo-master-20261106.cjs`

Browser E2E per role masih perlu verifikasi dengan sesi akun yang sah. Jangan menyimpulkan bahwa program berlaku di setiap toko hanya dari badge “Aktif” (tanggal berjalan).

## Pembaruan UI 7 November 2026

Katalog dipresentasikan secara nasional untuk semua peran aktif dan hanya memuat entri terbit. Dua panel Admin (verifikasi dan publikasi) serta tombol Admin untuk menonaktifkan/menerbitkan ulang tidak tersedia lagi. Pembaruan penawaran di masa depan memerlukan pengelolaan data terkontrol di luar UI. Kebijakan RLS/tabel database dan enam draft arsip tidak berubah.

## Siklus pembaruan katalog nasional — 7 November 2026

- Frontend tidak memuat teks bulan November sebagai judul sumber global. Sumber bulletin internal terbaru dihitung dari `source_date` pada entri nasional yang sedang diterbitkan.
- Filter default **Semua channel** berarti tidak memfilter channel; pilihan ganda `all` dihapus agar tidak sengaja menyembunyikan Traditional, Organized, E-Store, atau Online.
- Kartu promo menandai penawaran yang berakhir paling lambat dalam 7 hari, termasuk **Berakhir hari ini**. Kartu dengan status berakhir atau akan datang dilabel dengan jelas ketika pengguna memakai filter semua status.
- KPI tambahan menampilkan jumlah entri yang akan berakhir dalam 3 hari.
- Entri yang telah berakhir tetap ada untuk riwayat, tetapi tidak muncul pada filter awal **Sedang berjalan**. Saat tidak ada promo aktif, pengguna diarahkan untuk tidak menjanjikan cashback lama.
- Tanggal sumber internal **tidak sama** dengan pembuktian Samsung.com, dan tidak berarti katalog tersinkron otomatis.
- Alur update data yang dikendalikan tim: terima bulletin nasional → cek sumber, varian, channel, masa berlaku, dan informasi harga → hasilkan impor idempoten berprovenansi → jalankan uji integritas → rilis melalui staging → publikasikan setelah disetujui. Tidak ada form publikasi Admin di UI. Entri baru tidak otomatis dibuat atau diimpor oleh perubahan frontend.
