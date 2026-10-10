import { desc, eq } from "drizzle-orm";
import clsx from "clsx";
import { db } from "@/db";
import { notifikasi } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { Kartu, KepalaHalaman, Kosong, Tombol } from "@/components/ui";
import { tandaiSemuaDibaca } from "./actions";

export const metadata = { title: "Notifikasi" };

const jam = (d: Date) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(d);

export default async function HalamanNotifikasi() {
  const { user } = await wajibLogin();
  const daftar = await db.select().from(notifikasi).where(eq(notifikasi.userId, user.id)).orderBy(desc(notifikasi.dibuat)).limit(100);
  const belum = daftar.filter((n) => !n.dibaca).length;
  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Notifikasi" }]}
        judul="Notifikasi"
        sub={belum ? `${belum} belum dibaca` : "Semua sudah dibaca"}
        aksi={
          belum > 0 ? (
            <form action={tandaiSemuaDibaca}>
              <Tombol varian="kedua">Tandai semua dibaca</Tombol>
            </form>
          ) : undefined
        }
      />
      {daftar.length === 0 ? (
        <Kosong>Belum ada notifikasi.</Kosong>
      ) : (
        <Kartu className="p-0">
          <ul className="divide-y divide-line" data-uji="daftar-notifikasi">
            {daftar.map((n) => (
              <li key={n.id}>
                <a href={`/notifikasi/${n.id}`} className={clsx("flex gap-3 px-5 py-3.5 hover:bg-canvas", !n.dibaca && "bg-brand-soft/40")}>
                  <span aria-hidden className={clsx("mt-1.5 size-2 shrink-0 rounded-full", n.dibaca ? "bg-transparent" : "bg-brand")} />
                  <span className="min-w-0 flex-1">
                    <span className={clsx("block text-sm", !n.dibaca && "font-bold")}>{n.judul}</span>
                    {n.isi && <span className="block text-[13px] text-ink-2">{n.isi}</span>}
                    <span className="text-[12px] text-ink-3">{jam(n.dibuat)}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Kartu>
      )}
    </>
  );
}
