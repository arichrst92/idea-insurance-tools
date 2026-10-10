import { asc } from "drizzle-orm";
import { db } from "@/db";
import { bengkel } from "@/db/schema";
import { FormAksi } from "@/components/form-aksi";
import { Isian, Kartu, KepalaHalaman, Kosong, Lencana } from "@/components/ui";
import { TabMaster } from "../tab-master";
import { tambahBengkel, ubahAktifBengkel } from "../actions";

export const metadata = { title: "Bengkel" };

export default async function HalamanBengkel() {
  const daftar = await db.select().from(bengkel).orderBy(asc(bengkel.nama));
  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Master data", href: "/master" }, { label: "Bengkel" }]}
        judul="Bengkel"
        sorot="rekanan"
        sub="Dipilih saat mencatat klaim."
      />
      <TabMaster />
      <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Kartu>
          {daftar.length === 0 ? (
            <Kosong>Belum ada bengkel.</Kosong>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {daftar.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <div className="flex items-center gap-2 font-semibold">
                      {b.nama} {!b.aktif && <Lencana>NONAKTIF</Lencana>}
                    </div>
                    <div className="text-[13px] text-ink-2">{[b.kota, b.noTelp].filter(Boolean).join(" · ") || "–"}</div>
                  </div>
                  <form action={ubahAktifBengkel.bind(null, b.id, !b.aktif)}>
                    <button className="text-[12px] font-semibold text-brand">{b.aktif ? "Nonaktifkan" : "Aktifkan"}</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Kartu>
        <Kartu className="flex flex-col gap-4">
          <h2 className="text-base font-bold">Tambah bengkel</h2>
          <FormAksi aksi={tambahBengkel} tombol="Tambah bengkel" resetSetelahOk>
            <Isian label="Nama bengkel" name="nama" required />
            <Isian label="Kota" name="kota" placeholder="Bandung" />
            <Isian label="No. telepon" name="noTelp" inputMode="tel" />
          </FormAksi>
        </Kartu>
      </div>
    </>
  );
}
