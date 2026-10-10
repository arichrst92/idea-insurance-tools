import Link from "next/link";
import { count, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { nasabah, perusahaanAsuransi, polis, users } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { Kartu, KepalaHalaman } from "@/components/ui";

export default async function Dashboard() {
  const { user } = await wajibLogin();
  const milik = user.role === "sales";

  const [[nNasabah], [nPolis], [nAsuransi], [nSales]] = await Promise.all([
    db.select({ n: count() }).from(nasabah).where(milik ? eq(nasabah.salesId, user.id) : undefined),
    db.select({ n: count() }).from(polis).where(milik ? eq(polis.salesId, user.id) : undefined),
    db.select({ n: count() }).from(perusahaanAsuransi).where(eq(perusahaanAsuransi.aktif, true)),
    db.select({ n: count() }).from(users).where(and(eq(users.role, "sales"), eq(users.aktif, true))),
  ]);

  const statistik = [
    { label: milik ? "Nasabah saya" : "Nasabah", nilai: nNasabah.n },
    { label: milik ? "Pengajuan & polis saya" : "Pengajuan & polis", nilai: nPolis.n },
    { label: "Asuransi aktif", nilai: nAsuransi.n },
    ...(milik ? [] : [{ label: "Sales aktif", nilai: nSales.n }]),
  ];

  const namaDepan = user.nama.split(" ")[0];
  return (
    <>
      <KepalaHalaman jejak={[{ label: "Dashboard" }]} judul={`Halo ${namaDepan},`} sorot="selamat bekerja" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {statistik.map((s) => (
          <Kartu key={s.label} className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-ink-3">{s.label}</span>
            <span className="text-3xl font-extrabold tracking-tight">{s.nilai}</span>
          </Kartu>
        ))}
      </div>
      {user.role === "admin" && (
        <Kartu className="flex flex-col gap-3">
          <h2 className="text-base font-bold">Siapkan data awal</h2>
          <ol className="flex flex-col gap-2 text-sm text-ink-2">
            <li>
              1. Isi <Link className="font-semibold text-brand" href="/master/asuransi">perusahaan asuransi</Link> beserta
              email underwriting dan WhatsApp PIC.
            </li>
            <li>
              2. Tambahkan <Link className="font-semibold text-brand" href="/master/kategori">kategori polis</Link> dan{" "}
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
