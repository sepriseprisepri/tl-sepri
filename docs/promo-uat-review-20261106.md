# UAT dan review Promo Master November 2026

**Tujuan:** memastikan 61 entri bulletin internal yang diimpor ditampilkan secara tepat, enam informasi yang belum pasti tetap tertahan, dan proses klarifikasi Admin tidak melemahkan RLS.

## Status aktual yang sudah diverifikasi (6 November 2026)
- Katalog: 62 entri (61 dari bulletin internal + 1 kampanye Samsung.com).
- Entri bulletin internal terbit: 55.
- Draft butuh klarifikasi: **6**, seluruhnya `published=false`, `requires_review=true`, `initial_review_required=true`.
- Admin aktif dapat melihat 62, EC aktif hanya melihat 56 yang diterbitkan; akun nonaktif tidak dapat membaca katalog.
- Tidak ada entri yang otomatis disetujui oleh migration ini.
- Status waktu mengikuti timezone Asia/Pontianak: setelah `end_date`, item tampil di filter **Sudah berakhir**, bukan **Sedang berjalan**.

## Alur Admin
1. Buka menu **Promo** → **Admin · Klarifikasi promo tertunda**.
2. Pilih satu dari enam item pada dropdown.
3. Pastikan nama model/SKU, varian, channel, benefit, detail JSON `offer_items`, syarat, dan Site ID sesuai hasil klarifikasi.
4. **Simpan koreksi sebagai draft** bila masih perlu konfirmasi — aman, tidak menerbitkan.
5. Untuk persetujuan, isi **bukti tertulis** (nomor memo, tanggal, penanggung jawab, dan detail konfirmasi) minimal 25 karakter; centang konfirmasi. Tekan **Setujui & terbitkan**.
6. Database menerima penerbitan hanya jika `requires_review=false`, metadata `review_evidence`, `reviewed_at`, dan `reviewed_by` tersedia. Penanda `initial_review_required` tidak dapat diturunkan ke false setelah dibuat.
7. Periksa katalog EC/TL sesuai RLS. Promo tetap diberi label **Bulletin Internal**, bukan `Samsung.com official`.

## Enam review wajib
| Kode | Isu | Bukti yang wajib |
|---|---|---|
| `a18-adaptor-review` | Bundling adaptor disebut “Apple Adaptor” | SKU adaptor Samsung yang tepat & varian yang eligible |
| `a08-adaptor-review` | Istilah adaptor ambigu | Konfirmasi isi paket dan periode |
| `a07-lte-adaptor` | Istilah adaptor ambigu | Konfirmasi adaptor dan syarat |
| `a17-lte-8-128-price` | RRP 8/128GB belum final | RRP final; JSON detail wajib `price_idr` positif |
| `a57-xl-pending` | Cashback tambahan XL Prioritas di ~6 toko | Site ID toko eligible, channel, syarat, nominal, periode. Penyimpanan relasi toko harus sukses sebelum publish |
| `buds-core` | “Buds SCORE” vs Buds Core | SKU resmi dan mekanisme PWP final |

Jangan memasukkan nilai estimasi sebagai harga final. Jika bukti tidak diperoleh, pertahankan `draft`.

## UAT browser yang perlu dijalankan oleh tim
| Peran | Skenario | Hasil diharapkan |
|---|---|---|
| Admin | Menu Promo, status Draft Admin | 6 item antrean sebelum ada approval, tombol Simpan draft/Setujui |
| Admin | Simpan draft A17 tanpa RRP | Sukses tetap sebagai draft |
| Admin | Coba approve tanpa bukti tertulis | Ditolak, tidak terbit |
| Admin | Coba approve XL tanpa Site ID | Ditolak, tidak terbit |
| Admin | Approve sesuai bukti resmi | Draft berubah menjadi internal published setelah cakupan disimpan |
| TL/TSO | Pilih model dan channel | Hanya promo dalam RLS, tidak melihat draft |
| EC | Pilih Galaxy S25 FE Organized | Tidak boleh menjanjikan cashback Rp2 juta Traditional |
| EC | Pilih Galaxy A57 Online | Informasi tanpa cashback, bukan program offline |
| EC | Buds 4 Pro Traditional vs Organized | PWP 20% vs cashback Rp500 ribu jelas dibedakan |
| Semua | Ganti ke filter Sudah berakhir pada 18 Nov | Program 1–17 Nov tidak lagi ditampilkan sebagai sedang berjalan |
| Mobile | 360px, 430px, 768px | Form dapat di-scroll dan input tidak tumpang tindih |
| Accessibility | Keyboard Tab, Enter, Escape | Semua input dan tombol operasional terjangkau |

**Catatan:** pengujian GitHub Actions dan simulasi role SQL bukan pengganti sesi browser nyata. Jangan meminta password pengguna atau mengaktifkan akun melalui QA.

## Security
- Review hanya tersedia bagi `profile.role=admin` di frontend.
- RLS `sales_promos_admin_manage` tetap menjadi pengontrol server untuk perubahan.
- Constraint database menolak `published=true` untuk `requires_review=true`.
- Untuk keenam item tertahan, database mensyaratkan bukti dan identitas reviewer. Trigger tidak mengizinkan penanda review awal dihapus.
- `promo-review.js` tidak menyimpan kredensial maupun data promo ke `localStorage` dan tidak memiliki Supabase service-role key.

## Rollback
- Frontend: revert PR review UI apabila terdapat regresi, tanpa mengubah tabel promo yang sudah ada.
- Database: **jangan drop metadata review** apabila sudah ada entri yang disetujui karena hal tersebut menghilangkan bukti approval. Periksa backup dan status record terlebih dahulu.
- Perubahan ini tidak mengubah `raw_sellout`, `store_targets`, `coverage_assignments`, atau data Auth.
