import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifikasi } from "@/db/schema";
import { Dock } from "@/components/dock";
import { wajibLogin } from "@/lib/auth/session";
import { labelPeran } from "@/lib/peran";

export default async function LayoutAplikasi({ children }: { children: React.ReactNode }) {
  const { user } = await wajibLogin();
  const [{ n: belumDibaca }] = await db.select({ n: count() }).from(notifikasi).where(and(eq(notifikasi.userId, user.id), eq(notifikasi.dibaca, false)));

  return (
    <div className="relative min-h-dvh">
      <div aria-hidden className="bg-dots pointer-events-none absolute inset-x-0 top-0 h-72" />
      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-36 pt-6 sm:px-8">{children}</main>
      <Dock role={user.role} label={labelPeran(user)} nama={user.nama} belumDibaca={belumDibaca} />
    </div>
  );
}
