# Samsung Kalteng — Sales Intelligence + Promo Center

## Implementasi 6 November 2026

Pada branch `feature/sales-intelligence-promos-20261106`, UI lama tidak dibangun ulang. Integrasi memakai `index.html`, `ops-modules.js`, dan 3 modul baru:
- `sales-intelligence.js`: dashboard Smart Alerts, ringkasan personal, AI Sales Insight berbasis aturan, global search, dan 6 grafik di Chart Studio.
- `user-experience.js`: filter tersimpan per user dan preferensi kerapatan tabel.
- `promo-center.js`: kartu promo nasional read-only, filter model/status/channel, detail T&C, dan asal sumber resmi/bulletin internal.
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
| Promo Viewer | Nasional terbit | Nasional terbit | Nasional terbit | Nasional terbit |
| Promo Publish/Deactivate | Tidak ada di UI | Tidak ada di UI | Tidak ada di UI | Tidak ada di UI |

**RLS adalah kontrol keamanan yang menentukan cakupan.** Search, filter browser, dan pemilihan chart tidak boleh dijadikan dasar otorisasi.

## Tabel dan relasi

- `sales_promotions`: satu penawaran untuk satu model (`model_code`, `model_name`) atau kampanye umum (`model_code='*'`). Mencatat benefit, syarat, kanal, tanggal, source URL, verification dan published.
- `sales_promotion_stores`: promosi dengan scope selected_stores dipetakan ke `public.stores.id`.
- `user_saved_filters`: milik `profiles.id`, unique (user_id, feature, filter_name), JSON max 4 KB.
- `user_ui_preferences`: user_id dan table_density compact/comfortable.
- Semua tabel baru punya RLS dan policy Admin-only untuk mengubah promo, user-only untuk filter/preferensi.
- SQL idempotent disimpan di `docs/sql/sales-intelligence-promotions-20261106.sql`; migration live `sales_intelligence_promo_filters_20261106` sudah diterapkan.

## Katalog Promo Nasional (read-only sejak 7 November 2026)

- Menu **Promo** menampilkan penawaran nasional yang telah diterbitkan bagi semua peran aktif (Admin, TSO, TL, EC); hanya data dengan `published=true`, `verification_state=verified`, dan `scope_type=national`.
- Tidak ada panel **Admin · Antrean Klarifikasi Promo**, **Admin · Publikasikan promo terverifikasi**, pilihan draft, maupun tombol menonaktifkan/menerbitkan ulang pada kartu promo.
- Perubahan katalog masa depan dilakukan melalui proses pembaruan data yang terkontrol di luar UI, bukan melalui form Admin.
- Tidak tersedia sinkronisasi otomatis promosi nasional dari Samsung. Penggunaan kata **nasional** tidak berarti cashback setiap model sama atau berlaku di semua channel. Selalu patuhi pengecualian channel, varian, periode, dan ketentuan regular/non-PO.
- Enam draft historis belum terpublikasi tetap berada dalam database untuk audit; penghapusan UI **tidak menghapus** data.
- RLS dan izin Admin di database belum diubah oleh pembaruan frontend ini. Ini **bukan** penonaktifan API tulis pada lapisan database.

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
