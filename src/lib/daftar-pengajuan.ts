import "server-only";
import { and, desc, eq, ilike, inArray, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { kendaraan, nasabah, perusahaanAsuransi, polis, users, type StatusPengajuan, type User } from "@/db/schema";

/** Filter daftar pengajuan (sama dengan tab di halaman Pengajuan) — dipakai ekspor Excel & PDF. */
export const DITUTUP: StatusPengajuan[] = ["ditolak_asuransi", "batal_nasabah", "batal_salah_input"];
export const GILIRAN: Record<"admin" | "sales", StatusPengajuan[]> = {
  sales: ["draft_prospek", "perlu_revisi", "penawaran_masuk", "polis_terbit", "menunggu_bayar"],
  admin: ["data_lengkap", "dikirim_ke_asuransi", "survei_kendaraan", "disetujui_nasabah", "lunas", "premi_disetor", "cashback_cair"],
};
export const LABEL_TAB = { berjalan: "Berjalan", giliran: "Giliran saya", selesai: "Selesai", ditutup: "Ditolak / batal", semua: "Semua" } as const;
export type FilterPengajuan = { tab?: string; q?: string; sales?: string };

export async function daftarPengajuan(user: User, f: FilterPengajuan, batas = 2000) {
  const admin = user.role === "admin";
  const tab = (f.tab && f.tab in LABEL_TAB ? f.tab : "berjalan") as keyof typeof LABEL_TAB;
  const q = f.q?.trim() ?? "";
  const whereTab: SQL | undefined =
    tab === "berjalan"
      ? notInArray(polis.statusPengajuan, [...DITUTUP, "selesai"])
      : tab === "giliran"
        ? inArray(polis.statusPengajuan, GILIRAN[user.role])
        : tab === "selesai"
          ? eq(polis.statusPengajuan, "selesai")
          : tab === "ditutup"
            ? inArray(polis.statusPengajuan, DITUTUP)
            : undefined;
  const statusTerakhir = sql<StatusPengajuan | null>`(
    select sh.status from status_history sh
    where sh.polis_id = ${polis.id} and sh.status not in ('perlu_revisi','ditolak_asuransi','batal_nasabah','batal_salah_input')
    order by sh.waktu desc limit 1)`;
  const diubah = sql<string>`(select to_char(max(sh.waktu) at time zone 'Asia/Jakarta', 'YYYY-MM-DD') from status_history sh where sh.polis_id = ${polis.id})`;
  const rows = await db
    .select({
      p: polis,
      nasabah: nasabah.nama,
      plat: kendaraan.noPolisi,
      kendaraan: sql<string>`${kendaraan.merek} || ' ' || ${kendaraan.model}`,
      asuransi: perusahaanAsuransi.nama,
      sales: users.nama,
      statusTerakhir,
      diubah,
    })
    .from(polis)
    .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
    .innerJoin(kendaraan, eq(kendaraan.id, polis.kendaraanId))
    .innerJoin(users, eq(users.id, polis.salesId))
    .leftJoin(perusahaanAsuransi, eq(perusahaanAsuransi.id, polis.perusahaanId))
    .where(
      and(
        admin ? (f.sales ? eq(polis.salesId, f.sales) : undefined) : eq(polis.salesId, user.id),
        whereTab,
        q
          ? or(
              ilike(polis.kode, `%${q}%`),
              ilike(polis.noPolis, `%${q}%`),
              ilike(nasabah.nama, `%${q}%`),
              ilike(sql`replace(${kendaraan.noPolisi}, ' ', '')`, `%${q.replace(/\s/g, "")}%`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(polis.diubah))
    .limit(batas);
  return { tab, label: LABEL_TAB[tab], q, rows };
}
