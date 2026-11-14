# Analisis AI generatif TL — draft Workers AI Free

Fitur masih nonaktif. Server memverifikasi sesi dan peran TL, mengambil data dengan JWT dan RLS, lalu menghitung Qty mingguan yang sesuai coverage. Workers AI menerima hanya tanggal, status minggu parsial dan total Qty Samsung serta kompetitor; identitas, nama toko, harga, rincian transaksi dan token pengguna tidak disertakan. Ringkasan berbasis aturan tetap ada jika AI tidak tersedia. Output generatif dapat keliru.

## Batas biaya dan keamanan

- Model draft: `@cf/zai-org/glm-4.7-flash`, model multibahasa Workers AI yang didokumentasikan tersedia untuk Workers Free pada saat persiapan. Jangan otomatis beralih ke model berbayar.
- JANGAN AKTIFKAN sebelum pemilik memverifikasi akun benar-benar menggunakan **Workers Free**, tidak memakai Workers Paid atau unified billing berbayar, dan bebas dari tagihan lain. `AI_WORKERS_FREE_CONFIRMED=true` hanyalah penanda konfigurasi; tidak memverifikasi status paket secara otomatis.
- Workers Free memiliki kuota Workers AI bersama 10.000 Neurons per hari (reset 00:00 UTC), setelah itu permintaan gagal. Harga, kuota dan ketersediaan model dapat berubah; periksa dokumentasi dan dashboard saat aktivasi. Batas 20 permintaan per TL per hari WIB adalah tambahan, bukan pengganti kuota akun.
- Cloudflare menyatakan permintaan inference standar tanpa fitur stateful diproses tanpa retensi setelah pemrosesan dan tidak digunakan untuk pelatihan, dengan pengecualian yang tercantum dalam kebijakannya. Jangan aktifkan logging atau caching payload AI.
- Pemakaian Vercel dan Supabase tetap memiliki ketentuan dan kuota sendiri; rancangan ini tidak menjamin keseluruhan proyek gratis selamanya.

## Persiapan dan pengujian

1. Uji secara terisolasi dengan data sintetis: role dan coverage, sesi tidak valid, dua minggu dan toko, kuota harian serta permintaan bersamaan, kehabisan kuota, error jaringan dan output model.
2. Review SQL dan backup; migrasi quota produksi memerlukan persetujuan terpisah. Kuota menggunakan operasi atomik dan RPC memeriksa TL aktif.
3. Siapkan token Cloudflare terbatas untuk Workers AI, sesuai dokumen Cloudflare, dan hanya di environment server; jangan masukkan token ke source atau chat. Endpoint API memerlukan `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN`, `SUPABASE_URL`, dan `SUPABASE_ANON_KEY`.
4. Hanya sesudah verifikasi paket, pengujian dan persetujuan, tetapkan `AI_WORKERS_FREE_CONFIRMED=true` dan `AI_INSIGHT_ENABLED=true` di environment yang tepat. Kedua flag default nonaktif, dan token tidak pernah dikirim ke browser.
5. Uji preview dengan data sintetis terlebih dahulu. Rilis setelah role, akses data, batas biaya dan regresi diverifikasi.

## Rollback

Nonaktifkan `AI_INSIGHT_ENABLED` dan deploy ulang; endpoint gagal tertutup dan ringkasan berbasis aturan tetap tersedia. Simpan tabel quota untuk audit, dan gunakan migrasi terpisah jika perlu mencabut RPC atau menghapusnya.
