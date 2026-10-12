import Link from "next/link";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { kategoriPolis, kendaraan, nasabah, perusahaanAsuransi, polis, users } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { Kartu, KepalaHalaman, Kosong, Lencana } from "@/components/ui";
import { rupiah } from "@/lib/format";
import { adalahStaf } from "@/lib/peran";

export const metadata = { title: "Polis" };

const TERBIT = ["polis_terbit", "menunggu_bayar", "lunas", "premi_disetor", "cashback_cair", "selesai"] as const;
const LABEL_MASA = {
  aktif: ["AKTIF", "ok"],
  akan_habis: ["AKAN HABIS", "warn"],
  expired: ["EXPIRED", "bad"],
  diperpanjang: ["DIPERPANJANG", "netral"],
  kendaraan_dijual: ["KENDARAAN DIJUAL", "warn"],
  batal: ["BATAL", "bad"],
} as const;

export default async function DaftarPolis({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { user } = await wajibLogin();
  const { q = "" } = await searchParams;
  const admin = adalahStaf(user);
  const cari = q.trim();

  const daftar = await db
    .select({
      p: polis,
      nasabah: nasabah.nama,
      plat: kendaraan.noPolisi,
      asuransi: perusahaanAsuransi.nama,
      paket: kategoriPolis.nama,
      sales: users.nama,
    })
    .from(polis)
    .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
    .innerJoin(kendaraan, eq(kendaraan.id, polis.kendaraanId))
    .innerJoin(users, eq(users.id, polis.salesId))
    .leftJoin(perusahaanAsuransi, eq(perusahaanAsuransi.id, polis.perusahaanId))
    .leftJoin(kategoriPolis, eq(kategoriPolis.id, polis.kategoriId))
    .where(
      and(
        inArray(polis.statusPengajuan, [...TERBIT]),
        admin ? undefined : eq(polis.salesId, user.id),
        cari
          ? or(
              ilike(polis.noPolis, `%${cari}%`),
              ilike(nasabah.nama, `%${cari}%`),
              ilike(sql`replace(${kendaraan.noPolisi}, ' ', '')`, `%${cari.replace(/\s/g, "")}%`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(polis.tglMulai))
    .limit(200);

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Polis" }]}
        judul="Polis"
        sorot="terbit"
        sub={`${daftar.length} polis. Pengajuan yang belum terbit ada di menu Pengajuan.`}
      />
      <form role="search" className="flex gap-2">
        <input
          name="q"
          defaultValue={cari}
          aria-label="Cari polis"
          placeholder="No. polis, nama, atau plat"
          className="h-11 flex-1 rounded-full border border-line-2 bg-white px-4 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
        />
        <button className="h-11 rounded-full bg-ink px-5 text-sm font-semibold text-white">Cari</button>
      </form>
      {daftar.length === 0 ? (
        <Kosong>Belum ada polis terbit.</Kosong>
      ) : (
        <Kartu className="overflow-x-auto p-0">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-[12px] uppercase tracking-wider text-ink-3">
              <tr className="border-b border-line">
                <th className="px-5 py-3 font-semibold">Polis</th>
                <th className="px-3 py-3 font-semibold">Nasabah</th>
                <th className="px-3 py-3 font-semibold">Periode</th>
                <th className="px-3 py-3 text-right font-semibold">Premi</th>
                <th className="px-3 py-3 font-semibold">Bayar</th>
                <th className="px-5 py-3 font-semibold">Masa</th>
              </tr>
            </thead>
            <tbody>
              {daftar.map((d) => {
                const masa = d.p.statusMasa ? LABEL_MASA[d.p.statusMasa] : null;
                return (
                  <tr key={d.p.id} className="border-b border-line last:border-0 hover:bg-canvas">
                    <td className="px-5 py-3">
                      <Link href={`/pengajuan/${d.p.id}`} className="font-semibold hover:text-brand">
                        {d.p.noPolis}
                      </Link>
                      <div className="text-xs text-ink-3">
                        {d.asuransi}
                        {d.paket && ` ${d.paket}`} · {d.p.kode}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {d.nasabah}
                      <div className="text-xs text-ink-3">
                        {d.plat}
                        {admin && ` · ${d.sales}`}
                      </div>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-ink-2">
                      {d.p.tglMulai} – {d.p.tglAkhir}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{rupiah(d.p.premiBruto)}</td>
                    <td className="px-3 py-3">
                      {d.p.statusBayar === "lunas" ? <Lencana nada="ok">LUNAS</Lencana> : <Lencana nada="warn">BELUM</Lencana>}
                    </td>
                    <td className="px-5 py-3">{masa ? <Lencana nada={masa[1]}>{masa[0]}</Lencana> : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Kartu>
      )}
    </>
  );
}
