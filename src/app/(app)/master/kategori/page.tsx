import { asc } from "drizzle-orm";
import { db } from "@/db";
import { kategoriPolis } from "@/db/schema";
import { FormAksi } from "@/components/form-aksi";
import { Isian, IsianPanjang, Kartu, KepalaHalaman, Kosong, Lencana } from "@/components/ui";
import { TabMaster } from "../tab-master";
import { simpanPaket, ubahAktifKategori } from "../actions";

export const metadata = { title: "Paket coverage" };

export default async function HalamanPaket() {
  const daftar = await db.select().from(kategoriPolis).orderBy(asc(kategoriPolis.urutan), asc(kategoriPolis.nama));

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Master data", href: "/master" }, { label: "Paket coverage" }]}
        judul="Paket"
        sorot="coverage"
        sub="Paket yang ditawarkan ke nasabah, berlaku untuk semua asuransi. Premi tiap paket dicatat dari penawaran asuransi, tidak dihitung sistem."
      />
      <TabMaster />
      <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-3">
          {daftar.length === 0 && <Kosong>Belum ada paket. Tambahkan Biasa, Plus, Complete.</Kosong>}
          {daftar.map((k) => (
            <Kartu key={k.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-extrabold">{k.nama}</h2>
                {!k.aktif && <Lencana>NONAKTIF</Lencana>}
              </div>
              <ul className="flex flex-col gap-1 text-sm text-ink-2">
                {k.cakupan.map((c) => (
                  <li key={c} className="flex gap-2">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                    {c}
                  </li>
                ))}
              </ul>
              <div className="flex gap-4 border-t border-line pt-3">
                <details className="flex-1">
                  <summary className="cursor-pointer text-[13px] font-semibold text-brand">Ubah</summary>
                  <div className="pt-3">
                    <FormAksi aksi={simpanPaket.bind(null, k.id)} tombol="Simpan paket" varian="kedua">
                      <div className="grid grid-cols-[1fr_96px] gap-3">
                        <Isian label="Nama paket" name="nama" defaultValue={k.nama} required />
                        <Isian label="Urutan" name="urutan" type="number" min={0} defaultValue={k.urutan} />
                      </div>
                      <IsianPanjang label="Risiko yang dijamin" name="cakupan" defaultValue={k.cakupan.join("\n")} hint="Satu baris per item." rows={6} />
                    </FormAksi>
                  </div>
                </details>
                <form action={ubahAktifKategori.bind(null, k.id, !k.aktif)}>
                  <button className="text-[13px] font-semibold text-ink-3 hover:text-ink">{k.aktif ? "Nonaktifkan" : "Aktifkan"}</button>
                </form>
              </div>
            </Kartu>
          ))}
        </div>
        <Kartu className="flex flex-col gap-4">
          <h2 className="text-base font-bold">Tambah paket</h2>
          <FormAksi aksi={simpanPaket.bind(null, null)} tombol="Tambah paket" resetSetelahOk>
            <div className="grid grid-cols-[1fr_96px] gap-3">
              <Isian label="Nama paket" name="nama" placeholder="Plus" required />
              <Isian label="Urutan" name="urutan" type="number" min={0} defaultValue={daftar.length + 1} />
            </div>
            <IsianPanjang
              label="Risiko yang dijamin"
              name="cakupan"
              rows={6}
              placeholder={"Tabrakan, benturan, terperosok, tergelincir\nBanjir, badai, angin topan\nTuntutan pihak ke-3"}
              hint="Satu baris per item."
              required
            />
          </FormAksi>
        </Kartu>
      </div>
    </>
  );
}
