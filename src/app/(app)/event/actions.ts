"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { eventBagiHasil } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { catatAudit } from "@/lib/audit";
import { parsePersen } from "@/lib/format";
import type { StateForm } from "@/components/form-aksi";

const teks = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function buatEvent(_: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  const d = z
    .object({
      nama: z.string().min(3, "Nama event wajib diisi"),
      tglMulai: z.string().date("Isi tanggal mulai"),
      tglSelesai: z.string().date("Isi tanggal selesai"),
      tambahanKomisiPersen: z
        .number({ invalid_type_error: "Isi % tambahan komisi sales" })
        .gt(0, "Tambahan komisi harus lebih dari 0%")
        .max(200, "Tambahan komisi maks 200%"),
      berlakuUntuk: z.enum(["semua", "fulltime", "freelance", "pilihan"]),
      salesIds: z.array(z.string()),
    })
    .refine((x) => x.tglSelesai >= x.tglMulai, { message: "Tanggal selesai harus setelah tanggal mulai" })
    .refine((x) => x.berlakuUntuk !== "pilihan" || x.salesIds.length > 0, { message: "Pilih minimal satu sales" })
    .safeParse({
      nama: teks(f, "nama"),
      tglMulai: teks(f, "tglMulai"),
      tglSelesai: teks(f, "tglSelesai"),
      tambahanKomisiPersen: teks(f, "tambahanKomisiPersen") ? parsePersen(teks(f, "tambahanKomisiPersen")) : undefined,
      berlakuUntuk: teks(f, "berlakuUntuk") || "semua",
      salesIds: f.getAll("salesIds").map(String),
    });
  if (!d.success) return { error: d.error.issues[0]?.message };
  const [e] = await db
    .insert(eventBagiHasil)
    .values({ ...d.data, salesIds: d.data.berlakuUntuk === "pilihan" ? d.data.salesIds : [] })
    .returning({ id: eventBagiHasil.id });
  await catatAudit({ userId: user.id, aksi: "tambah", tabel: "event_bagi_hasil", recordId: e.id, detail: d.data });
  revalidatePath("/event");
  return { ok: "Event dibuat" };
}

export async function ubahAktifEvent(id: string, aktif: boolean) {
  const { user } = await wajibLogin("admin");
  await db.update(eventBagiHasil).set({ aktif }).where(eq(eventBagiHasil.id, id));
  await catatAudit({ userId: user.id, aksi: aktif ? "aktifkan" : "nonaktifkan", tabel: "event_bagi_hasil", recordId: id });
  revalidatePath("/event");
}
