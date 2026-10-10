import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { rekening, targetSales, users } from "@/db/schema";
import { Kartu, KepalaHalaman, Lencana, Pesan, Tombol } from "@/components/ui";
import { aktifkanSales } from "./nonaktifkan/actions";
import { perluVerifikasiUlang, wajibLogin } from "@/lib/auth/session";
import { bulanIni, namaBulan } from "@/lib/format";
import { formatNoWa } from "@/lib/wa";
import { FormSales } from "../form-sales";
import { simpanSales } from "../actions";

export default async function EditSales({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ baru?: string; nonaktif?: string }>;
}) {
  const sesi = await wajibLogin("admin");
  const { id } = await params;
  const { baru, nonaktif } = await searchParams;
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) notFound();
  const bulan = bulanIni();
  const [[t], [r]] = await Promise.all([
    db.select().from(targetSales).where(and(eq(targetSales.salesId, id), eq(targetSales.bulan, bulan))),
    db
      .select()
      .from(rekening)
      .where(and(eq(rekening.pemilikTipe, "sales"), eq(rekening.pemilikId, id), eq(rekening.utama, true))),
  ]);

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Sales", href: "/sales" }, { label: u.nama }]}
        judul={u.nama}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            {u.kodeSales && <Lencana nada="brand">{u.kodeSales}</Lencana>}
            {!u.aktif && <Lencana nada="bad">NONAKTIF</Lencana>}
            {formatNoWa(u.noWa)} · target {namaBulan(bulan)}
          </span>
        }
        aksi={
          u.role === "sales" && u.id !== sesi.user.id ? (
            <>
            <Link href={`/performa/${id}`} className="inline-flex h-10 items-center rounded-full border border-line-2 bg-white px-5 text-sm font-semibold">
              Performa
            </Link>
            {
            u.aktif ? (
              <Link
                href={`/sales/${id}/nonaktifkan`}
                className="inline-flex h-10 items-center rounded-full border border-bad/30 bg-white px-5 text-sm font-semibold text-bad hover:bg-bad-soft"
              >
                Nonaktifkan
              </Link>
            ) : (
              <form action={aktifkanSales.bind(null, id)}>
                <Tombol varian="kedua">Aktifkan kembali</Tombol>
              </form>
            )}
            </>
          ) : undefined
        }
      />
      {nonaktif && <Pesan ok={`${u.nama} dinonaktifkan; ${nonaktif} nasabah sudah dialihkan dan semua sesi login dicabut.`} />}
      {!u.aktif && !nonaktif && (
        <p className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm text-bad">
          Nonaktif sejak {u.tglNonaktif} — {u.alasanNonaktif}
        </p>
      )}
      {baru && <Pesan ok={`${u.nama} tersimpan. Ia sudah bisa masuk dengan OTP ke ${formatNoWa(u.noWa)}.`} />}
      {perluVerifikasiUlang(sesi) && (
        <p className="rounded-xl bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
          Untuk mengubah bagi hasil, target, gaji, atau rekening, verifikasi OTP ulang dulu (terakhir lebih dari 12 jam lalu).{" "}
          <Link href={`/verifikasi?lanjut=/sales/${id}`} className="font-bold underline">
            Verifikasi sekarang
          </Link>
        </p>
      )}
      <Kartu className="max-w-4xl">
        <FormSales
          aksi={simpanSales.bind(null, id)}
          tombol="Simpan perubahan"
          awal={{
            nama: u.nama,
            noWa: formatNoWa(u.noWa),
            email: u.email ?? "",
            role: u.role,
            tipeSales: u.tipeSales ?? "",
            bagiHasilKantorPersen: u.bagiHasilKantorPersen,
            maksCashbackNasabahPersen: u.maksCashbackNasabahPersen,
            gajiPokok: u.gajiPokok != null ? String(u.gajiPokok) : "",
            targetCase: t ? String(t.targetCase) : "",
            targetRevenue: t ? String(t.targetRevenue) : "",
            targetUtama: t?.targetUtama ?? "revenue",
            namaBank: r?.namaBank ?? "BCA",
            kodeBank: r?.kodeBank ?? "014",
            noRekening: r?.noRekening ?? "",
            atasNama: r?.atasNama ?? u.nama,
          }}
        />
      </Kartu>
    </>
  );
}
