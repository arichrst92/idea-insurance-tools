import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { Blok, Inline } from "@/lib/domain/panduan";

function Baris({ isi }: { isi: Inline[] }) {
  return (
    <>
      {isi.map((x, i) =>
        x.t === "tebal" ? (
          <b key={i} className="font-semibold text-ink">
            {x.v}
          </b>
        ) : x.t === "tautan" ? (
          x.href.startsWith("/") ? (
            <Link key={i} href={x.href} className="font-semibold text-brand underline-offset-2 hover:underline">
              {x.v}
            </Link>
          ) : (
            <a key={i} href={x.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline-offset-2 hover:underline">
              {x.v}
            </a>
          )
        ) : (
          // *miring* sederhana di dalam teks biasa
          x.v.split(/(\*[^*]+\*)/g).map((s, j) => (s.startsWith("*") && s.endsWith("*") && s.length > 2 ? <i key={`${i}-${j}`}>{s.slice(1, -1)}</i> : s))
        ),
      )}
    </>
  );
}

/** Menampilkan isi panduan yang sudah diurai (lib/domain/panduan.ts). Tanpa HTML mentah. */
export function TeksPanduan({ blok }: { blok: Blok[] }) {
  return (
    <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-ink-2">
      {blok.map((b, i) => {
        switch (b.t) {
          case "judul":
            return (
              <h3 key={i} className="pt-1 text-base font-bold text-ink">
                <Baris isi={b.isi} />
              </h3>
            );
          case "paragraf":
            return (
              <p key={i}>
                <Baris isi={b.isi} />
              </p>
            );
          case "poin":
            return (
              <ul key={i} className="flex list-disc flex-col gap-1.5 pl-5 marker:text-ink-4">
                {b.item.map((it, j) => (
                  <li key={j}>
                    <Baris isi={it} />
                  </li>
                ))}
              </ul>
            );
          case "nomor":
            return (
              <ol key={i} className="flex list-decimal flex-col gap-1.5 pl-5 marker:font-semibold marker:text-ink-3">
                {b.item.map((it, j) => (
                  <li key={j}>
                    <Baris isi={it} />
                  </li>
                ))}
              </ol>
            );
          case "tanya":
            return (
              <details key={i} className="group rounded-2xl border border-line bg-canvas/60 px-4 py-3" data-uji="faq">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-ink">
                  <span>
                    <Baris isi={b.tanya} />
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-ink-3 transition group-open:rotate-180" aria-hidden />
                </summary>
                <div className="pt-2">
                  <TeksPanduan blok={b.jawab} />
                </div>
              </details>
            );
        }
      })}
    </div>
  );
}
