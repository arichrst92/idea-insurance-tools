import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { kontakAsuransi, perusahaanAsuransi } from "@/db/schema";
import { FormAksi } from "@/components/form-aksi";
import { TabMaster } from "@/app/(app)/master/tab-master";
import { Isian, Kartu, KepalaHalaman, Kosong, Lencana, Pesan } from "@/components/ui";
import { formatNoWa } from "@/lib/wa";
import { FormAsuransi } from "../form-asuransi";
import { hapusKontak, jadikanUtama, tambahKontak } from "../../actions";

export default async function DetailAsuransi({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [a] = await db.select().from(perusahaanAsuransi).where(eq(perusahaanAsuransi.id, id));
  if (!a) notFound();
  const kontak = await db
    .select()
    .from(kontakAsuransi)
    .where(eq(kontakAsuransi.perusahaanId, id))
    .orderBy(asc(kontakAsuransi.namaPic));
  const adaEmail = kontak.some((k) => k.email);
  const adaWa = kontak.some((k) => k.noWa);

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Master data", href: "/master" }, { label: "Asuransi", href: "/master/asuransi" }, { label: a.kode }]}
        judul={a.nama}
      />
      <TabMaster />
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
    </>
  );
}
