import Link from "next/link";
import clsx from "clsx";
import { Check, ChevronRight } from "lucide-react";
import { centangOnboarding, tutupOnboarding } from "@/app/(app)/panduan/actions";
import type { onboardingSales } from "@/lib/panduan";
import { Kartu } from "@/components/ui";

type Data = Awaited<ReturnType<typeof onboardingSales>>;

/** Checklist 5 langkah awal sales. `ringkas` = versi dashboard (bisa disembunyikan). */
export function ChecklistOnboarding({ data, ringkas = false }: { data: Data; ringkas?: boolean }) {
  const persen = Math.round((data.selesai / data.total) * 100);
  return (
    <Kartu className="flex flex-col gap-4" data-uji="onboarding" id="onboarding">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-lg font-bold">{data.beres ? "Langkah awal selesai" : "5 langkah awal"}</h2>
          <p className="text-[13px] text-ink-3" data-uji="onboarding-progres">
            {data.selesai} dari {data.total} selesai
          </p>
        </div>
        {ringkas && (
          <div className="flex items-center gap-3 text-[13px] font-semibold">
            <Link href="/panduan" className="text-brand">
              Buka panduan
            </Link>
            <form action={tutupOnboarding}>
              <button className="text-ink-3 hover:text-ink">Sembunyikan</button>
            </form>
          </div>
        )}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#EEF0F6]" aria-hidden>
        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${persen}%` }} />
      </div>
      <ol className="flex flex-col divide-y divide-line">
        {data.langkah.map((l, i) => (
          <li key={l.kode} className="flex items-center gap-3 py-3" data-uji={`langkah-${l.kode}`} data-selesai={l.selesai ? "1" : "0"}>
            <span
              className={clsx(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold",
                l.selesai ? "bg-ok text-white" : "border border-line-2 text-ink-3",
              )}
            >
              {l.selesai ? <Check className="size-4" aria-label="Selesai" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={clsx("text-sm font-semibold", l.selesai && "text-ink-3 line-through decoration-ink-4")}>{l.judul}</p>
              <p className="text-[13px] text-ink-3">
                {l.kode === "rekening" && data.rekening
                  ? `${data.rekening.bank} ${data.rekening.no} a.n. ${data.rekening.atasNama} — salah? hubungi admin.`
                  : l.kode === "rekening"
                    ? "Rekening komisi belum didaftarkan. Kirim nomor rekening Anda ke admin."
                    : l.ket}
              </p>
            </div>
            {!l.selesai &&
              (l.manual && !ringkas ? (
                <form action={centangOnboarding.bind(null, l.kode)}>
                  <button className="h-8 rounded-full border border-line-2 px-3 text-[12px] font-semibold hover:border-ink-4">Sudah paham</button>
                </form>
              ) : l.kode !== "rekening" ? (
                <Link href={l.href} className="flex items-center text-[13px] font-semibold text-brand" aria-label={`Kerjakan: ${l.judul}`}>
                  {ringkas ? "Buka" : "Mulai"} <ChevronRight className="size-4" aria-hidden />
                </Link>
              ) : null)}
          </li>
        ))}
      </ol>
    </Kartu>
  );
}
