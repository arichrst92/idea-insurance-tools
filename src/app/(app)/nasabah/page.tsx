import Link from "next/link";
import { and, asc, count, desc, eq, ilike, or, sql, exists } from "drizzle-orm";
import { db } from "@/db";
import { kendaraan, nasabah, users } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { filterNasabah } from "@/lib/akses";
import { Kartu, KepalaHalaman, Kosong, Lencana, TautanTombol } from "@/components/ui";
import { formatNoWa } from "@/lib/wa";
import { adalahStaf, penjualSql } from "@/lib/peran";

export const metadata = { title: "Nasabah" };

const PER_HALAMAN = 30;

export default async function DaftarNasabah({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sales?: string; kendaraan?: string; hal?: string }>;
}) {
  const { user } = await wajibLogin();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const hal = Math.max(1, Number(sp.hal) || 1);
  const admin = adalahStaf(user);

  const cari = q
    ? or(
        ilike(nasabah.nama, `%${q}%`),
        ilike(nasabah.noWa, `%${q.replace(/\D/g, "").replace(/^0/, "62") || q}%`),
        exists(
          db
            .select({ x: sql`1` })
            .from(kendaraan)
            .where(
              and(
                eq(kendaraan.nasabahId, nasabah.id),
                ilike(sql`replace(${kendaraan.noPolisi}, ' ', '')`, `%${q.replace(/\s/g, "")}%`),
              ),
            ),
        ),
      )
    : undefined;
  const filterKendaraan =
    sp.kendaraan === "nonaktif"
      ? exists(
          db
            .select({ x: sql`1` })
            .from(kendaraan)
            .where(and(eq(kendaraan.nasabahId, nasabah.id), sql`${kendaraan.status} <> 'aktif'`)),
        )
      : undefined;
  const where = and(filterNasabah(user), admin && sp.sales ? eq(nasabah.salesId, sp.sales) : undefined, cari, filterKendaraan);

  // Ringkasan kendaraan per nasabah (subquery berkorelasi; tabel diberi alias agar tidak bentrok).
  const kAktif = sql<number>`(select count(*) from kendaraan k where k.nasabah_id = ${nasabah.id} and k.status = 'aktif')`.mapWith(Number);
  const kTotal = sql<number>`(select count(*) from kendaraan k where k.nasabah_id = ${nasabah.id})`.mapWith(Number);
  const kPlat = sql<string | null>`(select string_agg(k.no_polisi, ', ' order by k.dibuat) from kendaraan k where k.nasabah_id = ${nasabah.id})`;

  const [daftar, [{ total }], salesList] = await Promise.all([
    db
      .select({
        n: nasabah,
        sales: users.nama,
        aktif: kAktif,
        totalKendaraan: kTotal,
        plat: kPlat,
      })
      .from(nasabah)
      .innerJoin(users, eq(users.id, nasabah.salesId))
      .where(where)
      .orderBy(desc(nasabah.dibuat))
      .limit(PER_HALAMAN)
      .offset((hal - 1) * PER_HALAMAN),
    db.select({ total: count() }).from(nasabah).where(where),
    admin
      ? db.select({ id: users.id, nama: users.nama, aktif: users.aktif }).from(users).where(penjualSql()).orderBy(asc(users.nama))
      : Promise.resolve([]),
  ]);

  const halamanTerakhir = Math.max(1, Math.ceil(total / PER_HALAMAN));
  const urlHal = (h: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (sp.sales) p.set("sales", sp.sales);
    if (sp.kendaraan) p.set("kendaraan", sp.kendaraan);
    if (h > 1) p.set("hal", String(h));
    return `/nasabah${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Nasabah" }]}
        judul={admin ? "Semua" : "Nasabah"}
        sorot={admin ? "nasabah" : "saya"}
        sub={`${total} nasabah`}
        aksi={<TautanTombol href="/nasabah/baru">Tambah nasabah</TautanTombol>}
      />

      <form className="flex flex-wrap items-end gap-2" role="search">
        <label className="flex min-w-[240px] flex-1 flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
          Cari
          <input
            name="q"
            defaultValue={q}
            placeholder="Nama, no. WhatsApp, atau plat nomor"
            className="h-11 rounded-full border border-line-2 bg-white px-4 text-[15px] text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
          />
        </label>
        {admin && (
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
            Sales
            <select name="sales" defaultValue={sp.sales ?? ""} className="h-11 rounded-full border border-line-2 bg-white px-4 text-[15px] text-ink">
              <option value="">Semua sales</option>
              {salesList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nama}
                  {s.aktif ? "" : " (nonaktif)"}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
          Kendaraan
          <select name="kendaraan" defaultValue={sp.kendaraan ?? ""} className="h-11 rounded-full border border-line-2 bg-white px-4 text-[15px] text-ink">
            <option value="">Semua</option>
            <option value="nonaktif">Ada yang dijual/tidak dipakai</option>
          </select>
        </label>
        <button className="h-11 rounded-full bg-ink px-5 text-sm font-semibold text-white">Terapkan</button>
        {(q || sp.sales || sp.kendaraan) && (
          <Link href="/nasabah" className="h-11 px-3 text-sm font-semibold leading-[44px] text-brand">
            Reset
          </Link>
        )}
      </form>

      {daftar.length === 0 ? (
        <Kosong>{q || sp.sales || sp.kendaraan ? "Tidak ada nasabah yang cocok." : "Belum ada nasabah. Tambahkan yang pertama."}</Kosong>
      ) : (
        <Kartu className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-[12px] uppercase tracking-wider text-ink-3">
              <tr className="border-b border-line">
                <th className="px-5 py-3 font-semibold">Nasabah</th>
                <th className="px-3 py-3 font-semibold">WhatsApp</th>
                <th className="px-3 py-3 font-semibold">Kendaraan</th>
                {admin && <th className="px-3 py-3 font-semibold">Sales</th>}
              </tr>
            </thead>
            <tbody>
              {daftar.map(({ n, sales, aktif, totalKendaraan, plat }) => (
                <tr key={n.id} className="border-b border-line last:border-0 hover:bg-canvas">
                  <td className="px-5 py-3">
                    <Link href={`/nasabah/${n.id}`} className="font-semibold hover:text-brand">
                      {n.nama}
                    </Link>
                    {n.tipe === "badan" && (
                      <span className="ml-2">
                        <Lencana>BADAN</Lencana>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-ink-2">{formatNoWa(n.noWa)}</td>
                  <td className="px-3 py-3">
                    {totalKendaraan ? (
                      <div className="flex flex-col">
                        <span className="text-ink">{plat}</span>
                        {aktif !== totalKendaraan && (
                          <span className="text-xs text-warn">
                            {totalKendaraan - aktif} dari {totalKendaraan} tidak aktif
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-ink-4">Belum ada</span>
                    )}
                  </td>
                  {admin && <td className="px-3 py-3 text-ink-2">{sales}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </Kartu>
      )}

      {halamanTerakhir > 1 && (
        <nav aria-label="Halaman" className="flex items-center justify-center gap-2 text-sm">
          {hal > 1 && (
            <Link href={urlHal(hal - 1)} className="rounded-full border border-line bg-white px-4 py-2 font-semibold">
              ← Sebelumnya
            </Link>
          )}
          <span className="text-ink-3">
            Halaman {hal} dari {halamanTerakhir}
          </span>
          {hal < halamanTerakhir && (
            <Link href={urlHal(hal + 1)} className="rounded-full border border-line bg-white px-4 py-2 font-semibold">
              Berikutnya →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
