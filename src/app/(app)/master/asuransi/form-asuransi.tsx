import { FormAksi } from "@/components/form-aksi";
import { Isian } from "@/components/ui";
import type { PerusahaanAsuransi } from "@/db/schema";
import { simpanAsuransi } from "../actions";

export function FormAsuransi({ data }: { data?: PerusahaanAsuransi }) {
  return (
    <FormAksi aksi={simpanAsuransi.bind(null, data?.id ?? null)} tombol={data ? "Simpan perubahan" : "Tambah asuransi"}>
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <Isian label="Nama perusahaan" name="nama" defaultValue={data?.nama} placeholder="Sinar Mas" required />
        <Isian label="Kode" name="kode" defaultValue={data?.kode} placeholder="SM" required maxLength={10} />
      </div>
      <Isian label="Alamat" name="alamat" defaultValue={data?.alamat ?? ""} />
      <Isian
        label="Termin cashback (hari)"
        name="terminCashbackHari"
        type="number"
        min={0}
        defaultValue={data?.terminCashbackHari ?? 30}
        hint="Batas wajar cashback cair setelah premi disetor; dipakai pengingat penagihan."
      />
      {data && (
        <label className="flex items-center gap-2.5 text-sm text-ink-2">
          <input type="checkbox" name="aktif" defaultChecked={data.aktif} className="size-4 accent-brand" /> Aktif
        </label>
      )}
    </FormAksi>
  );
}
