import Link from "next/link";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import clsx from "clsx";
import { db } from "@/db";
import { bengkel, kendaraan, klaim, nasabah, perusahaanAsuransi, polis, users } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { Kartu, KepalaHalaman, Kosong, Lencana } from "@/components/ui";
import { STATUS_TERBIT } from "@/lib/perpanjangan";
import { LABEL_KLAIM } from "./galeri";
import { adalahStaf } from "@/lib/peran";

export const metadata = { title: "Klaim" };

const TAB = { diproses: "Diproses", selesai: "Selesai", ditolak: "Ditolak", semua: "Semua" } as const;

export default async function HalamanKlaim({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { user } = await wajibLogin();
  const sp = await searchParams;
  const admin = adalahStaf(user);
  const tab = (sp.tab && sp.tab in TAB ? sp.tab : "diproses") as keyof typeof TAB;
  const q = sp.q?.trim() ?? "";
  const milik = admin ? undefined : or(eq(polis.salesId, user.id), eq(nasabah.salesId, user.id));

  const [daftar, ringkas, hasilCari] = await Promise.all([
    db
      .select({
        k: klaim,
        noPolis: polis.noPolis,
        polisId: polis.id,
        nasabah: nasabah.nama,
        plat: kendaraan.noPolisi,
        asuransi: perusahaanAsuransi.nama,
        bengkel: bengkel.nama,
        sales: users.nama,
        foto: sql<number>`(select count(*) from dokumen d where d.pemilik_tipe = 'klaim' and d.pemilik_id = ${klaim.id})`.mapWith(Number),
      })
      .from(klaim)
      .innerJoin(polis, eq(polis.id, klaim.polisId))
      .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
      .innerJoin(kendaraan, eq(kendaraan.id, polis.kendaraanId))
      .innerJoin(users, eq(users.id, polis.salesId))
      .leftJoin(perusahaanAsuransi, eq(perusahaanAsuransi.id, polis.perusahaanId))
      .leftJoin(bengkel, eq(bengkel.id, klaim.bengkelId))
      .where(and(milik, tab === "semua" ? undefined : eq(klaim.status, tab)))
      .orderBy(desc(klaim.tglKlaim), desc(klaim.dibuat))
      .limit(200),
    db
      .select({ status: klaim.status, n: sql<number>`count(*)`.mapWith(Number) })
      .from(klaim)
      .innerJoin(polis, eq(polis.id, klaim.polisId))
      .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
      .where(milik)
      .groupBy(klaim.status),
    q
      ? db
          .select({ id: polis.id, noPolis: polis.noPolis, nasabah: nasabah.nama, plat: kendaraan.noPolisi, tglMulai: polis.tglMulai, tglAkhir: polis.tglAkhir })
          .from(polis)
          .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
          .innerJoin(kendaraan, eq(kendaraan.id, polis.kendaraanId))
          .where(
            and(
              milik,
              inArray(polis.statusPengajuan, [...STATUS_TERBIT]),
              or(
                ilike(polis.noPolis, `%${q}%`),
                ilike(nasabah.nama, `%${q}%`),
                ilike(sql`replace(${kendaraan.noPolisi}, ' ', '')`, `%${q.replace(/\s/g, "")}%`),
              ),
            ),
          )
          .orderBy(desc(polis.tglMulai))
          .limit(10)
      : Promise.resolve([]),
  ]);
  const jumlah = (t: keyof typeof TAB) => (t === "semua" ? ringkas.reduce((a, r) => a + r.n, 0) : (ringkas.find((r) => r.status === t)?.n ?? 0));

  return (
    <>
      <KepalaHalaman jejak={[{ label: "Klaim" }]} judul="Klaim" sorot="nasabah" sub="Catat klaim (tanggal kejadian, bengkel, foto) dan pantau prosesnya." />

      <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-3">
          <nav aria-label="Filter status klaim" className="overflow-x-auto">
            <ul className="inline-flex gap-1 rounded-full border border-line bg-white p-1 text-[13px] font-semibold">
              {(Object.keys(TAB) as (keyof typeof TAB)[]).map((t) => (
                <li key={t}>
                  <Link
                    href={`/klaim?tab=${t}`}
                    aria-current={t === tab ? "page" : undefined}
                    className={clsx("flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5", t === tab ? "bg-ink text-white" : "text-ink-2")}
                  >
                    {TAB[t]}
                    <span className={clsx("rounded-full px-1.5 text-[11px]", t === tab ? "bg-white/20" : "bg-canvas text-ink-3")}>{jumlah(t)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {daftar.length === 0 ? (
            <Kosong>Belum ada klaim di sini.</Kosong>
          ) : (
            daftar.map((d) => (
              <Link key={d.k.id} href={`/klaim/${d.k.id}`} className="block">
                <Kartu className="flex items-start justify-between gap-3 transition hover:border-brand">
                  <div className="min-w-0">
                    <div className="font-bold">{d.nasabah}</div>
                    <div className="text-sm text-ink-2">
                      {d.plat} · {d.noPolis} · {d.asuransi}
                    </div>
                    <div className="text-[13px] text-ink-3">
                      Kejadian {d.k.tglKlaim}
                      {d.bengkel && ` · ${d.bengkel}`} · {d.foto} foto
                      {admin && ` · ${d.sales}`}
                    </div>
                    {d.k.catatan && <p className="mt-1 line-clamp-2 text-[13px] text-ink-2">{d.k.catatan}</p>}
                  </div>
                  <Lencana nada={LABEL_KLAIM[d.k.status][1]}>{LABEL_KLAIM[d.k.status][0]}</Lencana>
                </Kartu>
              </Link>
            ))
          )}
        </div>

        <Kartu className="flex flex-col gap-3">
          <h2 className="text-base font-bold">Catat klaim</h2>
          <form role="search" className="flex gap-2">
            <input type="hidden" name="tab" value={tab} />
            <input
              name="q"
              defaultValue={q}
              aria-label="Cari polis"
              placeholder="Plat, no. polis, atau nama"
              className="h-11 min-w-0 flex-1 rounded-full border border-line-2 bg-white px-4 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
            />
            <button className="h-11 rounded-full bg-ink px-5 text-sm font-semibold text-white">Cari</button>
          </form>
          {q && hasilCari.length === 0 && <p className="text-sm text-ink-3">Polis terbit tidak ditemukan.</p>}
          <ul className="flex flex-col gap-2">
            {hasilCari.map((h) => (
              <li key={h.id}>
                <Link href={`/klaim/baru?polis=${h.id}`} className="flex items-center justify-between gap-2 rounded-2xl border border-line p-3 hover:border-brand">
                  <span>
                    <b>{h.plat}</b> · {h.nasabah}
                    <span className="block text-xs text-ink-3">
                      {h.noPolis} · {h.tglMulai} – {h.tglAkhir}
                    </span>
                  </span>
                  <span className="text-sm font-semibold text-brand">Catat →</span>
                </Link>
              </li>
            ))}
          </ul>
        </Kartu>
      </div>
    </>
  );
}
