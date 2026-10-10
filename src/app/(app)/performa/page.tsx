import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { Trophy } from "lucide-react";
import clsx from "clsx";
import { db } from "@/db";
import { users } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { Kartu, KepalaHalaman, Lencana } from "@/components/ui";
import { Angka, FilterPeriode } from "@/components/laporan";
import { filterDari, type SP } from "../laporan/util";
import { capaian, peringkat, realisasiSemua, targetRentang } from "@/lib/performa";
import { renewal } from "@/lib/laporan";
import { angka, persen, rupiah } from "@/lib/format";

export const metadata = { title: "Performa" };

function Bar({ label, nilai, target, persenCapai, format }: { label: string; nilai: number; target: number; persenCapai: number; format: (n: number) => string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="font-semibold text-ink-2">{label}</span>
        <span className="tabular-nums text-ink-3">
          {format(nilai)} / {format(target)} · <b className={persenCapai >= 100 ? "text-ok" : "text-ink"}>{persen(persenCapai)}</b>
        </span>
      </div>
      <div className="h-2 rounded-full bg-canvas">
        <div className={clsx("h-2 rounded-full", persenCapai >= 100 ? "bg-ok" : "bg-brand")} style={{ width: `${Math.min(100, persenCapai)}%` }} />
      </div>
    </div>
  );
}

export default async function HalamanPerforma({ searchParams }: { searchParams: Promise<SP> }) {
  const { user } = await wajibLogin();
  const admin = user.role === "admin";
  const sp = await searchParams;
  const { p } = filterDari(sp);

  const daftarSales = await db
    .select()
    .from(users)
    .where(and(eq(users.role, "sales"), eq(users.aktif, true)))
    .orderBy(asc(users.nama));
  const [semua, targets, ren] = await Promise.all([realisasiSemua(p.dari, p.sampai), targetRentang(p.dari, p.sampai), renewal(user, { dari: p.dari, sampai: p.sampai })]);
  const urut = peringkat(semua, daftarSales.map((s) => s.id));
  const nama = new Map(daftarSales.map((s) => [s.id, s]));
  const renSales = new Map(ren.perSales.map((r) => [r.salesId, r]));

  if (!admin) {
    const saya = urut.find((r) => r.salesId === user.id) ?? { salesId: user.id, polis: 0, premi: 0, komisi: 0, rank: urut.length + 1 };
    const t = targets.get(user.id);
    const c = capaian(t, saya);
    return (
      <>
        <KepalaHalaman jejak={[{ label: "Performa" }]} judul="Performa" sorot="saya" sub="Dihitung dari polis yang terbit di periode ini." />
        <FilterPeriode aksi="/performa" p={p} nilai={{}} tampilkan={[]} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-uji="performa-saya">
          <Angka label="Peringkat" nilai={`#${saya.rank}`} sub={`dari ${urut.length} sales (berdasarkan premi)`} nada={saya.rank <= 3 ? "ok" : undefined} />
          <Angka label="Polis terbit" nilai={angka(saya.polis)} />
          <Angka label="Premi" nilai={rupiah(saya.premi)} />
          <Angka label="Komisi Anda" nilai={rupiah(saya.komisi)} />
        </div>
        {t && c && (
          <Kartu className="flex flex-col gap-3">
            <h2 className="text-base font-bold">Target {p.label}</h2>
            <Bar label="Case (polis)" nilai={saya.polis} target={t.targetCase} persenCapai={c.pCase} format={angka} />
            <Bar label="Revenue (premi)" nilai={saya.premi} target={t.targetRevenue} persenCapai={c.pRev} format={rupiah} />
            <p className="text-[13px] text-ink-3">Target utama: {t.utama === "case" ? "case" : "revenue"}.</p>
          </Kartu>
        )}
        <Link href={`/performa/${user.id}`} className="self-start text-sm font-semibold text-brand">
          Riwayat per bulan & estimasi gaji →
        </Link>
      </>
    );
  }

  const top = urut.filter((r) => r.premi > 0).slice(0, 3);
  return (
    <>
      <KepalaHalaman jejak={[{ label: "Performa" }]} judul="Performa" sorot="sales" sub="Peringkat berdasarkan premi polis yang terbit di periode ini. Sales hanya melihat performa & peringkatnya sendiri." />
      <FilterPeriode aksi="/performa" p={p} nilai={{}} tampilkan={[]} />
      {top.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3" data-uji="top-performer">
          {top.map((r) => (
            <Kartu key={r.salesId} className={clsx("flex flex-col gap-1", r.rank === 1 && "border-brand-edge bg-brand-soft/40")}>
              <span className="flex items-center gap-2 text-[13px] font-bold text-ink-2">
                <Trophy size={16} className={r.rank === 1 ? "text-warn" : "text-ink-3"} aria-hidden /> #{r.rank}
              </span>
              <Link href={`/performa/${r.salesId}`} className="text-lg font-extrabold hover:text-brand">
                {nama.get(r.salesId)?.nama}
              </Link>
              <span className="text-sm tabular-nums text-ink-2">
                {rupiah(r.premi)} · {r.polis} polis
              </span>
            </Kartu>
          ))}
        </div>
      )}
      <Kartu className="overflow-x-auto p-0" data-uji="tabel-performa">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-ink-3">
            <tr className="border-b border-line">
              <th className="px-5 py-3 font-semibold">#</th>
              <th className="px-3 py-3 font-semibold">Sales</th>
              <th className="px-3 py-3 text-right font-semibold">Polis</th>
              <th className="px-3 py-3 text-right font-semibold">Premi</th>
              <th className="px-3 py-3 font-semibold">Target utama</th>
              <th className="px-3 py-3 text-right font-semibold">Komisi</th>
              <th className="px-5 py-3 text-right font-semibold">Renewal</th>
            </tr>
          </thead>
          <tbody>
            {urut.map((r) => {
              const s = nama.get(r.salesId)!;
              const c = capaian(targets.get(r.salesId), r);
              const rn = renSales.get(r.salesId);
              return (
                <tr key={r.salesId} className="border-b border-line last:border-0 hover:bg-canvas">
                  <td className="px-5 py-3 font-bold text-ink-3">{r.rank}</td>
                  <td className="px-3 py-3">
                    <Link href={`/performa/${r.salesId}`} className="font-semibold hover:text-brand">
                      {s.nama}
                    </Link>
                    <div className="text-xs text-ink-3">{s.tipeSales === "fulltime" ? "Fulltime" : "Freelance"}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.polis}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{rupiah(r.premi)}</td>
                  <td className="px-3 py-3">
                    {c ? (
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-20 rounded-full bg-canvas">
                          <span className={clsx("block h-1.5 rounded-full", c.pUtama >= 100 ? "bg-ok" : "bg-brand")} style={{ width: `${Math.min(100, c.pUtama)}%` }} />
                        </span>
                        <span className="tabular-nums">{persen(c.pUtama)}</span>
                        {c.pUtama >= 100 && <Lencana nada="ok">ACHIEVE</Lencana>}
                      </span>
                    ) : (
                      <span className="text-ink-3">–</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{rupiah(r.komisi)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{rn ? `${persen(rn.rate)} (${rn.diperpanjang}/${rn.jatuhTempo})` : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Kartu>
    </>
  );
}
