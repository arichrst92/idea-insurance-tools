import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { kategoriPolis, kontakAsuransi, perusahaanAsuransi } from "@/db/schema";
import { FormAksi } from "@/components/form-aksi";
import { wajibLogin } from "@/lib/auth/session";
import { adalahOwner } from "@/lib/peran";
import { TabMaster } from "@/app/(app)/master/tab-master";
import { Isian, IsianPanjang, Kartu, KepalaHalaman, Kosong, Lencana, Pesan, Tombol } from "@/components/ui";
import { formatNoWa } from "@/lib/wa";
import { FormAsuransi } from "../form-asuransi";
import { hapusKontak, hapusPaket, jadikanUtama, simpanPaket, tambahKontak, tambahPaketStandar, ubahAktifKategori } from "../../actions";

export default async function DetailAsuransi({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [a] = await db.select().from(perusahaanAsuransi).where(eq(perusahaanAsuransi.id, id));
  if (!a) notFound();
  const kontak = await db
    .select()
    .from(kontakAsuransi)
    .where(eq(kontakAsuransi.perusahaanId, id))
    .orderBy(asc(kontakAsuransi.namaPic));
  const paket = await db
    .select()
    .from(kategoriPolis)
    .where(eq(kategoriPolis.perusahaanId, id))
    .orderBy(asc(kategoriPolis.urutan), asc(kategoriPolis.nama));
  const adaEmail = kontak.some((k) => k.email);
  const adaWa = kontak.some((k) => k.noWa);

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Master data", href: "/master" }, { label: "Asuransi", href: "/master/asuransi" }, { label: a.kode }]}
        judul={a.nama}
      />
      <TabMaster owner={adalahOwner((await wajibLogin("admin")).user)} />
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Kartu className="flex flex-col gap-4">
          <h2 className="text-base font-bold">Data perusahaan</h2>
          <FormAsuransi data={a} />
        </Kartu>

        <Kartu className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Kontak PIC</h2>
            <div className="flex gap-1">
              <Lencana nada={adaEmail ? "ok" : "warn"}>EMAIL {adaEmail ? "✓" : "BELUM ADA"}</Lencana>
              <Lencana nada={adaWa ? "ok" : "warn"}>WA {adaWa ? "✓" : "BELUM ADA"}</Lencana>
            </div>
          </div>
          {!(adaEmail && adaWa) && (
            <Pesan error="Tombol kirim data ke asuransi nonaktif sampai ada minimal satu email dan satu WhatsApp." />
          )}
          {kontak.length === 0 ? (
            <Kosong>Belum ada kontak.</Kosong>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {kontak.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="flex flex-col">
                    <span className="flex items-center gap-2 font-semibold">
                      {k.namaPic} {k.utama && <Lencana nada="brand">UTAMA</Lencana>}
                    </span>
                    <span className="text-[13px] text-ink-2">
                      {[k.jabatan, k.email, k.noWa && formatNoWa(k.noWa)].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {!k.utama && (
                      <form action={jadikanUtama.bind(null, id, k.id)}>
                        <button className="rounded-full px-3 py-1 text-[12px] font-semibold text-brand hover:bg-brand-soft">
                          Jadikan utama
                        </button>
                      </form>
                    )}
                    <form action={hapusKontak.bind(null, id, k.id)}>
                      <button className="rounded-full px-3 py-1 text-[12px] font-semibold text-bad hover:bg-bad-soft">Hapus</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-2xl bg-canvas p-4">
            <h3 className="mb-3 text-sm font-bold">Tambah kontak</h3>
            <FormAksi aksi={tambahKontak.bind(null, id)} tombol="Tambah kontak" resetSetelahOk varian="kedua">
              <div className="grid gap-3 sm:grid-cols-2">
                <Isian label="Nama PIC" name="namaPic" required />
                <Isian label="Jabatan" name="jabatan" placeholder="Underwriting" />
                <Isian label="Email" name="email" type="email" placeholder="uw@asuransi.co.id" />
                <Isian label="WhatsApp" name="noWa" inputMode="tel" placeholder="0812 …" />
              </div>
              <label className="flex items-center gap-2.5 text-sm text-ink-2">
                <input type="checkbox" name="utama" defaultChecked={kontak.length === 0} className="size-4 accent-brand" />
                Jadikan kontak utama
              </label>
            </FormAksi>
          </div>
        </Kartu>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="judul-paket">
        <div className="flex flex-wrap items-end justify-between gap-2 px-1">
          <div>
            <h2 id="judul-paket" className="text-lg font-bold">
              Paket coverage {a.nama}
            </h2>
            <p className="text-[13px] text-ink-3">Paket yang ditawarkan asuransi ini. Premi tiap paket diisi saat input penawaran.</p>
          </div>
          {paket.length === 0 && (
            <form action={tambahPaketStandar.bind(null, id)}>
              <Tombol varian="kedua">Tambah paket standar (Biasa, Plus, Complete)</Tombol>
            </form>
          )}
        </div>
        <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
          {paket.map((k) => (
            <Kartu key={k.id} className={`flex flex-col gap-3 ${k.aktif ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-extrabold">{k.nama}</h3>
                {!k.aktif && <Lencana>NONAKTIF</Lencana>}
              </div>
              <ul className="flex flex-col gap-1 text-[13px] text-ink-2">
                {k.cakupan.map((c) => (
                  <li key={c} className="flex gap-2">
                    <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-brand" />
                    {c}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-start gap-x-4 gap-y-2 border-t border-line pt-3">
                <details className="w-full">
                  <summary className="cursor-pointer text-[13px] font-semibold text-brand">Ubah</summary>
                  <div className="pt-3">
                    <FormAksi aksi={simpanPaket.bind(null, id, k.id)} tombol="Simpan paket" varian="kedua">
                      <div className="grid grid-cols-[1fr_80px] gap-3">
                        <Isian label="Nama paket" name="nama" defaultValue={k.nama} required />
                        <Isian label="Urutan" name="urutan" type="number" min={0} defaultValue={k.urutan} />
                      </div>
                      <IsianPanjang label="Risiko yang dijamin" name="cakupan" defaultValue={k.cakupan.join("\n")} hint="Satu baris per item." rows={6} />
                    </FormAksi>
                  </div>
                </details>
                <form action={ubahAktifKategori.bind(null, id, k.id, !k.aktif)}>
                  <button className="text-[13px] font-semibold text-ink-3 hover:text-ink">{k.aktif ? "Nonaktifkan" : "Aktifkan"}</button>
                </form>
                <form action={hapusPaket.bind(null, id, k.id)}>
                  <button className="text-[13px] font-semibold text-bad" title="Paket yang sudah dipakai di penawaran/polis hanya dinonaktifkan">
                    Hapus
                  </button>
                </form>
              </div>
            </Kartu>
          ))}
          <Kartu className="flex flex-col gap-3 border-dashed">
            <h3 className="text-base font-bold">Tambah paket</h3>
            <FormAksi aksi={simpanPaket.bind(null, id, null)} tombol="Tambah paket" resetSetelahOk varian="kedua">
              <div className="grid grid-cols-[1fr_80px] gap-3">
                <Isian label="Nama paket" name="nama" placeholder="Plus" required />
                <Isian label="Urutan" name="urutan" type="number" min={0} defaultValue={paket.length + 1} />
              </div>
              <IsianPanjang
                label="Risiko yang dijamin"
                name="cakupan"
                rows={5}
                placeholder={"Tabrakan, benturan, terperosok\nBanjir, badai, angin topan\nTuntutan pihak ke-3"}
                hint="Satu baris per item."
                required
              />
            </FormAksi>
          </Kartu>
        </div>
      </section>
    </>
  );
}
