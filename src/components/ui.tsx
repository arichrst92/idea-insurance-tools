import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

export function Tombol({
  varian = "utama",
  className,
  ...p
}: ComponentProps<"button"> & { varian?: "utama" | "kedua" | "wa" | "bahaya" }) {
  return (
    <button
      {...p}
      className={clsx(
        "inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        varian === "utama" && "bg-ink text-white hover:bg-black",
        varian === "kedua" && "border border-line-2 bg-white text-ink hover:border-ink-4",
        varian === "wa" && "bg-wa text-white hover:brightness-110",
        varian === "bahaya" && "border border-bad/30 bg-white text-bad hover:bg-bad-soft",
        className,
      )}
    />
  );
}

export function TautanTombol({
  varian = "utama",
  className,
  ...p
}: ComponentProps<typeof Link> & { varian?: "utama" | "kedua" }) {
  return (
    <Link
      {...p}
      className={clsx(
        "inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition",
        varian === "utama" ? "bg-ink text-white hover:bg-black" : "border border-line-2 bg-white text-ink hover:border-ink-4",
        className,
      )}
    />
  );
}

export function Kartu({ className, ...p }: ComponentProps<"section">) {
  return <section {...p} className={clsx("rounded-[20px] border border-line bg-white p-5", className)} />;
}

export const kelasInput =
  "h-11 w-full rounded-xl border border-line-2 bg-white px-3.5 text-[15px] text-ink outline-none placeholder:text-ink-4 focus:border-brand focus:ring-4 focus:ring-brand-soft";

export function Isian({
  label,
  hint,
  className,
  ...p
}: ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className={clsx("flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2", className)}>
      {label}
      <input {...p} className={kelasInput} />
      {hint && <span className="text-xs font-normal text-ink-3">{hint}</span>}
    </label>
  );
}

export function IsianPanjang({
  label,
  hint,
  className,
  ...p
}: ComponentProps<"textarea"> & { label: string; hint?: string }) {
  return (
    <label className={clsx("flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2", className)}>
      {label}
      <textarea
        {...p}
        className="min-h-28 w-full rounded-xl border border-line-2 bg-white px-3.5 py-2.5 text-[15px] font-normal leading-relaxed text-ink outline-none placeholder:text-ink-4 focus:border-brand focus:ring-4 focus:ring-brand-soft"
      />
      {hint && <span className="text-xs font-normal text-ink-3">{hint}</span>}
    </label>
  );
}

export function Pilihan({
  label,
  children,
  className,
  ...p
}: ComponentProps<"select"> & { label: string }) {
  return (
    <label className={clsx("flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2", className)}>
      {label}
      <select {...p} className={kelasInput}>
        {children}
      </select>
    </label>
  );
}

export function Lencana({
  nada = "netral",
  children,
}: {
  nada?: "netral" | "brand" | "ok" | "warn" | "bad";
  children: ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[11px] font-bold tracking-wide",
        nada === "netral" && "bg-[#F1F3F9] text-ink-2",
        nada === "brand" && "bg-brand-soft text-brand-ink",
        nada === "ok" && "bg-ok-soft text-ok",
        nada === "warn" && "bg-warn-soft text-warn",
        nada === "bad" && "bg-bad-soft text-bad",
      )}
    >
      {children}
    </span>
  );
}

/** Judul halaman dengan breadcrumb pil. */
export function KepalaHalaman({
  jejak,
  judul,
  sorot,
  sub,
  aksi,
}: {
  jejak: { label: string; href?: string }[];
  judul: string;
  /** Bagian judul yang diwarnai brand */
  sorot?: string;
  sub?: ReactNode;
  aksi?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb" className="self-start">
        <ol className="flex flex-wrap items-center gap-1 rounded-full border border-line bg-white p-1 pr-3 text-[13px]">
          <li>
            <Link
              href="/"
              className="flex size-7 items-center justify-center rounded-full bg-ink text-[10px] font-extrabold text-white"
              aria-label="Beranda"
            >
              RA
            </Link>
          </li>
          {jejak.map((j, i) => (
            <li key={i} className="flex items-center gap-1">
              <span aria-hidden className="text-ink-4">/</span>
              {j.href ? (
                <Link href={j.href} className="rounded-full px-1.5 py-0.5 font-medium text-ink-2 hover:text-ink">
                  {j.label}
                </Link>
              ) : (
                <span aria-current="page" className="rounded-full bg-brand-soft px-2.5 py-0.5 font-semibold text-brand-ink">
                  {j.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[32px] font-extrabold leading-[1.08] tracking-tight sm:text-[40px]">
            {judul} {sorot && <span className="text-brand">{sorot}</span>}
          </h1>
          {sub && <p className="text-[15px] text-ink-2">{sub}</p>}
        </div>
        {aksi && <div className="flex flex-wrap gap-2">{aksi}</div>}
      </div>
    </header>
  );
}

export function Kosong({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line-2 px-4 py-8 text-center text-sm text-ink-3">{children}</p>;
}

export function Pesan({ error, ok }: { error?: string; ok?: string }) {
  if (error) return <p role="alert" className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm text-bad">{error}</p>;
  if (ok) return <p className="rounded-xl bg-ok-soft px-3.5 py-2.5 text-sm text-ok">{ok}</p>;
  return null;
}
