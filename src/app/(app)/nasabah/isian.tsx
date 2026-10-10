import { Isian, Pilihan } from "@/components/ui";
import type { kendaraan, nasabah } from "@/db/schema";
import { formatNoWa } from "@/lib/wa";

type Nasabah = typeof nasabah.$inferSelect;
type Kendaraan = typeof kendaraan.$inferSelect;

export function IsianNasabah({ data }: { data?: Nasabah }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Isian label="Nama lengkap / nama badan" name="nama" defaultValue={data?.nama} required />
      <Pilihan label="Tipe" name="tipe" defaultValue={data?.tipe ?? "perorangan"}>
        <option value="perorangan">Perorangan</option>
        <option value="badan">Badan usaha</option>
      </Pilihan>
      <Isian
        label="No. WhatsApp"
        name="noWa"
        inputMode="tel"
        defaultValue={data ? formatNoWa(data.noWa) : ""}
        placeholder="0812 3456 7890"
        hint="Untuk instruksi bayar, remind perpanjangan, dan link tracker."
        required
      />
      <Isian label="NIK" name="nik" inputMode="numeric" maxLength={16} defaultValue={data?.nik ?? ""} hint="16 digit, sesuai KTP" />
      <Isian label="Email" name="email" type="email" defaultValue={data?.email ?? ""} />
      <Isian label="Tanggal lahir" name="tglLahir" type="date" defaultValue={data?.tglLahir ?? ""} />
      <Isian label="Alamat" name="alamat" defaultValue={data?.alamat ?? ""} className="sm:col-span-2" />
    </div>
  );
}

export function IsianKendaraan({ data, wajib = true }: { data?: Kendaraan; wajib?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Isian label="No. polisi" name="noPolisi" defaultValue={data?.noPolisi} placeholder="D 1234 ABC" required={wajib} />
      <Isian label="Merek" name="merek" defaultValue={data?.merek} placeholder="Toyota" required={wajib} />
      <Isian label="Model / tipe" name="model" defaultValue={data?.model} placeholder="Avanza 1.5 G" required={wajib} />
      <Isian label="Tahun" name="tahun" type="number" min={1980} defaultValue={data?.tahun} required={wajib} />
      <Isian label="Warna" name="warna" defaultValue={data?.warna ?? ""} />
      <div />
      <Isian label="No. rangka" name="noRangka" defaultValue={data?.noRangka ?? ""} />
      <Isian label="No. mesin" name="noMesin" defaultValue={data?.noMesin ?? ""} />
    </div>
  );
}
