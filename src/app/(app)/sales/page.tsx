import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { targetSales, users } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { Kartu, KepalaHalaman, Kosong, Lencana, TautanTombol } from "@/components/ui";
import { bulanIni, persen, rupiah } from "@/lib/format";
import { formatNoWa } from "@/lib/wa";

export const metadata = { title: "Sales & pengguna" };

export default async function DaftarSales() {
  await wajibLogin("admin");
  const daftar = await db
    .select({ u: users, t: targetSales })
    .from(users)
    .leftJoin(targetSales, and(eq(targetSales.salesId, users.id), eq(targetSales.bulan, bulanIni())))
    .orderBy(asc(users.role), asc(users.nama));

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Sales & pengguna" }]}
        judul="Sales &"
        sorot="pengguna"
        sub="Setiap pengguna masuk dengan OTP WhatsApp ke nomor yang didaftarkan di sini."
        aksi={<TautanTombol href="/sales/baru">Tambah pengguna</TautanTombol>}
      />
      {daftar.length === 0 ? (
        <Kosong>Belum ada pengguna.</Kosong>
      ) : (
        <Kartu className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-[12px] uppercase tracking-wider text-ink-3">
              <tr className="border-b border-line">
                <th className="px-5 py-3 font-semibold">Nama</th>
                <th className="px-3 py-3 font-semibold">Tipe</th>
                <th className="px-3 py-3 text-right font-semibold">Bagi hasil kantor</th>
                <th className="px-3 py-3 text-right font-semibold">Maks cashback</th>
                <th className="px-3 py-3 font-semibold">Target bulan ini</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {daftar.map(({ u, t }) => (
                <tr key={u.id} className="border-b border-line last:border-0 hover:bg-canvas">
                  <td className="px-5 py-3">
                    <Link href={`/sales/${u.id}`} className="font-semibold hover:text-brand">
                      {u.nama}
                    </Link>
                    <div className="text-xs text-ink-3">
                      {[u.kodeSales, formatNoWa(u.noWa)].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {u.role === "admin" ? (
                      <Lencana nada="brand">ADMIN</Lencana>
                    ) : (
                      <Lencana>{u.tipeSales === "fulltime" ? "FULLTIME" : "FREELANCE"}</Lencana>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{u.role === "sales" ? persen(u.bagiHasilKantorPersen) : "–"}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{u.role === "sales" ? persen(u.maksCashbackNasabahPersen) : "–"}</td>
                  <td className="px-3 py-3 text-ink-2">
                    {t ? (
                      <>
                        {t.targetCase} case · {rupiah(t.targetRevenue)}
                        <span className="text-ink-4"> (utama: {t.targetUtama})</span>
                      </>
                    ) : u.tipeSales === "fulltime" ? (
                      <span className="text-warn">Belum diisi</span>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="px-5 py-3">{u.aktif ? <Lencana nada="ok">AKTIF</Lencana> : <Lencana nada="bad">NONAKTIF</Lencana>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Kartu>
      )}
    </>
  );
}
