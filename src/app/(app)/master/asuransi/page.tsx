import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { kategoriPolis, kontakAsuransi, perusahaanAsuransi } from "@/db/schema";
import { TabMaster } from "@/app/(app)/master/tab-master";
import { Kartu, KepalaHalaman, Kosong, Lencana, TautanTombol } from "@/components/ui";
import { formatNoWa } from "@/lib/wa";

export const metadata = { title: "Master asuransi" };

export default async function DaftarAsuransi() {
  const [daftar, kontak, paket] = await Promise.all([
    db.select().from(perusahaanAsuransi).orderBy(asc(perusahaanAsuransi.nama)),
    db.select().from(kontakAsuransi),
    db.select().from(kategoriPolis).orderBy(asc(kategoriPolis.urutan)),
  ]);

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Master data", href: "/master" }, { label: "Asuransi" }]}
        judul="Perusahaan"
        sorot="asuransi"
        sub="Email underwriting dan WhatsApp PIC dipakai untuk mengirim data pengajuan; paket coverage diatur per asuransi."
        aksi={<TautanTombol href="/master/asuransi/baru">Tambah asuransi</TautanTombol>}
      />
      <TabMaster />
      {daftar.length === 0 ? (
        <Kosong>Belum ada perusahaan asuransi.</Kosong>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {daftar.map((a) => {
            const k = kontak.filter((x) => x.perusahaanId === a.id);
            const utama = k.find((x) => x.utama) ?? k[0];
            const lengkap = k.some((x) => x.email) && k.some((x) => x.noWa);
            return (
              <Link key={a.id} href={`/master/asuransi/${a.id}`} className="block">
                <Kartu className="flex h-full flex-col gap-3 transition hover:border-ink-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-xs font-extrabold text-brand-ink">
                        {a.kode}
                      </span>
                      <div className="flex flex-col">
                        <span className="font-bold">{a.nama}</span>
                        <span className="text-xs text-ink-3">Termin cashback {a.terminCashbackHari} hari</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {!a.aktif && <Lencana>NONAKTIF</Lencana>}
                      {lengkap ? <Lencana nada="ok">KONTAK LENGKAP</Lencana> : <Lencana nada="warn">KONTAK BELUM LENGKAP</Lencana>}
                    </div>
                  </div>
                  {utama ? (
                    <p className="text-[13px] text-ink-2">
                      <b className="text-ink">{utama.namaPic}</b>
                      {utama.email && <> · {utama.email}</>}
                      {utama.noWa && <> · {formatNoWa(utama.noWa)}</>}
                    </p>
                  ) : (
                    <p className="text-[13px] text-ink-3">Belum ada kontak PIC.</p>
                  )}
                  {(() => {
                    const pk = paket.filter((x) => x.perusahaanId === a.id && x.aktif);
                    return pk.length ? (
                      <div className="flex flex-wrap gap-1">
                        {pk.map((x) => (
                          <Lencana key={x.id} nada="brand">
                            {x.nama.toUpperCase()}
                          </Lencana>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[13px] text-warn">Belum ada paket coverage.</p>
                    );
                  })()}
                </Kartu>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
