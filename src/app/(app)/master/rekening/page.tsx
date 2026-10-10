import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { rekening } from "@/db/schema";
import { FormAksi } from "@/components/form-aksi";
import { Isian, Kartu, KepalaHalaman, Kosong, Lencana, Pilihan } from "@/components/ui";
import { TabMaster } from "../tab-master";
import { tambahRekeningKantor, ubahAktifRekening } from "../actions";

export const metadata = { title: "Rekening kantor" };

export default async function HalamanRekening() {
  const daftar = await db
    .select()
    .from(rekening)
    .where(inArray(rekening.pemilikTipe, ["pembayaran", "kantor"]))
    .orderBy(asc(rekening.pemilikTipe), asc(rekening.namaBank));

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Master data", href: "/master" }, { label: "Rekening kantor" }]}
        judul="Rekening"
        sorot="kantor & pembayaran"
        sub="Rekening pembayaran dipilih per polis di instruksi bayar; rekening kantor dipakai di buku kas."
      />
      <TabMaster />
      <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Kartu>
          {daftar.length === 0 ? (
            <Kosong>Belum ada rekening.</Kosong>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {daftar.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 font-semibold">
                      {r.namaBank} {r.noRekening}
                      <Lencana nada={r.pemilikTipe === "pembayaran" ? "brand" : "netral"}>
                        {r.pemilikTipe === "pembayaran" ? "PEMBAYARAN POLIS" : "KANTOR"}
                      </Lencana>
                      {r.utama && <Lencana nada="ok">UTAMA</Lencana>}
                      {!r.aktif && <Lencana>NONAKTIF</Lencana>}
                    </div>
                    <div className="text-[13px] text-ink-2">
                      a.n. {r.atasNama}
                      {r.kodeBank && <> · kode bank {r.kodeBank}</>}
                    </div>
                  </div>
                  <form action={ubahAktifRekening.bind(null, r.id, !r.aktif)}>
                    <button className="text-[12px] font-semibold text-brand">{r.aktif ? "Nonaktifkan" : "Aktifkan"}</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Kartu>
        <Kartu className="flex flex-col gap-4">
          <h2 className="text-base font-bold">Tambah rekening</h2>
          <FormAksi aksi={tambahRekeningKantor} tombol="Tambah rekening" resetSetelahOk>
            <Pilihan label="Jenis" name="pemilikTipe" defaultValue="pembayaran">
              <option value="pembayaran">Pembayaran polis</option>
              <option value="kantor">Rekening kantor</option>
            </Pilihan>
            <div className="grid grid-cols-[1fr_96px] gap-3">
              <Isian label="Bank" name="namaBank" placeholder="BCA" required />
              <Isian label="Kode bank" name="kodeBank" placeholder="014" maxLength={3} inputMode="numeric" />
            </div>
            <Isian label="No. rekening" name="noRekening" inputMode="numeric" required />
            <Isian label="Atas nama" name="atasNama" placeholder="PT Solusi Inovasi Bangsa" required />
            <label className="flex items-center gap-2.5 text-sm text-ink-2">
              <input type="checkbox" name="utama" className="size-4 accent-brand" /> Jadikan rekening utama
            </label>
          </FormAksi>
        </Kartu>
      </div>
    </>
  );
}
