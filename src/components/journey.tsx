import clsx from "clsx";
import type { StatusPengajuan } from "@/db/schema";
import { LANGKAH, LABEL_CABANG, nomorLangkah } from "@/lib/domain/journey";
import { Lencana } from "./ui";

/** Warna lencana status: biru = berjalan, hijau = selesai, kuning = revisi, merah = ditutup. */
export function nadaStatus(s: StatusPengajuan): "brand" | "ok" | "warn" | "bad" {
  if (s === "selesai") return "ok";
  if (s === "perlu_revisi") return "warn";
  if (s === "ditolak_asuransi" || s === "batal_nasabah") return "bad";
  return "brand";
}

export function LencanaStatus({ status }: { status: StatusPengajuan }) {
  const n = nomorLangkah(status);
  const label = n ? LANGKAH[n - 1].label : LABEL_CABANG[status];
  return <Lencana nada={nadaStatus(status)}>{(n ? `${n}/12 · ` : "") + label?.toUpperCase()}</Lencana>;
}

/**
 * Progress bar 12 checkpoint. Untuk status cabang, `terakhir` = langkah terakhir yang dicapai
 * sebelum bercabang (dari riwayat), ditampilkan dengan warna peringatan/bahaya.
 */
export function BarJourney({ status, terakhir }: { status: StatusPengajuan; terakhir?: number }) {
  const n = nomorLangkah(status) ?? terakhir ?? 0;
  const cabang = nomorLangkah(status) === null;
  const warnaNow = status === "perlu_revisi" ? "bg-warn" : cabang ? "bg-bad" : status === "selesai" ? "bg-ok" : "bg-brand";
  return (
    <div className="flex items-center gap-[3px]" role="img" aria-label={`Langkah ${n} dari 12`}>
      {LANGKAH.map((l, i) => {
        const k = i + 1;
        return (
          <span
            key={l.status}
            title={l.label}
            className={clsx(
              "h-2 flex-1 rounded-full",
              k < n && (status === "selesai" ? "bg-ok" : "bg-ink"),
              k === n && warnaNow,
              k > n && "bg-line",
            )}
          />
        );
      })}
    </div>
  );
}
