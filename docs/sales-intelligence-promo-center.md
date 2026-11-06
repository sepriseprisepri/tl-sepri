# Samsung Kalteng — Sales Intelligence + Promo Center

## Implementasi 6 November 2026

Pada branch `feature/sales-intelligence-promos-20261106`, UI lama tidak dibangun ulang. Integrasi memakai `index.html`, `ops-modules.js`, dan 3 modul baru:
- `sales-intelligence.js`: dashboard Smart Alerts, ringkasan personal, AI Sales Insight berbasis aturan, global search, dan 6 grafik di Chart Studio.
- `user-experience.js`: filter tersimpan per user dan preferensi kerapatan tabel.
- `promo-center.js`: kartu promo aktif, filter model/status, cakupan, detail T&C, URL official, form admin dan penonaktifan.
- `sales-intelligence.css`: responsif/mobile-first dengan visual sistem Aether Command.

## Role matrix

| Fitur | Admin | TL | TSO | EC |
|---|---|---|---|---|
| Smart Alerts | Semua data izin | Coverage TL | Coverage TSO | Penjualan pribadi / target |
| Search | Store/model/promoter RLS | RLS TL | RLS TSO | RLS EC |
| Chart | RLS Admin | RLS TL | RLS TSO | RLS EC |
| Saved Filter | Punya sendiri | Punya sendiri | Punya sendiri | Punya sendiri |
| Compact Table | Punya sendiri | Punya sendiri | Punya sendiri | Punya sendiri |
| AI Insight rule-based | Global | Coverage | Coverage | Pribadi |
| Promo Viewer | Draft + aktif | Published verified + scope | Published verified + scope | Published verified + scope |
| Promo Publish/Deactivate | Ya | Tidak | Tidak | Tidak |

**RLS adalah kontrol keamanan yang menentukan cakupan.** Search, filter browser, dan pemilihan chart tidak boleh dijadikan dasar otorisasi.

## Tabel dan relasi

- `sales_promotions`: satu penawaran untuk satu model (`model_code`, `model_name`) atau kampanye umum (`model_code='*'`). Mencatat benefit, syarat, kanal, tanggal, source URL, verification dan published.
- `sales_promotion_stores`: promosi dengan scope selected_stores dipetakan ke `public.stores.id`.
- `user_saved_filters`: milik `profiles.id`, unique (user_id, feature, filter_name), JSON max 4 KB.
- `user_ui_preferences`: user_id dan table_density compact/comfortable.
- Semua tabel baru punya RLS dan policy Admin-only untuk mengubah promo, user-only untuk filter/preferensi.
- SQL idempotent disimpan di `docs/sql/sales-intelligence-promotions-20261106.sql`; migration live `sales_intelligence_promo_filters_20261106` sudah diterapkan.

## Cara menambahkan promo per model

1. Admin masuk sebagai Admin aktif.
2. Menu **Promo** → **Admin · Publikasikan promo terverifikasi**.
3. Isi judul, model Samsung, benefit, syarat, channel, periode, dan URL halaman `samsung.com/id` atau `news.samsung.com/id` yang sesuai.
4. Untuk kanal yang hanya berlaku pada toko tertentu, pilih **Toko tertentu** dan isi daftar Site ID. Sistem menyimpan record *unpublished*, memetakan toko, lalu *published* pada langkah terakhir.
5. Periksa kartu Promo di akun TL/EC: hanya promosi yang verified + published + cakupan RLS yang boleh terlihat. Pemegang akun wajib membaca syarat lengkap.

**Penting:** Tidak tersedia feed resmi promo semua model yang terhubung otomatis. Katalog model dibentuk dari focus model dan sellout sesuai RLS; model tanpa promo khusus yang terverifikasi menampilkan *Belum ada promo model*. Kampanye umum tidak identik dengan jaminan cashback per model.

### Kampanye yang terverifikasi
- Year-End Sale Starts Early: 30 Oktober–30 November 2026.
- Source resmi: https://www.samsung.com/id/offer/black-friday/
- Penawaran umum Samsung.com: pilihan program cicilan 0%, trade-in, diskon berbeda per produk/bank/kanal. Tidak mengklaim nilai cashback per model.

## Smart Data Alerts

Alert menggunakan `raw_sellout.eula_status`, `raw_sellout.promoter_mapping_status`, `store_targets` dan `stores`.
- PENDING: transaksi belum terhitung.
- UNMAPPED / NO_PROMOTER_ID: mapping belum lengkap.
- Store tanpa target: hanya untuk non-EC yang punya cakupan.
- Store di bawah pace: actual_qty < 65% dari proyeksi linear target Qty menurut hari kalender berjalan.

Alert **bukan bukti pelanggaran**, hanya indikator yang perlu diverifikasi; tidak membuat/menyunting transaksi.

## Grafik Sellout

Chart.js digunakan kembali. Pilihan filter: toko (dalam scope), model, metric Qty/Amt.
- Daily line, weekly bar, top model bar, top store horizontal bar, EULA doughnut Qty, target & pace bar.
- STATUS PENDING tidak masuk actual resmi. Target khusus per model **belum** tersedia secara menyeluruh; grafik pace model memberi keterangan 'belum dialokasikan' dan tidak merekayasa target model.

## AI Sales Insight — tahapan kemampuan
- Fase terimplementasi: **analisis otomatis berbasis aturan yang deterministik** dari data RLS, ringkasan capaian, risiko, promo relevan, dan salin hasil.
- Fase opsional: LLM generatif melalui endpoint aman, dengan service credential tersimpan di server, hanya setelah biaya/API dan kebijakan privasi disetujui. **Tidak** ada secret AI ditempatkan di frontend.

## UI + performa
- Smart alerts dan AI box berada dalam dashboard; bisa buka halaman detail.
- Search header menawarkan store, promoter, model sesuai data scope. Search dikirim ke filter tabel ops yang mendukung query.
- Filter tersimpan server-side RLS; button density tersimpan per akun.
- HTML escaping untuk label/tabel, source URL promo divalidasi domain, form promo menolak tanggal terbalik.
- Komponen tidak mengandalkan localStorage untuk profil atau filter.

## Pemeriksaan rilis
- `node tests/ops-smoke.cjs`
- `node tests/ui-regression.cjs`
- `node tests/intelligence-smoke.cjs`
- Periksa workflow GitHub dan Vercel Preview READY sebelum menggabungkan.
- Browser E2E dengan akun Admin dan EC nyata belum dilakukan oleh agent. Perlu diperiksa: file import existing, login ID lama, onboarding TL_BMU, akses promo selected_stores, mobile viewport 360/430/768/1440, screen readers, network error fallback.

## Rollback
- UI: revert merge commit PR agar frontend kembali ke versi sebelumnya.
- SQL: **jangan drop tabel secara mendadak**; ini sudah berisi katalog promo dan preferensi user. Jika perlu rollback hanya sembunyikan link/menu baru terlebih dahulu. Review data dan backup sebelum skema dihapus.
- Tidak ada migrasi yang mengubah 129 coverage, 104 sellout, target yang sudah ada, maupun akun Auth TL_BMU.

## Keterbatasan
- Belum ada data competitor sellout yang valid untuk perbandingan brand.
- AI insight belum menggunakan model generatif.
- Tidak semua model Galaxy memiliki promo khusus terverifikasi. Hanya Admin/sumber resmi dapat menambahnya.
- Promosi kanal Samsung.com mungkin tidak berlaku pada semua toko fisik. Selalu konfirmasi syarat dengan sumber.
