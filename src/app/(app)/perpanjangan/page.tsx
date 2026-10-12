import Link from "next/link";
import { and, asc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import clsx from "clsx";
import { db } from "@/db";
import { kategoriPolis, kendaraan, nasabah, perusahaanAsuransi, polis, users, waOptout } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { FormAksi } from "@/components/form-aksi";
import { Kartu, KepalaHalaman, Kosong, Lencana } from "@/components/ui";
import { LencanaStatus } from "@/components/journey";
import { sisaHari, tambahHari, waktuWib } from "@/lib/domain/perpanjangan";
import { LEWAT_MAKS_HARI, MASA_PERLU_DIURUS, STATUS_TERBIT, remindTerakhir } from "@/lib/perpanjangan";
import { perpanjang, remindManual } from "./actions";
import { adalahStaf } from "@/lib/peran";

export const metadata = { title: "Perpanjangan" };

const TAB = {
  semua: { label: "Semua", cocok: () => true },
  h7: { label: "≤ 7 hari", cocok: (s: number) => s >= 0 && s <= 7 },
  h14: { label: "8–14 hari", cocok: (s: number) => s >= 8 && s <= 14 },
  h30: { label: "15–30 hari", cocok: (s: number) => s >= 15 && s <= 30 },
  h45: { label: "31–45 hari", cocok: (s: number) => s >= 31 && s <= 45 },
  lewat: { label: "Lewat masa", cocok: (s: number) => s < 0 },
} as const;

const STATUS_PESAN: Record<string, [string, "ok" | "warn" | "bad" | "netral" | "brand"]> = {
  dibaca: ["dibaca", "ok"],
  diterima: ["diterima", "brand"],
  terkirim: ["terkirim", "netral"],
  antre: ["lewat wa.me", "warn"],
  gagal: ["gagal", "bad"],
};

const tglId = (d: string | Date) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(
    typeof d === "string" ? new Date(d + "T00:00:00+07:00") : d,
  );

export default async function HalamanPerpanjangan({ searchParams }: { searchParams: Promise<{ tab?: string; sales?: string }> }) {
  const { user } = await wajibLogin();
  const sp = await searchParams;
  const admin = adalahStaf(user);
  const tab = (sp.tab && sp.tab in TAB ? sp.tab : "semua") as keyof typeof TAB;
  const hariIni = waktuWib().tanggal;
  const lanjut = alias(polis, "lanjut");

  const daftar = await db
    .select({
      p: polis,
      n: nasabah,
      k: kendaraan,
      asuransi: perusahaanAsuransi.nama,
      paket: kategoriPolis.nama,
      sales: users.nama,
      lanjut: { id: lanjut.id, kode: lanjut.kode, status: lanjut.statusPengajuan, setuju: lanjut.nasabahSetujuPerpanjangan },
    })
    .from(polis)
    .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
    .innerJoin(kendaraan, eq(kendaraan.id, polis.kendaraanId))
    .innerJoin(users, eq(users.id, nasabah.salesId))
    .leftJoin(perusahaanAsuransi, eq(perusahaanAsuransi.id, polis.perusahaanId))
    .leftJoin(kategoriPolis, eq(kategoriPolis.id, polis.kategoriId))
    .leftJoin(lanjut, eq(lanjut.polisSebelumnyaId, polis.id))
    .where(
      and(
        inArray(polis.statusPengajuan, [...STATUS_TERBIT]),
        inArray(polis.statusMasa, [...MASA_PERLU_DIURUS]),
        eq(kendaraan.status, "aktif"),
        isNotNull(polis.tglAkhir),
        lte(polis.tglAkhir, tambahHari(hariIni, 45)),
        gte(polis.tglAkhir, tambahHari(hariIni, -LEWAT_MAKS_HARI)),
        admin ? (sp.sales ? eq(nasabah.salesId, sp.sales) : undefined) : eq(nasabah.salesId, user.id),
      ),
    )
    .orderBy(asc(polis.tglAkhir));

  const denganSisa = daftar.map((d) => ({ ...d, sisa: sisaHari(d.p.tglAkhir!, hariIni) }));
  const tampil = denganSisa.filter((d) => TAB[tab].cocok(d.sisa));
  const [remind, optout] = await Promise.all([
    remindTerakhir(tampil.map((d) => d.p.id)),
    tampil.length
      ? db.select({ nomor: waOptout.nomor }).from(waOptout).where(and(eq(waOptout.jenisPesan, "remind"), inArray(waOptout.nomor, tampil.map((d) => d.n.noWa))))
      : Promise.resolve([]),
  ]);
  const berhenti = new Set(optout.map((o) => o.nomor));
  const url = (t: string) => `/perpanjangan?${new URLSearchParams({ tab: t, ...(sp.sales ? { sales: sp.sales } : {}) })}`;

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Perpanjangan" }]}
        judul="Polis"
        sorot="akan habis"
        sub="Remind WhatsApp otomatis H-30, H-14, dan H-7; draft perpanjangan disiapkan otomatis H-45. Nasabah yang membalas YA ditandai di sini."
      />

      <nav aria-label="Filter sisa masa" className="-mt-2 overflow-x-auto">
        <ul className="inline-flex gap-1 rounded-full border border-line bg-white p-1 text-[13px] font-semibold">
          {(Object.keys(TAB) as (keyof typeof TAB)[]).map((t) => (
            <li key={t}>
              <Link
                href={url(t)}
                aria-current={t === tab ? "page" : undefined}
                className={clsx("flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5", t === tab ? "bg-ink text-white" : "text-ink-2")}
              >
                {TAB[t].label}
                <span className={clsx("rounded-full px-1.5 text-[11px]", t === tab ? "bg-white/20" : "bg-canvas text-ink-3")}>
                  {denganSisa.filter((d) => TAB[t].cocok(d.sisa)).length}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tampil.length === 0 ? (
        <Kosong>Tidak ada polis yang perlu diperpanjang di kelompok ini.</Kosong>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {tampil.map((d) => {
            const r = remind.get(d.p.id);
            const st = r?.status ? STATUS_PESAN[r.status] : r?.kanal === "optout" ? (["tidak dikirim", "bad"] as const) : null;
            return (
              <Kartu key={d.p.id} className="flex flex-col gap-3" data-uji="kartu-perpanjangan">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/nasabah/${d.n.id}`} className="text-base font-bold hover:text-brand">
                      {d.n.nama}
                    </Link>
                    <div className="text-sm text-ink-2">
                      {d.k.noPolisi} · {d.k.merek} {d.k.model} {d.k.tahun}
                    </div>
                    <div className="text-[13px] text-ink-3">
                      <Link href={`/pengajuan/${d.p.id}`} className="hover:text-brand">
                        {d.p.noPolis}
                      </Link>{" "}
                      · {d.asuransi}
                      {d.paket && ` ${d.paket}`}
                      {admin && ` · ${d.sales}`}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                    <span
                      className={clsx(
                        "rounded-full px-2.5 py-1 text-[13px] font-extrabold",
                        d.sisa < 0 ? "bg-bad-soft text-bad" : d.sisa <= 7 ? "bg-bad-soft text-bad" : d.sisa <= 14 ? "bg-warn-soft text-warn" : "bg-[#F1F3F9] text-ink-2",
                      )}
                    >
                      {d.sisa < 0 ? `Lewat ${-d.sisa} hari` : d.sisa === 0 ? "Habis hari ini" : `H-${d.sisa}`}
                    </span>
                    <span className="text-xs text-ink-3">berakhir {tglId(d.p.tglAkhir!)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-canvas px-3 py-2 text-[13px]">
                  {r ? (
                    <>
                      <span className="text-ink-2">
                        Remind {r.tahap ? `H-${r.tahap}` : "manual"} · {tglId(r.waktu)}
                        {r.jumlah > 1 && ` (${r.jumlah}x)`}
                      </span>
                      {st && <Lencana nada={st[1]}>{st[0].toUpperCase()}</Lencana>}
                    </>
                  ) : (
                    <span className="text-ink-3">Belum di-remind</span>
                  )}
                  {berhenti.has(d.n.noWa) && <Lencana nada="bad">NASABAH BALAS BERHENTI</Lencana>}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  {d.lanjut ? (
                    <Link href={`/pengajuan/${d.lanjut.id}`} className="flex flex-wrap items-center gap-2 text-sm font-semibold hover:text-brand">
                      Perpanjangan {d.lanjut.kode}
                      <LencanaStatus status={d.lanjut.status} />
                      {d.lanjut.setuju && <Lencana nada="ok">NASABAH SETUJU</Lencana>}
                    </Link>
                  ) : (
                    <FormAksi aksi={perpanjang.bind(null, d.p.id)} tombol="Perpanjang" className="flex flex-col gap-1">
                      {null}
                    </FormAksi>
                  )}
                  <FormAksi aksi={remindManual.bind(null, d.p.id)} tombol="Remind WhatsApp" varian="kedua" className="flex flex-col items-end gap-1">
                    {null}
                  </FormAksi>
                </div>
              </Kartu>
            );
          })}
        </div>
      )}
    </>
  );
}
