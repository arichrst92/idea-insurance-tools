import { persen, rupiah } from "@/lib/format";

/**
 * Komisi sales dipecah menjadi komisi dasar (porsi normal) dan tambahan dari event,
 * dengan bar proporsi agar porsi event langsung terlihat.
 * `gelap` untuk kartu ringkasan berlatar ink.
 */
export function RincianKomisi({
  total,
  event,
  namaEvent,
  tambahanPersen,
  porsiSalesNormal,
  gelap = false,
  besar = true,
}: {
  total: number;
  event: number;
  namaEvent?: string | null;
  tambahanPersen?: number | null;
  /** % porsi sales normal (100 − % kantor normal), untuk label komisi dasar */
  porsiSalesNormal?: number | null;
  gelap?: boolean;
  besar?: boolean;
}) {
  const dasar = total - event;
  const adaEvent = event > 0;
  const pctEvent = total > 0 ? Math.round((event / total) * 1000) / 10 : 0;
  const redup = gelap ? "text-[#A9B0C2]" : "text-ink-3";
  const sorot = gelap ? "text-[#8FA8FF]" : "text-brand";
  const warnaEvent = gelap ? "text-[#FFD27A]" : "text-warn";

  return (
    <div className="flex flex-col gap-1.5" data-uji="rincian-komisi">
      <div className="flex items-baseline justify-between gap-3">
        <span className={`text-sm ${gelap ? "text-[#C9D5FF]" : "font-semibold text-ink-2"}`}>Komisi sales</span>
        <span className={`${besar ? "text-lg" : "text-base"} font-extrabold ${sorot}`}>{rupiah(total)}</span>
      </div>
      {adaEvent ? (
        <>
          <div className={`h-2 overflow-hidden rounded-full ${gelap ? "bg-[#232A3B]" : "bg-line"} flex`} aria-hidden>
            <span className={gelap ? "bg-[#8FA8FF]" : "bg-brand"} style={{ width: `${100 - pctEvent}%` }} />
            <span className={gelap ? "bg-[#FFD27A]" : "bg-warn"} style={{ width: `${pctEvent}%` }} />
          </div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[13px]">
            <dt className={redup}>
              <span className={`mr-1.5 inline-block size-2 rounded-full ${gelap ? "bg-[#8FA8FF]" : "bg-brand"}`} />
              Komisi dasar{porsiSalesNormal != null ? ` (porsi sales ${persen(porsiSalesNormal)})` : ""}
            </dt>
            <dd className={`text-right font-semibold ${gelap ? "text-white" : "text-ink"}`}>{rupiah(dasar)}</dd>
            <dt className={redup}>
              <span className={`mr-1.5 inline-block size-2 rounded-full ${gelap ? "bg-[#FFD27A]" : "bg-warn"}`} />
              Tambahan event{namaEvent ? ` ${namaEvent}` : ""}
              {tambahanPersen ? ` (+${persen(tambahanPersen)})` : ""} · {persen(pctEvent)} dari komisi
            </dt>
            <dd className={`text-right font-bold ${warnaEvent}`}>+{rupiah(event)}</dd>
          </dl>
        </>
      ) : (
        <p className={`text-[12px] ${redup}`}>Tanpa event{porsiSalesNormal != null ? ` · porsi sales ${persen(porsiSalesNormal)}` : ""}</p>
      )}
    </div>
  );
}
