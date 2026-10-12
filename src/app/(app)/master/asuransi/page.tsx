import Link from "next/link";
import clsx from "clsx";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { kategoriPolis, kontakAsuransi, perusahaanAsuransi } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { adalahOwner } from "@/lib/peran";
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
      <TabMaster owner={adalahOwner((await wajibLogin("admin")).user)} />
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
                  <div className="flex flex-col gap-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden
                        className={clsx(
                          "flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft font-extrabold tracking-tight text-brand-ink",
                          monogram(a.nama, a.kode).length > 3 ? "text-[11px]" : "text-sm",
                        )}
                      >
                        {monogram(a.nama, a.kode)}
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <span className="font-bold leading-snug">{a.nama}</span>
                        <span className="text-xs text-ink-3">
                          {a.kode} · termin cashback {a.terminCashbackHari} hari
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
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

const KATA_UMUM = new Set(["PT", "ASURANSI", "UMUM", "INDONESIA", "TBK", "GENERAL", "INSURANCE", "UTAMA", "PRATAMA"]);

/** Inisial pendek untuk lencana logo: "PT Asuransi Sinar Mas" → "SM", "PT Asuransi MSIG Indonesia" → "MSIG". */
function monogram(nama: string, kode: string): string {
  const kata = nama
    .replace(/\(.*?\)/g, " ")
    .split(/[\s.,-]+/)
    .filter((k) => k && !KATA_UMUM.has(k.toUpperCase()));
  if (kata.length === 0) return kode.slice(0, 3).toUpperCase();
  if (kata.length === 1) {
    const k = kata[0];
    return (k === k.toUpperCase() && k.length <= 4 ? k : k.slice(0, 2)).toUpperCase();
  }
  return (kata[0][0] + kata[1][0]).toUpperCase();
}
