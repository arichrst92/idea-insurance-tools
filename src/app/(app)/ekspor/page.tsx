import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { exportJobs, users } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { Kartu, KepalaHalaman, Kosong, Lencana } from "@/components/ui";
import { JENIS_EKSPOR, type JenisEkspor } from "@/lib/ekspor/antrian";

export const metadata = { title: "Riwayat ekspor" };
export const dynamic = "force-dynamic";

const jam = (d: Date) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(d);

export default async function RiwayatEkspor() {
  const { user } = await wajibLogin();
  const admin = user.role === "admin";
  const daftar = await db
    .select({ j: exportJobs, nama: users.nama })
    .from(exportJobs)
    .innerJoin(users, eq(users.id, exportJobs.userId))
    .where(admin ? undefined : eq(exportJobs.userId, user.id))
    .orderBy(desc(exportJobs.dibuat))
    .limit(100);
  return (
    <>
      <KepalaHalaman jejak={[{ label: "Riwayat ekspor" }]} judul="Riwayat" sorot="ekspor" sub="File PDF & Excel bisa diunduh selama 7 hari. PDF dibuat di background; halaman ini diperbarui saat Anda membukanya." />
      {daftar.length === 0 ? (
        <Kosong>Belum ada ekspor.</Kosong>
      ) : (
        <Kartu className="p-0">
          <ul className="divide-y divide-line" data-uji="riwayat-ekspor">
            {daftar.map(({ j, nama }) => {
              const kedaluwarsa = Date.now() - j.dibuat.getTime() > 7 * 86_400_000;
              const f = (j.filter ?? {}) as Record<string, string>;
              return (
                <li key={j.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <span>
                    <b>{JENIS_EKSPOR[j.jenisLaporan as JenisEkspor] ?? j.jenisLaporan}</b> <Lencana nada="netral">{j.format.toUpperCase()}</Lencana>
                    <span className="block text-[12px] text-ink-3">
                      {jam(j.dibuat)}
                      {admin && ` · ${nama}`}
                      {Object.keys(f).length > 0 && ` · ${Object.entries(f).map(([k, v]) => `${k}: ${v}`).join(", ")}`}
                    </span>
                  </span>
                  {j.status === "selesai" ? (
                    kedaluwarsa ? (
                      <span className="text-[13px] text-ink-3">Kedaluwarsa</span>
                    ) : (
                      <a href={`/api/ekspor/${j.id}`} download className="text-sm font-semibold text-brand">
                        Unduh
                      </a>
                    )
                  ) : (
                    <Lencana nada={j.status === "gagal" ? "bad" : "brand"}>{j.status === "gagal" ? "GAGAL" : j.status === "proses" ? "DIPROSES" : "ANTRE"}</Lencana>
                  )}
                </li>
              );
            })}
          </ul>
        </Kartu>
      )}
    </>
  );
}
