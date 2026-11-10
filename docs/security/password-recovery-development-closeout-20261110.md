# Laporan Penutupan Pengembangan Password Recovery — 10 November 2026

**Kesimpulan:** Implementasi fitur, simulasi, PostgreSQL integration, dan Supabase local E2E telah dilakukan. **PR #28 tetap Draft/NO-GO untuk produksi** karena konfigurasi Turnstile riil, gateway anti-abuse, pengujian schema-only lengkap, dan persetujuan produksi final belum tersedia.

## Bukti PASS pada pengujian terakhir

| Test | Tautan dan hasil |
|---|---|
| PostgreSQL 16: real production RPC body, mandatory Admin rotation gate, EC/TL target & coverage, idempotent Master Database import | [PASS](https://github.com/sepriseprisepri/tl-sepri/actions/runs/42821182687) |
| Supabase lokal: GoTrue + PostgREST + Edge Runtime, request/approval, TL+EC rotate, expired/reissue, stale JWT, **dua Admin bersamaan** | [PASS](https://github.com/sepriseprisepri/tl-sepri/actions/runs/42821182761) |
| Operational smoke, frontend/TS mocks, Auth error recovery | [PASS](https://github.com/sepriseprisepri/tl-sepri/actions/runs/42821182703) |

Bukti di atas berasal dari commit pengujian `1988ab113765e0a3a1e5bf958ed3e22995149b34`. Dokumentasi yang ditambahkan setelah commit tersebut tidak mengubah kode runtime. Pengujian saat menggunakan real Supabase lokal memakai data dummy dan test CAPTCHA Cloudflare; tidak menyentuh Supabase cloud.

## Hasil sistem yang telah dikembangkan

1. Form Login memiliki tombol Lupa Password; kesalahan kredensial membuka modal Lupa Password / Reset Password.
2. Permintaan ditampilkan pada panel Admin; role biasa tidak dapat menyetujui.
3. Admin memverifikasi identitas, menyetujui permintaan, menerima temporary password unik 28 karakter yang hanya ditampilkan sekali dan dikirim secara privat/manual.
4. Akun terblokir dari dashboard/API bisnis selama wajib ganti password, termasuk JWT lama.
5. Login dengan temporary password → form pembuatan password baru → wajib login ulang.
6. Temporary credential tidak dapat menyelesaikan rotasi setelah batas 24 jam; Admin dapat menerbitkan ulang.
7. Permintaan yang gagal/tertahan dapat dipulihkan; `processing` hanya dapat diklaim setelah 15 menit dengan compare-and-swap.
8. RLS draft pada 19 tabel, guard `current_app_role`, dan guard `commit_master_database` tersedia dalam draft SQL, tidak aktif di produksi.
9. Regresi Master Database dummy membuktikan import dan upsert manpower, stores, targets, EC allocations dan TL coverage tetap bekerja.

## Yang **belum** selesai di lingkungan produksi

- Cloudflare Turnstile domain `samsung-kalteng.vercel.app` dan secret produksi. Tidak ada nilai rahasia di GitHub.
- Abuse protections tingkat gateway untuk percobaan lintas banyak ID; HMAC per-ID dan CAPTCHA belum cukup sebagai kontrol global.
- Snapshot schema-only lengkap (20 tabel + constraint + seluruh fungsi/policy) melalui pg_dump dari proyek produksi dan uji regresi menggunakan clone tersebut.
- Review pengetatan grant `anon`, SECURITY DEFINER search_path, dan pengaturan leaked-password protection pada Supabase Auth. Memerlukan keputusan kompatibilitas aplikasi.
- Jalur pengiriman kredensial aman secara operasional: pesan privat manual, bukan koneksi WhatsApp otomatis.
- Backup/rollback produksi yang dieksekusi; baru ada runbook/prosedur draft.
- Persetujuan final eksplisit untuk perubahan produksi.

## Langkah agar kelak bisa deploy

1. Siapkan Turnstile resmi dan gateway anti-abuse; lakukan uji.
2. Buat schema-only staging, jalankan seluruh tes dan audit grant/RPC pada salinan struktur sebenarnya.
3. Review risiko, backup, dan rencana rollback di `docs/security/password-recovery-release-runbook-20261110.md`.
4. Ajukan persetujuan khusus untuk migrasi/deploy (belum termasuk mass reset password).
5. Jika disetujui dan tes final lulus, deploy secara bertahap; reset akun produksi hanya jika ada persetujuan terpisah.

**Produksi:** Tidak ada password, profil, Auth user, SQL/RLS, Edge Function, atau frontend produksi yang diubah. **Tidak ada resource berbayar dibuat.**
