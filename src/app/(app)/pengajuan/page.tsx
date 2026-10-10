import Link from "next/link";
import { and, asc, count, desc, eq, ilike, inArray, notInArray, or, sql, type SQL } from "drizzle-orm";
import clsx from "clsx";
import { db } from "@/db";
import { kendaraan, nasabah, perusahaanAsuransi, polis, users, type StatusPengajuan } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { Kartu, KepalaHalaman, Kosong, TautanTombol } from "@/components/ui";
import { BarJourney, LencanaStatus } from "@/components/journey";
import { LANGKAH, nomorLangkah } from "@/lib/domain/journey";
import { rupiah } from "@/lib/format";
import { TombolPdf } from "@/components/tombol-ekspor";

export const metadata = { title: "Pengajuan" };

const DITUTUP: StatusPengajuan[] = ["ditolak_asuransi", "batal_nasabah", "batal_salah_input"];
const TAB = {
  berjalan: { label: "Berjalan", where: notInArray(polis.statusPengajuan, [...DITUTUP, "selesai"]) },
  giliran: { label: "Giliran saya", where: undefined as SQL | undefined },
  selesai: { label: "Selesai", where: eq(polis.statusPengajuan, "selesai") },
  ditutup: { label: "Ditolak / batal", where: inArray(polis.statusPengajuan, DITUTUP) },
  semua: { label: "Semua", where: undefined },
} as const;

// Status yang menunggu tindakan masing-masing peran.
const GILIRAN: Record<"admin" | "sales", StatusPengajuan[]> = {
  sales: ["draft_prospek", "perlu_revisi", "penawaran_masuk", "polis_terbit", "menunggu_bayar"],
  admin: ["data_lengkap", "dikirim_ke_asuransi", "survei_kendaraan", "disetujui_nasabah", "lunas", "premi_disetor", "cashback_cair"],
};

export default async function DaftarPengajuan({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; sales?: string }>;
}) {
  const { user } = await wajibLogin();
  const sp = await searchParams;
  const admin = user.role === "admin";
  const tab = (sp.tab && sp.tab in TAB ? sp.tab : "berjalan") as keyof typeof TAB;
  const q = sp.q?.trim() ?? "";

  const whereTab = tab === "giliran" ? inArray(polis.statusPengajuan, GILIRAN[user.role]) : TAB[tab].where;
  const where = and(
    admin ? (sp.sales ? eq(polis.salesId, sp.sales) : undefined) : eq(polis.salesId, user.id),
    whereTab,
    q
      ? or(
          ilike(polis.kode, `%${q}%`),
          ilike(polis.noPolis, `%${q}%`),
          ilike(nasabah.nama, `%${q}%`),
          ilike(sql`replace(${kendaraan.noPolisi}, ' ', '')`, `%${q.replace(/\s/g, "")}%`),
        )
      : undefined,
  );

  // Langkah terakhir sebelum bercabang (untuk bar status revisi/ditolak/batal).
  const statusTerakhir = sql<StatusPengajuan | null>`(
    select sh.status from status_history sh
    where sh.polis_id = ${polis.id} and sh.status not in ('perlu_revisi','ditolak_asuransi','batal_nasabah','batal_salah_input')
    order by sh.waktu desc limit 1)`;
  const diubah = sql<Date>`(select max(sh.waktu) from status_history sh where sh.polis_id = ${polis.id})`.mapWith(
    (v: string) => new Date(v),
  );

  const [daftar, ringkas, salesList] = await Promise.all([
    db
      .select({
        p: polis,
        nasabah: nasabah.nama,
        plat: kendaraan.noPolisi,
        kendaraan: sql<string>`${kendaraan.merek} || ' ' || ${kendaraan.model}`,
        asuransi: perusahaanAsuransi.kode,
        sales: users.nama,
        statusTerakhir,
        diubah,
      })
      .from(polis)
      .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
      .innerJoin(kendaraan, eq(kendaraan.id, polis.kendaraanId))
      .innerJoin(users, eq(users.id, polis.salesId))
      .leftJoin(perusahaanAsuransi, eq(perusahaanAsuransi.id, polis.perusahaanId))
      .where(where)
      .orderBy(desc(polis.diubah))
      .limit(100),
    db
      .select({ status: polis.statusPengajuan, n: count() })
      .from(polis)
      .where(admin ? (sp.sales ? eq(polis.salesId, sp.sales) : undefined) : eq(polis.salesId, user.id))
      .groupBy(polis.statusPengajuan),
    admin
      ? db.select({ id: users.id, nama: users.nama }).from(users).where(eq(users.role, "sales")).orderBy(asc(users.nama))
      : Promise.resolve([]),
  ]);
  const jml = (ss: readonly StatusPengajuan[]) => ringkas.filter((r) => ss.includes(r.status)).reduce((a, r) => a + r.n, 0);
  const jumlahTab: Record<keyof typeof TAB, number> = {
    berjalan: jml(LANGKAH.slice(0, 11).map((l) => l.status).concat("perlu_revisi")),
    giliran: jml(GILIRAN[user.role]),
    selesai: jml(["selesai"]),
    ditutup: jml(DITUTUP),
    semua: ringkas.reduce((a, r) => a + r.n, 0),
  };
  const url = (t: string) => {
    const p = new URLSearchParams({ tab: t });
    if (q) p.set("q", q);
    if (sp.sales) p.set("sales", sp.sales);
    return `/pengajuan?${p}`;
  };

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Pengajuan" }]}
        judul={admin ? "Semua" : "Pengajuan"}
        sorot={admin ? "pengajuan" : "saya"}
        sub="Status journey 12 langkah dari input calon konsumen sampai komisi dibayar."
        aksi={
          <>
            <a
              href={`/api/pengajuan/excel?${new URLSearchParams({ tab, ...(q ? { q } : {}), ...(sp.sales ? { sales: sp.sales } : {}) })}`}
              download
              className="inline-flex h-10 items-center rounded-full border border-line-2 bg-white px-5 text-sm font-semibold hover:border-ink-4"
            >
              Ekspor Excel
            </a>
            <TombolPdf jenis="pengajuan" filter={{ tab, q, sales: sp.sales }} />
            <TautanTombol href="/pengajuan/baru">Pengajuan baru</TautanTombol>
          </>
        }
      />

      <nav aria-label="Filter status" className="-mt-2 overflow-x-auto">
        <ul className="inline-flex gap-1 rounded-full border border-line bg-white p-1 text-[13px] font-semibold">
          {(Object.keys(TAB) as (keyof typeof TAB)[]).map((t) => (
            <li key={t}>
              <Link
                href={url(t)}
                aria-current={t === tab ? "page" : undefined}
                className={clsx("flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5", t === tab ? "bg-ink text-white" : "text-ink-2")}
              >
                {TAB[t].label}
                <span className={clsx("rounded-full px-1.5 text-[11px]", t === tab ? "bg-white/20" : "bg-canvas text-ink-3")}>{jumlahTab[t]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <form className="flex flex-wrap items-end gap-2" role="search">
        <input type="hidden" name="tab" value={tab} />
        <input
          name="q"
          defaultValue={q}
          aria-label="Cari"
          placeholder="Kode PJ, no. polis, nama, atau plat"
          className="h-11 min-w-[240px] flex-1 rounded-full border border-line-2 bg-white px-4 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
        />
        {admin && (
          <select name="sales" defaultValue={sp.sales ?? ""} aria-label="Sales" className="h-11 rounded-full border border-line-2 bg-white px-4 text-[15px]">
            <option value="">Semua sales</option>
            {salesList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nama}
              </option>
            ))}
          </select>
        )}
        <button className="h-11 rounded-full bg-ink px-5 text-sm font-semibold text-white">Cari</button>
      </form>

      {daftar.length === 0 ? (
        <Kosong>Tidak ada pengajuan di sini.</Kosong>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {daftar.map((d) => (
            <Link key={d.p.id} href={`/pengajuan/${d.p.id}`} className="block">
              <Kartu className="flex h-full flex-col gap-3 transition hover:border-ink-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[12px] font-bold text-ink-3">
                      {d.p.kode}
                      {d.asuransi && <span className="rounded bg-canvas px-1.5 text-ink-2">{d.asuransi}</span>}
                    </div>
                    <div className="truncate text-base font-bold">{d.nasabah}</div>
                    <div className="text-[13px] text-ink-2">
                      {d.kendaraan} · {d.plat}
                    </div>
                  </div>
                  <LencanaStatus status={d.p.statusPengajuan} />
                </div>
                <BarJourney status={d.p.statusPengajuan} terakhir={d.statusTerakhir ? (nomorLangkah(d.statusTerakhir) ?? 0) : 0} />
                <div className="flex flex-wrap justify-between gap-2 text-[12px] text-ink-3">
                  <span>
                    {d.p.premiBruto ? `Premi ${rupiah(d.p.premiBruto)}` : d.p.nilaiPertanggungan ? `TSI ${rupiah(d.p.nilaiPertanggungan)}` : ""}
                    {admin && ` · ${d.sales}`}
                  </span>
                  <span>
                    Diperbarui{" "}
                    {new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(
                      d.diubah ?? d.p.diubah,
                    )}
                  </span>
                </div>
              </Kartu>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
