import { FileText, X } from "lucide-react";
import type { dokumen } from "@/db/schema";
import { FormAksi } from "@/components/form-aksi";
import { hapusDokumen, uploadDokumen } from "./actions";

type Dok = typeof dokumen.$inferSelect;

const LABEL: Record<string, string> = { ktp: "KTP", stnk: "STNK", foto_kendaraan: "Foto kendaraan" };

/** Galeri dokumen + form upload untuk satu pemilik (nasabah atau kendaraan). */
export function Dokumen({
  pemilik,
  daftar,
  jenis,
}: {
  pemilik: { tipe: "nasabah" | "kendaraan"; id: string };
  daftar: Dok[];
  jenis: ("ktp" | "stnk" | "foto_kendaraan")[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {jenis.map((j) => {
        const isi = daftar.filter((d) => d.jenis === j);
        return (
          <div key={j} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className={jenis.length > 1 ? "text-[13px] font-bold" : "text-[13px] text-ink-3"}>
                {jenis.length > 1 ? LABEL[j] : "File"}
              </span>
              <span className={`text-xs ${isi.length ? "text-ok" : "text-warn"}`}>{isi.length ? `${isi.length} file` : "Belum ada"}</span>
            </div>
            {isi.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {isi.map((d) => (
                  <li key={d.id} className="group relative">
                    <a
                      href={`/api/dokumen/${d.id}`}
                      target="_blank"
                      rel="noreferrer"
                      title={d.namaFile ?? ""}
                      className="flex size-20 items-center justify-center overflow-hidden rounded-xl border border-line bg-canvas"
                    >
                      {d.fileKey.endsWith(".pdf") ? (
                        <span className="flex flex-col items-center gap-1 text-[10px] font-bold text-bad">
                          <FileText size={22} aria-hidden />
                          PDF
                        </span>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/dokumen/${d.id}`} alt={LABEL[j]} className="size-full object-cover" loading="lazy" />
                      )}
                    </a>
                    <form action={hapusDokumen.bind(null, d.id)} className="absolute -right-1.5 -top-1.5">
                      <button
                        aria-label="Hapus file"
                        className="flex size-6 items-center justify-center rounded-full border border-line bg-white text-ink-3 opacity-0 shadow-sm transition hover:text-bad focus:opacity-100 group-hover:opacity-100"
                      >
                        <X size={13} />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      <FormAksi
        aksi={uploadDokumen.bind(null, pemilik)}
        tombol="Upload"
        varian="kedua"
        resetSetelahOk
        className="flex flex-col gap-2 rounded-2xl border border-dashed border-line-2 p-3 sm:flex-row sm:flex-wrap sm:items-center"
      >
        {jenis.length > 1 ? (
          <select name="jenis" className="h-10 rounded-full border border-line-2 bg-white px-3 text-sm" aria-label="Jenis dokumen">
            {jenis.map((j) => (
              <option key={j} value={j}>
                {LABEL[j]}
              </option>
            ))}
          </select>
        ) : (
          <input type="hidden" name="jenis" value={jenis[0]} />
        )}
        <input
          type="file"
          name="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
          required
          aria-label="Pilih file"
          className="w-full min-w-0 text-sm text-ink-2 sm:w-auto sm:flex-1 file:mr-3 file:h-9 file:rounded-full file:border-0 file:bg-brand-soft file:px-4 file:text-sm file:font-semibold file:text-brand-ink"
        />
      </FormAksi>
    </div>
  );
}
