# Dashboard, Target EC/TL dan Artificial Insight — QA Tahap 1 (10 November 2026)

## Status
- Branch `feat/dashboard-targets-wow-insights`, PR #29 (DRAFT).
- **Tidak ada perubahan Supabase produksi, Auth, RLS, password pengguna, atau deployment Vercel produksi.**
- Uji JS, metric & simulator interaksi grafik **PASS**: https://github.com/sepriseprisepri/tl-sepri/actions/runs/42835833189
- Vercel API menolak pembuatan deployment preview terbaru: kuota gratis harian tercapai (HTTP 402 `api-deployments-free-per-day`). Preview lebih lama di branch tidak mencerminkan commit terbaru. Tidak melakukan upgrade/billing.

## Perhitungan yang konsisten

Semua data bersumber dari query Supabase yang dibatasi oleh RLS dan periode aktif. Tidak memakai service_role di browser.

- EC: target dari `ec_target_allocations` yang difilter `manpower_id` akun sendiri. Transaksi `raw_sellout` dibatasi RLS dengan Site ID **dan** Promoter ID milik EC aktif.
- TL/TSO/Admin: target `store_targets` sesuai scope RLS toko; bukan menyatakan data EC di luar coverage.
- Penjualan pencapaian = **EULA VALID** dengan `sold_at` di dalam periode dan tidak melebihi tanggal lokal (Asia/Pontianak). EULA PENDING tidak ditambahkan ke realisasi.
- Target MTD = target periode × hari berjalan ÷ jumlah hari kalender periode.
- Gap penuh = target periode − actual VALID. Gap MTD = target MTD − actual VALID. Gap positif berarti kurang dari target, negatif berarti melebihi target.
- Target Daily = max(0, target penuh − actual VALID) ÷ hari kalender tersisa, termasuk hari ini selama periode aktif. Periode selesai: target harian tidak tersedia pada UI target.
- **Qty dibulatkan untuk tampilan saja**; pecahan target tetap dipakai dalam kalkulasi achievement/target harian; nilai uang dibulatkan rupiah untuk display.
- Jika target belum tersedia, pencapaian % tidak dipaksakan menjadi nol.
- **WoW** = (minggu terbaru lengkap − minggu sebelumnya lengkap) ÷ minggu sebelumnya lengkap × 100%; hanya apabila dua minggu kalender lengkap berurutan berada di dalam periode/filter, dan jumlah sebelumnya positif. Minggu parsial diberi * pada grafik dan tidak mendapatkan garis growth. Grafik menampilkan hari/minggu dengan nol penjualan agar tidak menyembunyikan gaps.

## Perubahan UI

1. Dashboard menampilkan kartu Target MTD Qty, Gap MTD Qty, Target Daily Qty dan Sellout WoW.
2. Target Saya (EC) / Target (TL): Target Qty, VALID Qty, Gap Qty, Gap Amt, Target MTD Qty/Amt, Target Daily Qty/Amt, rincian per toko, AR Qty/Amt, insight action.
3. Grafik Sellout: filter toko, model, Qty/Amount, mulai/sampai tanggal, saved filter, serta penjelasan hasil filter. Target bulanan tidak dibandingkan melawan rentang tanggal parsial atau model tanpa target spesifik.
4. Artificial Insight dapat menjelaskan pace, kebutuhan harian, lengkap/tidaknya WoW, EULA PENDING dan model terlaris. **Bukan AI generatif**, tidak membuat angka prediksi tanpa sumber.

## Pemeriksaan otomatis

- `tests/market-metrics.cjs`: MTD, future-dated exclusion, EULA, no target, target daily, minggu kalender lengkap, growth dan rounding.
- `tests/market-chart-interactions.cjs`: simulated DOM, lima grafik, filter toko/model/tanggal, tanggal tanpa transaksi, WoW, status target periode parsial dan saved filters.
- Regresi lama tetap dipanggil dalam `.github/workflows/ops-smoke.yml`.

## Tindak lanjut yang belum diimplementasi

**Focus Model khusus EC/TL:** tabel `focus_model_targets` sekarang berorientasi toko dan hanya Admin yang diizinkan mengubah. Permintaan "EC hanya melihat target model yang dialokasikan TL" tidak boleh disimulasikan dengan target toko karena akan melebih-lebihkan target personal. Dibutuhkan rancangan alokasi *per EC* (manpower_id, store_id, model_code, period_id, qty, amt, assigned_by), RLS TL berdasarkan coverage, EC self-read, penanganan alokasi saat EC pindah toko, dan kontrol jumlah alokasi tidak melebihi target model toko. Rancang dan uji di staging sebelum migrasi produksi.

**External market intelligence:** integrasi berita/pricing smartphone global memerlukan sumber resmi, timestamp, atribusi, batas wilayah, penundaan update dan biaya API yang disetujui. Jangan menggabungkan harga global dengan harga lokal tanpa kurs/waktu.

## Gate deploy
- Selesaikan smoke UI berbasis browser nyata pada preview yang memuat commit final ketika kuota Vercel tersedia.
- Tinjau tampilan EC dan TL menggunakan akun dummy sah (bukan password pengguna produksi).
- Review dan setujui merge PR #29; release Vercel hanya setelah QA, tanpa migrasi data.
