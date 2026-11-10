# Rilis Focus Model EC — rollback non-destruktif (2026-11-10)

Target Supabase produksi: `xirmqdcdqpocdfqqvxmh`.
Target Vercel: `samsung-kalteng` / `prj_8Q6nbPL2IpsFO8iX5IDT1xwgTKKM`.

## Baseline pra-migrasi
- Postgres 17.11; proyek ACTIVE_HEALTHY.
- `focus_model_ec_allocations` dan `focus_model_allocation_history` **belum ada**; `set_focus_model_ec_allocation` **belum ada**.
- `focus_model_targets` berisi **0** baris.
- Policy parent `focus_targets_read_authorized` awal: `USING (can_access_store(store_id))`.
- Policy `focus_targets_admin_manage` membatasi tulis untuk Admin.
- Tidak ada alokasi EC saat migrasi. Kedua tabel baru harus berawal kosong.
- Security lints yang sudah ada: beberapa fungsi SECURITY DEFINER callable oleh authenticated, leaked password protection OFF. Jangan mengklaim lints tersebut diperbaiki oleh migrasi ini.

## Kill switch darurat (jangan menghapus data)
Pada masalah validasi otorisasi setelah migrasi, **segera hentikan jalur penulisan** tanpa menghapus target atau audit:
```sql
BEGIN;
REVOKE EXECUTE ON FUNCTION
 public.set_focus_model_ec_allocation(uuid,uuid,text,uuid,numeric,numeric)
 FROM authenticated, anon, PUBLIC;
COMMIT;
```
Pastikan `has_function_privilege('authenticated', ...,'EXECUTE')` mengembalikan false.
Untuk mengaktifkan kembali setelah insiden selesai: `GRANT EXECUTE ... TO authenticated;`

## Rollback frontend
Promosikan kembali deployment Vercel produksi sebelumnya yang berstatus READY (pilih ID dari `list_deployments` dan pastikan SHA / domain), atau rollback via kontrol Vercel. Jangan mengubah setting billing.

## Perubahan policy
Migrasi mengganti `focus_targets_read_authorized` sehingga EC tidak lagi membaca target model **tingkat toko**. Pertahankan kebijakan yang lebih ketat saat rollback frontend jika memungkinkan.
Jika revisi policy benar-benar diperlukan setelah review dan persetujuan perubahan akses data, baselinenya:
```sql
-- WARNING: restores legacy store-level parent read to EC. Review privacy.
DROP POLICY IF EXISTS focus_targets_read_authorized ON public.focus_model_targets;
CREATE POLICY focus_targets_read_authorized
 ON public.focus_model_targets FOR SELECT TO authenticated
 USING (public.can_access_store(store_id));
```

## Jangan lakukan
- Jangan DROP tabel alokasi, tabel audit, atau RPC dalam keadaan sudah ada data produksi.
- Jangan reset password atau mengubah target real pengguna.
- Jangan mengimpor data uji ke produksi.
- Jangan mengubah periode draft menjadi active otomatis.

## Verifikasi pascarilis
- Dua tabel baru RLS enabled, SELECT authenticated saja dengan policy scope; tidak ada INSERT/UPDATE/DELETE langsung.
- RPC authenticated EXECUTE, anon tidak; request TL lintas coverage dan EC ditolak (uji melalui stack lokal dan role simulasi yang aman).
- Jumlah alokasi dan audit tetap nol hingga Admin menetapkan plafon dan TL mulai alokasi.
- Domain utama mengarah ke deployment SHA hasil merge PR #29; kelanjutan PR harus dilindungi QA.
