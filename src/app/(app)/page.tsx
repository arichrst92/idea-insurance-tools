import Link from "next/link";
import { and, count, eq, gte, inArray, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { kendaraan, klaim, nasabah, perusahaanAsuransi, polis, users } from "@/db/schema";
import { tambahHari, waktuWib } from "@/lib/domain/perpanjangan";
import { MASA_PERLU_DIURUS, STATUS_TERBIT } from "@/lib/perpanjangan";
import { wajibLogin } from "@/lib/auth/session";
import { Kartu, KepalaHalaman } from "@/components/ui";

export default async function Dashboard() {
  const { user } = await wajibLogin();
  const milik = user.role === "sales";

  const hariIni = waktuWib().tanggal;
  const [[nNasabah], [nPolis], [nAsuransi], [nSales], [nHabis], [nKlaim]] = await Promise.all([
    db.select({ n: count() }).from(nasabah).where(milik ? eq(nasabah.salesId, user.id) : undefined),
    db.select({ n: count() }).from(polis).where(milik ? eq(polis.salesId, user.id) : undefined),
    db.select({ n: count() }).from(perusahaanAsuransi).where(eq(perusahaanAsuransi.aktif, true)),
    db.select({ n: count() }).from(users).where(and(eq(users.role, "sales"), eq(users.aktif, true))),
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
          milik ? eq(nasabah.salesId, user.id) : undefined,
        ),
      ),
    db
      .select({ n: count() })
      .from(klaim)
      .innerJoin(polis, eq(polis.id, klaim.polisId))
      .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
      .where(and(eq(klaim.status, "diproses"), milik ? or(eq(polis.salesId, user.id), eq(nasabah.salesId, user.id)) : undefined)),
  ]);

  const statistik: { label: string; nilai: number; href?: string }[] = [
    { label: milik ? "Nasabah saya" : "Nasabah", nilai: nNasabah.n },
    { label: milik ? "Pengajuan & polis saya" : "Pengajuan & polis", nilai: nPolis.n },
    { label: "Asuransi aktif", nilai: nAsuransi.n },
    ...(milik ? [] : [{ label: "Sales aktif", nilai: nSales.n }]),
    { label: "Polis habis ≤ 30 hari", nilai: nHabis.n, href: "/perpanjangan" },
    { label: "Klaim diproses", nilai: nKlaim.n, href: "/klaim" },
  ];

  const namaDepan = user.nama.split(" ")[0];
  return (
    <>
      <KepalaHalaman jejak={[{ label: "Dashboard" }]} judul={`Halo ${namaDepan},`} sorot="selamat bekerja" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {statistik.map((s) => {
          const isi = (
            <Kartu className={`flex h-full flex-col gap-1 ${s.href ? "transition hover:border-brand" : ""}`}>
              <span className="text-[13px] font-medium text-ink-3">{s.label}</span>
              <span className="text-3xl font-extrabold tracking-tight">{s.nilai}</span>
            </Kartu>
          );
          return s.href ? (
            <Link key={s.label} href={s.href}>
              {isi}
            </Link>
          ) : (
            <div key={s.label}>{isi}</div>
          );
        })}
      </div>
      {user.role === "admin" && (
        <Kartu className="flex flex-col gap-3">
          <h2 className="text-base font-bold">Siapkan data awal</h2>
          <ol className="flex flex-col gap-2 text-sm text-ink-2">
            <li>
              1. Isi <Link className="font-semibold text-brand" href="/master/asuransi">perusahaan asuransi</Link> beserta
              email underwriting, WhatsApp PIC, dan paket coverage-nya (Biasa, Plus, Complete).
            </li>
            <li>
              2. Tambahkan{" "}
              <Link className="font-semibold text-brand" href="/master/bengkel">bengkel</Link>.
            </li>
            <li>
              3. Daftarkan <Link className="font-semibold text-brand" href="/master/rekening">rekening pembayaran & kantor</Link>.
            </li>
            <li>
              4. Daftarkan <Link className="font-semibold text-brand" href="/sales">sales</Link> — mereka bisa langsung masuk
              dengan OTP WhatsApp.
            </li>
          </ol>
        </Kartu>
      )}
    </>
  );
}
