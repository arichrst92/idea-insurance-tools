import "server-only";
import { and, asc, count, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { nasabah, panduanBagian, polis, rekening, users } from "@/db/schema";
import { PANDUAN_BAWAAN, progresOnboarding } from "@/lib/domain/panduan";

/** Isi bawaan dimasukkan sekali bila tabel masih kosong (aman diulang). */
export async function pastikanPanduan() {
  const [{ n }] = await db.select({ n: count() }).from(panduanBagian);
  if (n > 0) return;
  await db.insert(panduanBagian).values(PANDUAN_BAWAAN).onConflictDoNothing();
}

export async function bagianPanduan(semua: boolean) {
  await pastikanPanduan();
  return db
    .select()
    .from(panduanBagian)
    .where(semua ? undefined : eq(panduanBagian.aktif, true))
    .orderBy(asc(panduanBagian.urutan), asc(panduanBagian.judul));
}

const STATUS_BELUM_DIKIRIM = ["draft_prospek", "perlu_revisi", "batal_salah_input"] as const;

/** Langkah onboarding yang terdeteksi otomatis dari data, untuk banyak sales sekaligus. */
async function deteksi(salesIds: string[]) {
  if (salesIds.length === 0) return new Map<string, { rekening: boolean; nasabah_pertama: boolean; pengajuan_pertama: boolean }>();
  const [rek, nas, pol] = await Promise.all([
    db
      .select({ id: rekening.pemilikId })
      .from(rekening)
      .where(and(eq(rekening.pemilikTipe, "sales"), inArray(rekening.pemilikId, salesIds), eq(rekening.utama, true), eq(rekening.aktif, true))),
    db.select({ id: nasabah.salesId }).from(nasabah).where(inArray(nasabah.salesId, salesIds)).groupBy(nasabah.salesId),
    db
      .select({ id: polis.salesId })
      .from(polis)
      .where(and(inArray(polis.salesId, salesIds), notInArray(polis.statusPengajuan, [...STATUS_BELUM_DIKIRIM])))
      .groupBy(polis.salesId),
  ]);
  const ada = (rows: { id: string | null }[]) => new Set(rows.map((r) => r.id));
  const [r, n, p] = [ada(rek), ada(nas), ada(pol)];
  return new Map(salesIds.map((id) => [id, { rekening: r.has(id), nasabah_pertama: n.has(id), pengajuan_pertama: p.has(id) }]));
}

/** Onboarding satu sales + rekening komisinya (ditampilkan ke sales itu sendiri). */
export async function onboardingSales(salesId: string) {
  const [[u], d, [rek]] = await Promise.all([
    db.select({ centang: users.onboardingCentang, ditutup: users.onboardingDitutup }).from(users).where(eq(users.id, salesId)),
    deteksi([salesId]),
    db
      .select({ bank: rekening.namaBank, no: rekening.noRekening, atasNama: rekening.atasNama })
      .from(rekening)
      .where(and(eq(rekening.pemilikTipe, "sales"), eq(rekening.pemilikId, salesId), eq(rekening.utama, true), eq(rekening.aktif, true))),
  ]);
  return { ...progresOnboarding(u?.centang ?? [], d.get(salesId) ?? {}), ditutup: !!u?.ditutup, rekening: rek ?? null };
}

/** Ringkasan onboarding semua sales aktif (untuk admin). */
export async function onboardingSemua() {
  const daftar = await db
    .select({ id: users.id, nama: users.nama, centang: users.onboardingCentang, dibuka: users.panduanDibuka, dibuat: users.dibuat })
    .from(users)
    .where(and(eq(users.role, "sales"), eq(users.aktif, true)))
    .orderBy(sql`${users.dibuat} desc`);
  const d = await deteksi(daftar.map((s) => s.id));
  return daftar.map((s) => ({ ...s, ...progresOnboarding(s.centang, d.get(s.id) ?? {}) }));
}

/** Catat pertama kali sales membuka panduan (setelah itu login tidak lagi diarahkan ke /panduan). */
export async function tandaiPanduanDibuka(userId: string) {
  await db.update(users).set({ panduanDibuka: new Date() }).where(and(eq(users.id, userId), sql`${users.panduanDibuka} is null`));
}
