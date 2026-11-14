# Analisis AI generatif TL — draft implementasi

Fitur ini masih nonaktif. API hanya menerima ID periode, dua label minggu dan ID toko opsional. Server memverifikasi sesi Supabase dan profil TL aktif, mengambil toko serta transaksi dengan JWT pengguna dan RLS, memeriksa cakupan, lalu menghitung Qty VALID Samsung dan Qty kompetitor. Model hanya menerima jumlah per minggu, tanggal, status parsial dan keterangan cakupan; nama, ID toko, identitas EC, rincian transaksi, harga dan token sesi tidak dikirim kepada model. Jawaban model diperlakukan sebagai ringkasan yang dapat keliru, bukan fakta eksternal atau prediksi.

## Aktivasi dan prasyarat

- Uji RLS dan integrasi API menggunakan data sintetis di database staging terisolasi; uji TL di dalam dan luar coverage, EC, sesi kedaluwarsa, quota 20/hari, permintaan paralel, tanggal melewati batas bulan/tahun dan kegagalan penyedia.
- Review SQL, backup, dan minta persetujuan sebelum migrasi produksi. SQL membatasi 20 permintaan per TL per hari WIB menggunakan operasi atomik. RPC hanya diizinkan kepada authenticated dan memeriksa kembali TL aktif serta status rotasi password melalui current_app_role.
- Pilih model/penyedia, periksa perlindungan data dan biaya, dan tentukan anggaran gateway serta batasnya sebelum mengaktifkan layanan. Contoh kode menggunakan Vercel AI Gateway dengan `openai/gpt-4.1-mini`.
- Atur `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `AI_GATEWAY_API_KEY` dan `AI_INSIGHT_ENABLED=true` dalam environment server yang tepat. Jangan meletakkan gateway key pada kode klien atau chat. Pastikan perilaku saat batas kredit habis tidak menghasilkan biaya tidak diinginkan.
- Uji preview dengan sesi TL dan data sintetis terlebih dahulu, kemudian lakukan rilis dan pantau biaya serta kegagalan.

## Rollback

Set `AI_INSIGHT_ENABLED` tidak sama dengan `true` dan deploy ulang agar endpoint gagal tertutup; ringkasan berbasis aturan tetap tersedia. Pertahankan tabel quota untuk audit/perbaikan. Pencabutan RPC dan penghapusan penyimpanan memerlukan migrasi terpisah setelah memastikan tidak ada permintaan berjalan.
