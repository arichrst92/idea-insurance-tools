import { FileText } from "lucide-react";

/** Thumbnail dokumen privat (lewat /api/dokumen). */
export function Galeri({ daftar, label = "Foto" }: { daftar: { id: string; fileKey: string; namaFile: string | null }[]; label?: string }) {
  if (daftar.length === 0) return <p className="text-sm text-ink-3">Belum ada foto.</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {daftar.map((d) => (
        <li key={d.id}>
          <a
            href={`/api/dokumen/${d.id}`}
            target="_blank"
            rel="noreferrer"
            title={d.namaFile ?? ""}
            className="flex size-24 items-center justify-center overflow-hidden rounded-xl border border-line bg-canvas"
          >
            {d.fileKey.endsWith(".pdf") ? (
              <span className="flex flex-col items-center gap-1 text-[10px] font-bold text-bad">
                <FileText size={22} aria-hidden />
                PDF
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/dokumen/${d.id}`} alt={label} className="size-full object-cover" loading="lazy" />
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}

export const kelasFile =
  "w-full text-sm text-ink-2 file:mr-3 file:h-9 file:rounded-full file:border-0 file:bg-brand-soft file:px-4 file:text-sm file:font-semibold file:text-brand-ink";

export const LABEL_KLAIM = {
  diproses: ["DIPROSES", "warn"],
  selesai: ["SELESAI", "ok"],
  ditolak: ["DITOLAK", "bad"],
} as const;
