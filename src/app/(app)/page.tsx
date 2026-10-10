import Link from "next/link";
import { and, count, desc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { kendaraan, klaim, nasabah, polis, type StatusPengajuan } from "@/db/schema";
import { tambahHari, waktuWib } from "@/lib/domain/perpanjangan";
import { periode } from "@/lib/domain/periode";
import { MASA_PERLU_DIURUS, STATUS_TERBIT } from "@/lib/perpanjangan";
import { polisTerbit, total } from "@/lib/laporan";
import { dataPencairan } from "@/lib/pencairan";
import { capaian, targetRentang } from "@/lib/performa";
import { wajibLogin } from "@/lib/auth/session";
import { Kartu, KepalaHalaman } from "@/components/ui";
import { Angka } from "@/components/laporan";
import { LencanaStatus } from "@/components/journey";
import { angka, persen, rupiah } from "@/lib/format";

// Status yang menunggu tindakan masing-masing peran (sama dengan tab "Giliran saya").
const GILIRAN: Record<"admin" | "sales", StatusPengajuan[]> = {
  sales: ["draft_prospek", "perlu_revisi", "penawaran_masuk", "polis_terbit", "menunggu_bayar"],
  admin: ["data_lengkap", "dikirim_ke_asuransi", "survei_kendaraan", "disetujui_nasabah", "lunas", "premi_disetor", "cashback_cair"],
};

export default async function Dashboard() {
  const { user } = await wajibLogin();
  const admin = user.role === "admin";
  const hariIni = waktuWib().tanggal;
  const p = periode("bulan_ini", hariIni);

  const [rows, [nHabis], [nKlaim], giliran, cair, targets, [nNasabah]] = await Promise.all([
    polisTerbit(user, { dari: p.dari, sampai: p.sampai }),
    db
      .select({ n: count() })
      .from(polis)
      .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
      .innerJoin(kendaraan, eq(kendaraan.id, polis.kendaraanId))
      .where(
        and(
          inArray(polis.statusPengajuan, [...STATUS_TERBIT]),
          inArray(polis.statusMasa, [...MASA_PERLU_DIURUS]),
          eq(kendaraan.status, "aktif"),
          gte(polis.tglAkhir, hariIni),
          lte(polis.tglAkhir, tambahHari(hariIni, 30)),
          admin ? undefined : eq(nasabah.salesId, user.id),
        ),
      ),
    db
      .select({ n: count() })
      .from(klaim)
      .innerJoin(polis, eq(polis.id, klaim.polisId))
      .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
      .where(and(eq(klaim.status, "diproses"), admin ? undefined : or(eq(polis.salesId, user.id), eq(nasabah.salesId, user.id)))),
    db
      .select({ p: polis, nasabah: nasabah.nama, plat: kendaraan.noPolisi })
      .from(polis)
      .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
      .innerJoin(kendaraan, eq(kendaraan.id, polis.kendaraanId))
      .where(and(inArray(polis.statusPengajuan, GILIRAN[user.role]), admin ? undefined : eq(polis.salesId, user.id)))
      .orderBy(desc(polis.diubah))
      .limit(6),
    dataPencairan(user, hariIni),
    admin ? Promise.resolve(new Map()) : targetRentang(p.dari, p.sampai),
    db.select({ n: count() }).from(nasabah).where(admin ? undefined : eq(nasabah.salesId, user.id)),
  ]);
  const t = total(rows, admin);
  const tertunggak = admin ? Object.values(cair.tahap).reduce((a, d) => a + d.length, 0) : cair.tahap.komisi.length;
  const lewatTermin = cair.tahap.cair.filter((r) => r.lewatTermin).length;
  const target = !admin ? targets.get(user.id) : undefined;
  const c = target ? capaian(target, { polis: t?.polis ?? 0, premi: t?.premi ?? 0 }) : null;
  const namaDepan = user.nama.split(" ")[0];

  return (
    <>
      <KepalaHalaman jejak={[{ label: "Dashboard" }]} judul={`Halo ${namaDepan},`} sorot="selamat bekerja" sub={`Ringkasan ${p.label}.`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-uji="dashboard">
        <Angka label="Premi bulan ini" nilai={rupiah(t?.premi ?? 0)} href="/laporan" />
        <Angka label="Polis terbit bulan ini" nilai={angka(t?.polis ?? 0)} sub={`${angka(nNasabah.n)} nasabah ${admin ? "terdaftar" : "Anda"}`} href="/polis" />
        {admin ? (
          <Angka label="Cashback asuransi bulan ini" nilai={rupiah(t?.cashbackTotal ?? 0)} sub={`Kantor ${rupiah(t?.bagianKantor ?? 0)}`} href="/laporan" />
        ) : (
          <Angka label="Komisi Anda bulan ini" nilai={rupiah(t?.komisi ?? 0)} sub={t?.komisiEvent ? `termasuk bonus event ${rupiah(t.komisiEvent)}` : undefined} href="/laporan" />
        )}
        <Angka label="Polis habis ≤ 30 hari" nilai={nHabis.n} href="/perpanjangan" nada={nHabis.n ? "warn" : undefined} />
        <Angka label="Klaim diproses" nilai={nKlaim.n} href="/klaim" />
        <Angka
          label={admin ? "Pencairan tertunggak" : "Komisi siap ditransfer"}
          nilai={admin ? tertunggak : rupiah(cair.tahap.komisi.reduce((a, r) => a + r.komisi, 0))}
          sub={admin ? (lewatTermin ? `${lewatTermin} dana asuransi lewat termin` : "per tahap di Pencairan") : `${tertunggak} polis`}
          href="/pencairan"
          nada={admin && lewatTermin ? "bad" : undefined}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Kartu className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-bold">Menunggu tindakan Anda</h2>
            <Link href="/pengajuan?tab=giliran" className="text-sm font-semibold text-brand">
              Semua →
            </Link>
          </div>
          {giliran.length === 0 ? (
            <p className="text-sm text-ink-3">Tidak ada pengajuan yang menunggu Anda.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {giliran.map((g) => (
                <li key={g.p.id}>
                  <Link href={`/pengajuan/${g.p.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:text-brand">
                    <span>
                      <b>{g.nasabah}</b> <span className="text-sm text-ink-3">· {g.plat}</span>
                    </span>
                    <LencanaStatus status={g.p.statusPengajuan} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Kartu>
        {!admin && (
          <Kartu className="flex flex-col gap-3">
            <h2 className="text-base font-bold">Target {p.label}</h2>
            {target && c ? (
              <>
                {[
                  ["Case", c.pCase, `${t?.polis ?? 0} / ${target.targetCase} polis`],
                  ["Revenue", c.pRev, `${rupiah(t?.premi ?? 0)} / ${rupiah(target.targetRevenue)}`],
                ].map(([l, v, ket]) => (
                  <div key={l as string} className="flex flex-col gap-1">
                    <div className="flex justify-between text-[13px]">
                      <span className="font-semibold">{l}</span>
                      <span className="text-ink-3">
                        {ket} · <b className="text-ink">{persen(v as number)}</b>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-canvas">
                      <div className="h-2 rounded-full bg-brand" style={{ width: `${Math.min(100, v as number)}%` }} />
                    </div>
                  </div>
                ))}
                <Link href={`/performa/${user.id}`} className="text-sm font-semibold text-brand">
                  Detail & estimasi gaji →
                </Link>
              </>
            ) : (
              <p className="text-sm text-ink-3">Belum ada target bulan ini.</p>
            )}
          </Kartu>
        )}
        {admin && (
          <Kartu className="flex flex-col gap-3">
            <h2 className="text-base font-bold">Siapkan data awal</h2>
            <ol className="flex flex-col gap-2 text-sm text-ink-2">
              <li>
                1. <Link className="font-semibold text-brand" href="/master/asuransi">Perusahaan asuransi</Link> + email/WA PIC + paket coverage.
              </li>
              <li>
                2. <Link className="font-semibold text-brand" href="/master/bengkel">Bengkel</Link> dan{" "}
                <Link className="font-semibold text-brand" href="/master/rekening">rekening pembayaran & kantor</Link>.
              </li>
              <li>
                3. <Link className="font-semibold text-brand" href="/sales">Sales</Link> + target bulanan — mereka langsung bisa masuk dengan OTP.
              </li>
            </ol>
          </Kartu>
        )}
      </div>
    </>
  );
}
