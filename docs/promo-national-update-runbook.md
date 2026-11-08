# Operasional Pembaruan Promo Nasional — Samsung Kalteng

**Status:** alur persiapan data tersedia; impor ke database dan penerbitan **tidak otomatis**. Tidak ada panel verifikasi/publikasi Admin dalam website.

## Prinsip

- Hanya gunakan bulletin nasional yang benar-benar diterima dan disetujui pemilik program. Jangan mengarang promo atau menyatakan bulletin internal telah diverifikasi di Samsung.com.
- Promo nasional dapat memiliki ketentuan berbeda per **channel, varian, bank, tanggal, dan stok**.
- Semua entri baru masuk sebagai **draft**: `published=false`, `verification_state='draft'`, `requires_review=true`, `verified_at=NULL`.
- Importer hanya membuat SQL untuk ditinjau. **Tidak terhubung ke Supabase, tidak meminta token, dan tidak menerbitkan promo**.
- Identitas `import_key` wajib unik dan stabil. Konflik terhadap data sebelumnya dilewati, **tidak menimpa** perbaikan yang telah ada.

## Cara mempersiapkan batch

Buat file JSON dari bulletin yang sudah diberikan. Contoh format di bawah **hanya contoh pengujian; bukan promo nyata**, jangan jalankan terhadap produksi.

```json
{
  "schema_version": 1,
  "promotions": [
    {
      "import_key": "national-20261201-contoh-internal",
      "title": "CONTOH SAJA - tidak untuk dijual",
      "model_code": "EXAMPLE",
      "model_name": "Model Contoh",
      "benefit": "Data dummy - bukan penawaran",
      "terms": "Hanya untuk menguji proses impor",
      "channel_label": "Traditional",
      "start_date": "2026-12-01",
      "end_date": "2026-12-12",
      "source_reference": "Fixture contoh untuk pengujian",
      "source_date": "2026-11-30",
      "program_category": "smartphone",
      "sku_variant": "Contoh",
      "channel_code": "traditional",
      "record_kind": "offer",
      "offer_items": [{"name": "Contoh manfaat", "amount_idr": 100000}]
    }
  ]
}
```

```bash
node scripts/prepare-national-promos.cjs ./batch-promo.json ./draft-promo.sql
node tests/promo-import-preflight.cjs
```

Periksa output: `draft-promo.sql` menyisipkan entri baru yang belum terpublikasi. File yang sudah ada **tidak ditimpa**. Pastikan file hasil batch nyata **tidak di-commit** ke repositori bila mengandung informasi program yang belum diumumkan.

## Urutan aman untuk batch nyata

1. Periksa asal bulletin, keaslian periode, kanal, SKU/varian, mekanisme cashback, dan semua syarat promosi.
2. Jalankan validator offline dan uji ketidaksesuaian nominal atau duplikasi `import_key` terhadap batch dan database **staging**.
3. Simpan backup atau snapshot sebelum perubahan di staging. Jalankan SQL draft di staging terlebih dahulu; lakukan pemeriksaan integritas, RLS untuk Admin/TL/TSO/EC, jumlah baris, serta `published=false`.
4. Siapkan skrip penerbitan terpisah **hanya** untuk `import_key` yang dinyatakan lengkap dan disetujui. Skrip ini bukan bagian dari generator dan harus ditinjau untuk setiap rilis.
5. Setelah persetujuan produksi yang eksplisit, lakukan backup, transaksi terkontrol, pemeriksaan pasca-perubahan, serta verifikasi tanggal/channel pada halaman Promo sebagai pengguna yang berwenang.
6. Jika tidak ada bukti persetujuan atau masih ada pengecualian yang belum jelas, pertahankan draft. Jangan menerbitkan otomatis.

## Publikasi/rollback

Tidak ada SQL publikasi generik yang otomatis dijalankan: keputusan publikasi harus didasarkan pada identitas batch dan data yang tervalidasi. Rollback idealnya dengan memulihkan status publish dari snapshot awal **hanya untuk `import_key` batch tersebut**, bukan menghapus atau menonaktifkan seluruh katalog.

Database masih memiliki izin tulis Admin di layer RLS, sekalipun tombol Admin tidak tersedia di antarmuka. Perubahan RLS/RPC **memerlukan migration, pengujian staging, dan persetujuan tersendiri**.

## Batasan

- Generator ini menangani `source_type='internal_bulletin'` saja. Kampanye `official_web` mengikuti jalur dokumentasi sumber resmi terpisah.
- Tidak ada feed API Samsung.com yang diasumsikan tersedia.
- Status `verified` di dataset lama bisa berarti hasil transkripsi bulletin internal, **bukan** konfirmasi eksternal Samsung.
