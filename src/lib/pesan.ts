import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { waLog, waOptout, waTemplate } from "@/db/schema";
import { kirimWa } from "@/lib/fonnte";
import { linkWaMe } from "@/lib/wa";
import { rapikan, renderTemplate } from "@/lib/domain/template";

export type JenisPesan = "instruksi_bayar" | "remind" | "notifikasi" | "kirim_asuransi" | "tracker";

export type HasilPesan =
  | { kanal: "fonnte"; ok: true }
  | { kanal: "wame"; url: string; alasan: string }
  | { kanal: "optout" };

/** Ambil & isi template WhatsApp (tabel wa_template, bisa diedit admin). */
export async function isiTemplate(kode: string, vars: Record<string, string | number | null | undefined>): Promise<string> {
  const [t] = await db.select().from(waTemplate).where(and(eq(waTemplate.kode, kode), eq(waTemplate.aktif, true)));
  if (!t) throw new Error(`Template WhatsApp "${kode}" tidak ada atau nonaktif`);
  return rapikan(renderTemplate(t.isi, vars));
}

/**
 * Kirim WhatsApp dari nomor kantor (Fonnte) dan catat di wa_log.
 * Bila Fonnte gagal/tidak tersedia, kembalikan link wa.me sebagai cadangan
 * agar pengguna bisa mengirim dari WhatsApp-nya sendiri.
 */
export async function kirimPesan(p: {
  ke: string;
  isi: string;
  jenis: JenisPesan;
  polisId?: string | null;
  userId?: string | null;
  lampiranUrl?: string;
  namaLampiran?: string;
  /** Kode opt-out (mis. "remind"): nomor yang membalas BERHENTI tidak dikirimi. */
  optoutKode?: string;
}): Promise<HasilPesan> {
  if (p.optoutKode) {
    const [o] = await db
      .select({ id: waOptout.id })
      .from(waOptout)
      .where(and(eq(waOptout.nomor, p.ke), eq(waOptout.jenisPesan, p.optoutKode)));
    if (o) return { kanal: "optout" };
  }

  const hasil = await kirimWa({ target: p.ke, message: p.isi, url: p.lampiranUrl, filename: p.namaLampiran });
  await db.insert(waLog).values({
    polisId: p.polisId ?? null,
    userId: p.userId ?? null,
    nomorTujuan: p.ke,
    jenis: p.jenis,
    kanal: hasil.ok ? "fonnte" : "wame",
    fonnteId: hasil.ok ? hasil.id : null,
    status: hasil.ok ? "terkirim" : "antre",
    lampiran: p.lampiranUrl ?? null,
    isi: p.isi,
  });
  if (hasil.ok) return { kanal: "fonnte", ok: true };

  // Cadangan wa.me tidak bisa melampirkan file → sertakan link unduh di teks.
  const teks = p.lampiranUrl ? `${p.isi}\n\nFile: ${p.lampiranUrl}` : p.isi;
  return { kanal: "wame", url: linkWaMe(p.ke, teks), alasan: hasil.alasan };
}
