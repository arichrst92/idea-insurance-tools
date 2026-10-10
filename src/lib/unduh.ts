import "server-only";
import { db } from "@/db";
import { linkUnduh } from "@/db/schema";
import { tokenPendek } from "@/lib/id";

/** Link unduh publik berbatas waktu, mis. insurance.ide.asia/p/7KQ2MXW4 (dipakai lampiran WhatsApp). */
export async function buatLinkUnduh(dokumenId: string, hari = 14): Promise<string> {
  const kode = tokenPendek(8);
  await db.insert(linkUnduh).values({
    dokumenId,
    kode,
    kedaluwarsa: new Date(Date.now() + hari * 24 * 60 * 60 * 1000),
  });
  return `${process.env.APP_URL ?? "http://localhost:3000"}/p/${kode}`;
}
