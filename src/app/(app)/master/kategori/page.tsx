import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { kategoriPolis, perusahaanAsuransi } from "@/db/schema";
import { FormAksi } from "@/components/form-aksi";
import { Isian, Kartu, KepalaHalaman, Kosong, Lencana, Pilihan } from "@/components/ui";
import { persen } from "@/lib/format";
import { TabMaster } from "../tab-master";
import { tambahKategori, ubahAktifKategori } from "../actions";

export const metadata = { title: "Kategori polis" };

export default async function HalamanKategori() {
  const [daftar, asuransi] = await Promise.all([
    db
      .select({ k: kategoriPolis, asuransi: perusahaanAsuransi.nama })
      .from(kategoriPolis)
      .innerJoin(perusahaanAsuransi, eq(perusahaanAsuransi.id, kategoriPolis.perusahaanId))
      .orderBy(asc(perusahaanAsuransi.nama), asc(kategoriPolis.namaProduk)),
    db.select().from(perusahaanAsuransi).where(eq(perusahaanAsuransi.aktif, true)).orderBy(asc(perusahaanAsuransi.nama)),
  ]);

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Master data", href: "/master" }, { label: "Kategori polis" }]}
        judul="Kategori"
        sorot="polis"
        sub="Produk asuransi per perusahaan: jenis, rate dasar, dan perluasan yang tersedia."
      />
      <TabMaster />
      <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Kartu className="overflow-x-auto p-0">
          {daftar.length === 0 ? (
            <div className="p-5">
              <Kosong>Belum ada kategori polis.</Kosong>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-[12px] uppercase tracking-wider text-ink-3">
                <tr className="border-b border-line">
                  <th className="px-5 py-3 font-semibold">Produk</th>
                  <th className="px-3 py-3 font-semibold">Jenis</th>
                  <th className="px-3 py-3 text-right font-semibold">Rate</th>
                  <th className="px-3 py-3 font-semibold">Perluasan</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {daftar.map(({ k, asuransi }) => (
                  <tr key={k.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3">
                      <div className="font-semibold">{k.namaProduk}</div>
                      <div className="text-xs text-ink-3">{asuransi}</div>
                    </td>
                    <td className="px-3 py-3">
                      <Lencana nada={k.jenis === "TLO" ? "netral" : "brand"}>{k.jenis}</Lencana>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{persen(k.rateDasarPersen)}</td>
                    <td className="px-3 py-3 text-ink-2">{k.perluasanTersedia.join(", ") || "–"}</td>
                    <td className="px-5 py-3 text-right">
                      <form action={ubahAktifKategori.bind(null, k.id, !k.aktif)}>
                        <button className="text-[12px] font-semibold text-brand">{k.aktif ? "Nonaktifkan" : "Aktifkan"}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Kartu>
        <Kartu className="flex flex-col gap-4">
          <h2 className="text-base font-bold">Tambah kategori</h2>
          <FormAksi aksi={tambahKategori} tombol="Tambah kategori" resetSetelahOk>
            <Pilihan label="Asuransi" name="perusahaanId" required defaultValue="">
              <option value="" disabled>
                Pilih asuransi…
              </option>
              {asuransi.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nama}
                </option>
              ))}
            </Pilihan>
            <Isian label="Nama produk" name="namaProduk" placeholder="Comprehensive" required />
            <div className="grid grid-cols-2 gap-3">
              <Pilihan label="Jenis" name="jenis" defaultValue="All Risk">
                <option>All Risk</option>
                <option>TLO</option>
              </Pilihan>
              <Isian label="Rate dasar (%)" name="rateDasarPersen" inputMode="decimal" placeholder="2,5" />
            </div>
            <Isian
              label="Perluasan tersedia"
              name="perluasan"
              placeholder="Banjir, Huru-hara, Gempa"
              hint="Pisahkan dengan koma."
            />
          </FormAksi>
        </Kartu>
      </div>
    </>
  );
}
