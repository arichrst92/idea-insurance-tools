import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { db as Db } from "@/db";
import { nasabah, pengalihanSales, polis } from "@/db/schema";
import { STATUS_SEBELUM_TERBIT } from "@/lib/domain/journey";

type Tx = Parameters<Parameters<typeof Db.transaction>[0]>[0];

/**
 * Pindahkan nasabah ke sales lain.
 * - Pengajuan yang belum terbit selalu ikut pindah.
 * - Polis yang sudah terbit tetap milik sales lama (komisinya dibayar ke sales lama),
 *   kecuali komisiIkut = true.
 */
export async function alihkanNasabah(
  tx: Tx,
  p: { nasabahId: string; dariSalesId: string; keSalesId: string; komisiIkut: boolean; oleh: string },
): Promise<{ polisDipindah: number }> {
  await tx.update(nasabah).set({ salesId: p.keSalesId }).where(eq(nasabah.id, p.nasabahId));

  const kondisi = p.komisiIkut
    ? eq(polis.nasabahId, p.nasabahId)
    : and(eq(polis.nasabahId, p.nasabahId), inArray(polis.statusPengajuan, STATUS_SEBELUM_TERBIT));
  const dipindah = await tx
    .update(polis)
    .set({ salesId: p.keSalesId })
    .where(and(kondisi, eq(polis.salesId, p.dariSalesId)))
    .returning({ id: polis.id });

  await tx.insert(pengalihanSales).values({
    dariSalesId: p.dariSalesId,
    keSalesId: p.keSalesId,
    nasabahId: p.nasabahId,
    komisiIkut: p.komisiIkut,
    oleh: p.oleh,
  });
  return { polisDipindah: dipindah.length };
}
