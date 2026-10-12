import Link from "next/link";
import clsx from "clsx";
import { and, count, desc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { bengkel, kategoriPolis, kendaraan, klaim, nasabah, perusahaanAsuransi, polis, rekening, users } from "@/db/schema";
import { tambahHari, waktuWib } from "@/lib/domain/perpanjangan";
import { periode } from "@/lib/domain/periode";
import { MASA_PERLU_DIURUS, STATUS_TERBIT } from "@/lib/perpanjangan";
import { polisLunas, total } from "@/lib/laporan";
import { dataPencairan } from "@/lib/pencairan";
import { capaian, targetRentang } from "@/lib/performa";
import { wajibLogin } from "@/lib/auth/session";
import { Kartu, KepalaHalaman } from "@/components/ui";
import { Angka } from "@/components/laporan";
import { LencanaStatus } from "@/components/journey";
import { ChecklistOnboarding } from "@/components/checklist-onboarding";
import { onboardingSales } from "@/lib/panduan";
import { angka, persen, rupiah } from "@/lib/format";
import { adalahOwner, adalahStaf, bisaJual, penjualSql } from "@/lib/peran";
import { whereGiliran } from "@/lib/daftar-pengajuan";

export default async function Dashboard() {
  const { user } = await wajibLogin();
  const admin = adalahStaf(user);
  const owner = adalahOwner(user);
  const hariIni = waktuWib().tanggal;
  const p = periode("bulan_ini", hariIni);

  const ownerJual = owner && bisaJual(user);
  const [rows, [nHabis], [nKlaim], giliran, cair, targets, [nNasabah], onboarding, persiapan, rowsSaya] = await Promise.all([
    polisLunas(user, { dari: p.dari, sampai: p.sampai }),
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
      .where(and(whereGiliran(user), admin ? undefined : eq(polis.salesId, user.id)))
      .orderBy(desc(polis.diubah))
      .limit(6),
    dataPencairan(user, hariIni),
    admin ? Promise.resolve(new Map()) : targetRentang(p.dari, p.sampai),
    db.select({ n: count() }).from(nasabah).where(admin ? undefined : eq(nasabah.salesId, user.id)),
    admin ? null : onboardingSales(user.id),
    admin ? dataAwal(owner) : null,
    ownerJual ? polisLunas(user, { dari: p.dari, sampai: p.sampai, salesId: user.id }) : null,
  ]);
  const saya = rowsSaya ? total(rowsSaya, true) : null;
  const t = total(rows, admin);
  const tertunggak = admin ? Object.values(cair.tahap).reduce((a, d) => a + d.length, 0) : cair.tahap.komisi.length;
  const lewatTermin = cair.tahap.cair.filter((r) => r.lewatTermin).length;
  const target = !admin ? targets.get(user.id) : undefined;
  const c = target ? capaian(target, { polis: t?.polis ?? 0, premi: t?.premi ?? 0 }) : null;
  const namaDepan = user.nama.split(" ")[0];

  return (
    <>
      <KepalaHalaman jejak={[{ label: "Dashboard" }]} judul={`Halo ${namaDepan},`} sorot="selamat bekerja" sub={`Ringkasan ${p.label}.`} />
      {onboarding && !onboarding.ditutup && !onboarding.beres && <ChecklistOnboarding data={onboarding} ringkas />}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3" data-uji="dashboard">
        <Angka label="Premi bulan ini" nilai={rupiah(t?.premi ?? 0)} href="/laporan" />
        <Angka label="Polis lunas bulan ini" nilai={angka(t?.polis ?? 0)} sub={`${angka(nNasabah.n)} nasabah ${admin ? "terdaftar" : "Anda"}`} href="/polis" />
        {admin ? (
          <Angka label="Cashback asuransi bulan ini" nilai={rupiah(t?.cashbackTotal ?? 0)} sub={owner ? `Kantor ${rupiah(t?.bagianKantor ?? 0)}` : undefined} href="/laporan" />
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

      {ownerJual && (
        <Kartu className="flex flex-col gap-3" data-uji="penjualan-owner">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-base font-bold">Penjualan Anda {p.label}</h2>
            <Link href={`/performa/${user.id}`} className="text-sm font-semibold text-brand">
              Performa →
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-[12px] text-ink-3">Polis lunas</p>
              <p className="font-bold tabular-nums">{angka(saya?.polis ?? 0)}</p>
            </div>
            <div>
              <p className="text-[12px] text-ink-3">Premi</p>
              <p className="font-bold tabular-nums">{rupiah(saya?.premi ?? 0)}</p>
            </div>
            <div>
              <p className="text-[12px] text-ink-3">Komisi Anda</p>
              <p className="font-bold tabular-nums">{rupiah(saya?.komisi ?? 0)}</p>
            </div>
          </div>
        </Kartu>
      )}

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
                    <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-[13px]">
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
        {admin && persiapan && (
          <Kartu className="flex flex-col gap-3" data-uji="data-awal">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-bold">{persiapan.every((d) => d.ada) ? "Pintasan" : "Siapkan data awal"}</h2>
              <span className="text-[13px] text-ink-3">
                {persiapan.filter((d) => d.ada).length}/{persiapan.length} siap
              </span>
            </div>
            <ul className="flex flex-col divide-y divide-line">
              {persiapan.map((d) => (
                <li key={d.href}>
                  <Link href={d.href} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-brand">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        aria-hidden
                        className={clsx(
                          "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                          d.ada ? "bg-ok-soft text-ok" : "border border-line-2 text-ink-4",
                        )}
                      >
                        {d.ada ? "✓" : ""}
                      </span>
                      <span className="truncate font-semibold">{d.label}</span>
                    </span>
                    <span className="shrink-0 text-[13px] text-ink-3">{d.ada ? angka(d.n) : "Belum ada"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Kartu>
        )}
      </div>
    </>
  );
}

/** Kelengkapan data master untuk admin (kartu "Siapkan data awal" → "Pintasan" bila semua sudah ada). */
async function dataAwal(owner: boolean) {
  const n = (q: Promise<{ n: number }[]>) => q.then(([r]) => r.n);
  const [asuransi, paket, bengkelN, rekKantor, sales] = await Promise.all([
    n(db.select({ n: count() }).from(perusahaanAsuransi)),
    n(db.select({ n: count() }).from(kategoriPolis)),
    n(db.select({ n: count() }).from(bengkel)),
    n(db.select({ n: count() }).from(rekening).where(inArray(rekening.pemilikTipe, ["pembayaran", "kantor"]))),
    n(db.select({ n: count() }).from(users).where(and(penjualSql(), eq(users.aktif, true)))),
  ]);
  return [
    { label: "Perusahaan asuransi", href: "/master/asuransi", n: asuransi, ada: asuransi > 0 },
    { label: "Paket coverage", href: "/master/kategori", n: paket, ada: paket > 0 },
    { label: "Bengkel rekanan", href: "/master/bengkel", n: bengkelN, ada: bengkelN > 0 },
    ...(owner ? [{ label: "Rekening pembayaran & kantor", href: "/master/rekening", n: rekKantor, ada: rekKantor > 0 }] : []),
    { label: "Sales aktif", href: "/sales", n: sales, ada: sales > 0 },
  ];
}
