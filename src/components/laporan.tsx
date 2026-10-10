import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";
import { Kartu } from "@/components/ui";
import { LABEL_PERIODE, type KodePeriode, type Periode } from "@/lib/domain/periode";
import { angka, rupiah } from "@/lib/format";

const kelasSelect =
  "h-10 rounded-full border border-line-2 bg-white px-3.5 text-sm font-semibold text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft";

/** Filter laporan via GET (bisa di-bookmark & dibagikan). */
export function FilterPeriode({
  aksi,
  p,
  nilai,
  pilihan,
  tampilkan = ["sales", "asuransi", "paket"],
  ekstra,
}: {
  aksi: string;
  p: Periode;
  nilai: { sales?: string; asuransi?: string; paket?: string };
  pilihan?: { sales: { id: string; nama: string }[]; asuransi: { id: string; nama: string }[]; paket: { id: string; nama: string; asuransi: string }[] };
  tampilkan?: ("sales" | "asuransi" | "paket")[];
  ekstra?: ReactNode;
}) {
  const kodes = Object.keys(LABEL_PERIODE) as KodePeriode[];
  return (
    <form action={aksi} className="flex flex-col gap-3" role="search" aria-label="Filter laporan">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap gap-1 rounded-full border border-line bg-white p-1 text-[13px] font-semibold">
          {kodes
            .filter((k) => k !== "kustom")
            .map((k) => (
              <label key={k} className="cursor-pointer">
                <input type="radio" name="periode" value={k} defaultChecked={p.kode === k} className="peer sr-only" />
                <span className="flex rounded-full px-3.5 py-1.5 text-ink-2 peer-checked:bg-ink peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand">
                  {LABEL_PERIODE[k]}
                </span>
              </label>
            ))}
          <label className="cursor-pointer">
            <input type="radio" name="periode" value="kustom" defaultChecked={p.kode === "kustom"} className="peer sr-only" />
            <span className="flex rounded-full px-3.5 py-1.5 text-ink-2 peer-checked:bg-ink peer-checked:text-white">Tanggal</span>
          </label>
        </div>
        <input type="date" name="dari" defaultValue={p.dari} aria-label="Dari tanggal" className={kelasSelect} />
        <span className="text-ink-3">–</span>
        <input type="date" name="sampai" defaultValue={p.sampai} aria-label="Sampai tanggal" className={kelasSelect} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {pilihan && tampilkan.includes("sales") && pilihan.sales.length > 0 && (
          <select name="sales" defaultValue={nilai.sales ?? ""} aria-label="Sales" className={kelasSelect}>
            <option value="">Semua sales</option>
            {pilihan.sales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nama}
              </option>
            ))}
          </select>
        )}
        {pilihan && tampilkan.includes("asuransi") && (
          <select name="asuransi" defaultValue={nilai.asuransi ?? ""} aria-label="Asuransi" className={kelasSelect}>
            <option value="">Semua asuransi</option>
            {pilihan.asuransi.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nama}
              </option>
            ))}
          </select>
        )}
        {pilihan && tampilkan.includes("paket") && (
          <select name="paket" defaultValue={nilai.paket ?? ""} aria-label="Paket" className={kelasSelect}>
            <option value="">Semua paket</option>
            {pilihan.paket.map((s) => (
              <option key={s.id} value={s.id}>
                {s.asuransi} · {s.nama}
              </option>
            ))}
          </select>
        )}
        <button className="h-10 rounded-full bg-ink px-5 text-sm font-semibold text-white">Terapkan</button>
        {ekstra}
      </div>
      <p className="text-[13px] text-ink-3">
        Periode: <b className="text-ink-2">{p.label}</b> ({p.dari} s/d {p.sampai})
      </p>
    </form>
  );
}

/** Kartu angka ringkas. */
export function Angka({ label, nilai, sub, href, nada }: { label: string; nilai: ReactNode; sub?: ReactNode; href?: string; nada?: "warn" | "bad" | "ok" }) {
  const isi = (
    <Kartu className={clsx("flex h-full flex-col gap-1", href && "transition hover:border-brand")}>
      <span className="text-[13px] font-medium text-ink-3">{label}</span>
      <span className={clsx("whitespace-nowrap text-[19px] font-extrabold tracking-tight tabular-nums sm:text-2xl lg:text-[28px]", nada === "warn" && "text-warn", nada === "bad" && "text-bad", nada === "ok" && "text-ok")}>
        {nilai}
      </span>
      {sub && <span className="text-[12px] text-ink-3">{sub}</span>}
    </Kartu>
  );
  return href ? <Link href={href}>{isi}</Link> : isi;
}

export type Kolom<T> = { label: string; nilai: (r: T) => ReactNode; kanan?: boolean; className?: string };

/** Tabel dengan bar proporsi pada kolom utama (premi). */
export function TabelBar<T>({
  judul,
  baris,
  kolom,
  bar,
  kosong = "Belum ada data di periode ini.",
  kaki,
  uji,
}: {
  judul: string;
  baris: T[];
  kolom: Kolom<T>[];
  bar?: { nilai: (r: T) => number; label: (r: T) => ReactNode };
  kosong?: string;
  kaki?: ReactNode;
  uji?: string;
}) {
  const maks = bar ? Math.max(1, ...baris.map(bar.nilai)) : 1;
  return (
    <Kartu className="flex flex-col gap-3 overflow-hidden p-0" data-uji={uji}>
      <h2 className="px-5 pt-4 text-base font-bold">{judul}</h2>
      {baris.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-ink-3">{kosong}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className={clsx("w-full text-sm", kolom.length <= 3 ? "min-w-[340px]" : "min-w-[880px]")}>
            <thead className="text-left text-[11px] uppercase tracking-wider text-ink-3">
              <tr className="border-b border-line">
                {bar && <th className="px-5 py-2 font-semibold">Nama</th>}
                {kolom.map((k) => (
                  <th key={k.label} className={clsx("px-3 py-2 font-semibold", k.kanan && "text-right", k.className)}>
                    {k.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {baris.map((r, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  {bar && (
                    <td className={clsx("px-5 py-2.5", kolom.length <= 3 ? "w-[55%]" : "w-[24%]")}>
                      <div className="font-semibold">{bar.label(r)}</div>
                      <div className="mt-1 h-1.5 rounded-full bg-canvas">
                        <div className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.max(2, (bar.nilai(r) / maks) * 100)}%` }} />
                      </div>
                    </td>
                  )}
                  {kolom.map((k) => (
                    <td key={k.label} className={clsx("whitespace-nowrap px-3 py-2.5 tabular-nums", k.kanan && "text-right", k.className)}>
                      {k.nilai(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {kaki}
          </table>
        </div>
      )}
    </Kartu>
  );
}

export { rupiah, angka };
