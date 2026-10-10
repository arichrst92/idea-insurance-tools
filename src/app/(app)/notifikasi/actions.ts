"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifikasi } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";

export async function tandaiSemuaDibaca() {
  const { user } = await wajibLogin();
  await db.update(notifikasi).set({ dibaca: true }).where(and(eq(notifikasi.userId, user.id), eq(notifikasi.dibaca, false)));
  revalidatePath("/", "layout");
}
