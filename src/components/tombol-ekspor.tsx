import { FormAksi } from "@/components/form-aksi";
import { mintaPdf } from "@/app/(app)/ekspor/actions";
import type { JenisEkspor } from "@/lib/ekspor/antrian";

/** Tombol "Ekspor PDF" yang membawa filter halaman saat ini. */
export function TombolPdf({ jenis, filter }: { jenis: JenisEkspor; filter: Record<string, string | undefined> }) {
  return (
    <FormAksi aksi={mintaPdf.bind(null, jenis)} tombol="Ekspor PDF" varian="kedua" className="flex flex-col items-end gap-1">
      {Object.entries(filter)
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
    </FormAksi>
  );
}
