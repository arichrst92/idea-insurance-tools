import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { MessageCircle } from "lucide-react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { bagianPanduan, onboardingSales, onboardingSemua, tandaiPanduanDibuka } from "@/lib/panduan";
import {
  KETERANGAN_CABANG,
  KETERANGAN_LANGKAH,
  LANGKAH_ONBOARDING,
  PANDUAN_BAWAAN,
  URUTAN_JOURNEY,
  URUTAN_KONTAK,
  uraiPanduan,
} from "@/lib/domain/panduan";
import { LANGKAH } from "@/lib/domain/journey";
import { formatNoWa } from "@/lib/wa";
import { FormAksi } from "@/components/form-aksi";
import { Isian, IsianPanjang, Kartu, KepalaHalaman, Lencana } from "@/components/ui";
import { TeksPanduan } from "@/components/teks-panduan";
import { ChecklistOnboarding } from "@/components/checklist-onboarding";
import { centangOnboarding, pulihkanBagian, simpanBagian, tambahBagian } from "./actions";

export const metadata = { title: "Panduan" };
export const dynamic = "force-dynamic";

const PETUNJUK_FORMAT = "Format: baris kosong = paragraf baru · ## Sub judul · - poin · 1. langkah · **tebal** · *miring* · [teks](/pencairan) · ?? Pertanyaan (baris berikutnya = jawaban)";

type Item =
  | { jenis: "isi"; kode: string; judul: string; urutan: number; b: Awaited<ReturnType<typeof bagianPanduan>>[number] }
  | { jenis: "journey" | "kontak"; kode: string; judul: string; urutan: number };

export default async function HalamanPanduan() {
  const { user } = await wajibLogin();
  const admin = user.role === "admin";
  if (!admin) await tandaiPanduanDibuka(user.id);

  const [bagian, onboarding, progres, kontak] = await Promise.all([
    bagianPanduan(admin),
    admin ? null : onboardingSales(user.id),
    admin ? onboardingSemua() : null,
    db
      .select({ nama: users.nama, noWa: users.noWa })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.aktif, true)))
      .orderBy(asc(users.nama)),
  ]);

  const items: Item[] = [
    ...bagian.map((b) => ({ jenis: "isi" as const, kode: b.kode, judul: b.judul, urutan: b.urutan, b })),
    { jenis: "journey", kode: "journey", judul: "Journey 12 langkah", urutan: URUTAN_JOURNEY },
    { jenis: "kontak", kode: "kontak", judul: "Kontak admin", urutan: URUTAN_KONTAK },
  ];
  items.sort((a, b) => a.urutan - b.urutan);
  const sudah = (kode: string) => !onboarding || onboarding.langkah.some((l) => l.kode === kode && l.selesai);

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Panduan" }]}
        judul="Panduan"
        sorot="sales"
        sub={admin ? "Isi panduan yang dibaca sales. Ubah per bagian; perubahan langsung tampil." : "Semua yang perlu Anda tahu untuk mulai bekerja dan dibayar."}
      />

      {onboarding && <ChecklistOnboarding data={onboarding} />}
      {progres && <ProgresSales rows={progres} />}

      <nav aria-label="Isi panduan" className="overflow-x-auto">
        <ul className="inline-flex gap-1 rounded-full border border-line bg-white p-1 text-[13px] font-semibold">
          {items
            .filter((i) => i.jenis !== "isi" || i.b.aktif)
            .map((i) => (
              <li key={i.kode}>
                <a href={`#${i.kode}`} className="flex whitespace-nowrap rounded-full px-3.5 py-1.5 text-ink-2 hover:bg-canvas hover:text-ink">
                  {i.judul}
                </a>
              </li>
            ))}
        </ul>
      </nav>

      {items.map((i) => (
        <Kartu key={i.kode} id={i.kode} className="flex scroll-mt-6 flex-col gap-4" data-uji={`bagian-${i.kode}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold">{i.judul}</h2>
            {admin && (
              <div className="flex items-center gap-2">
                {i.jenis !== "isi" ? <Lencana>OTOMATIS · URUTAN {i.urutan}</Lencana> : <Lencana nada={i.b.aktif ? "ok" : "netral"}>{i.b.aktif ? `TAMPIL · URUTAN ${i.urutan}` : "DISEMBUNYIKAN"}</Lencana>}
              </div>
            )}
          </div>

          {i.jenis === "isi" && <TeksPanduan blok={uraiPanduan(i.b.isi)} />}
          {i.jenis === "journey" && <Journey />}
          {i.jenis === "kontak" && <Kontak kontak={kontak} />}

          {!admin && LANGKAH_ONBOARDING.some((l) => l.kode === i.kode && l.manual) && !sudah(i.kode) && (
            <form action={centangOnboarding.bind(null, i.kode)}>
              <button className="h-10 rounded-full bg-ink px-5 text-sm font-semibold text-white hover:bg-black" data-uji={`paham-${i.kode}`}>
                Saya sudah paham
              </button>
            </form>
          )}

          {admin && i.jenis === "isi" && (
            <details>
              <summary className="cursor-pointer text-[13px] font-semibold text-brand">Ubah bagian ini</summary>
              <div className="flex flex-col gap-3 pt-3">
                <FormAksi aksi={simpanBagian.bind(null, i.b.id)} tombol="Simpan bagian" varian="kedua">
                  <IsianBagian judul={i.b.judul} isi={i.b.isi} urutan={i.b.urutan} aktif={i.b.aktif} />
                </FormAksi>
                {PANDUAN_BAWAAN.some((x) => x.kode === i.kode) && (
                  <FormAksi aksi={pulihkanBagian.bind(null, i.b.id)} tombol="Kembalikan isi bawaan" varian="bahaya">
                    <p className="text-[13px] text-ink-3">Mengganti isi bagian ini dengan teks awal dari sistem.</p>
                  </FormAksi>
                )}
              </div>
            </details>
          )}
          {admin && i.jenis === "journey" && <p className="text-[13px] text-ink-3">Dibuat dari alur pengajuan di sistem, selalu sesuai aplikasi.</p>}
          {admin && i.jenis === "kontak" && <p className="text-[13px] text-ink-3">Diambil dari pengguna admin yang aktif.</p>}
        </Kartu>
      ))}

      {admin && (
        <Kartu className="flex flex-col gap-3" data-uji="tambah-bagian">
          <h2 className="text-lg font-bold">Tambah bagian</h2>
          <FormAksi aksi={tambahBagian} tombol="Tambah bagian" resetSetelahOk>
            <IsianBagian judul="" isi="" urutan={60} aktif />
          </FormAksi>
        </Kartu>
      )}
    </>
  );
}

function IsianBagian({ judul, isi, urutan, aktif }: { judul: string; isi: string; urutan: number; aktif: boolean }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <Isian label="Judul" name="judul" defaultValue={judul} required maxLength={80} />
        <Isian label="Urutan" name="urutan" type="number" min={0} max={9999} defaultValue={urutan} hint={`Journey = ${URUTAN_JOURNEY}`} />
      </div>
      <IsianPanjang label="Isi" name="isi" defaultValue={isi} required rows={12} hint={PETUNJUK_FORMAT} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="aktif" defaultChecked={aktif} className="size-4 accent-ink" /> Tampilkan ke sales
      </label>
    </>
  );
}

function Journey() {
  return (
    <div className="flex flex-col gap-4">
      <ol className="grid gap-2 sm:grid-cols-2" data-uji="journey-langkah">
        {LANGKAH.map((l, i) => (
          <li key={l.status} className="flex gap-3 rounded-2xl border border-line p-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand-ink">{i + 1}</span>
            <div className="flex flex-col gap-0.5">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {l.label} <Lencana nada={l.oleh.startsWith("Sales") ? "brand" : "netral"}>{l.oleh.toUpperCase()}</Lencana>
              </p>
              <p className="text-[13px] leading-relaxed text-ink-2">{KETERANGAN_LANGKAH[l.status]}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-1.5 rounded-2xl bg-canvas p-4 text-[13px] text-ink-2">
        <p className="font-semibold text-ink">Di luar 12 langkah</p>
        {KETERANGAN_CABANG.map((c) => (
          <p key={c.label}>
            <b className="text-ink">{c.label}:</b> {c.isi}
          </p>
        ))}
      </div>
    </div>
  );
}

function Kontak({ kontak }: { kontak: { nama: string; noWa: string }[] }) {
  return kontak.length === 0 ? (
    <p className="text-sm text-ink-3">Belum ada admin aktif.</p>
  ) : (
    <ul className="flex flex-col gap-2" data-uji="kontak-admin">
      {kontak.map((k) => (
        <li key={k.noWa} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
          <span className="text-sm">
            <b>{k.nama}</b> <span className="text-ink-3">· {formatNoWa(k.noWa)}</span>
          </span>
          <a
            href={`https://wa.me/${k.noWa}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-wa px-4 text-[13px] font-semibold text-white hover:brightness-110"
          >
            <MessageCircle className="size-4" aria-hidden /> Chat WhatsApp
          </a>
        </li>
      ))}
    </ul>
  );
}

function ProgresSales({ rows }: { rows: Awaited<ReturnType<typeof onboardingSemua>> }) {
  return (
    <Kartu className="flex flex-col gap-3" data-uji="progres-onboarding">
      <h2 className="text-lg font-bold">Langkah awal sales</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">Belum ada sales aktif.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-wide text-ink-3">
                <th className="py-2 pr-3 font-semibold">Sales</th>
                {LANGKAH_ONBOARDING.map((l, i) => (
                  <th key={l.kode} className="px-1 py-2 text-center font-semibold" title={l.judul}>
                    {i + 1}
                  </th>
                ))}
                <th className="py-2 pl-3 text-right font-semibold">Progres</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((s) => (
                <tr key={s.id} data-uji={`progres-${s.nama}`}>
                  <td className="py-2.5 pr-3">
                    <Link href={`/sales/${s.id}`} className="font-semibold hover:text-brand">
                      {s.nama}
                    </Link>
                    {!s.dibuka && <span className="ml-2 text-[12px] text-ink-3">belum membuka panduan</span>}
                  </td>
                  {s.langkah.map((l) => (
                    <td key={l.kode} className="px-1 py-2.5 text-center" title={l.judul}>
                      {l.selesai ? <span className="text-ok">✓</span> : <span className="text-ink-4">·</span>}
                    </td>
                  ))}
                  <td className="py-2.5 pl-3 text-right font-semibold tabular-nums">
                    {s.selesai}/{s.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[12px] text-ink-3">{LANGKAH_ONBOARDING.map((l, i) => `${i + 1} ${l.judul}`).join(" · ")}</p>
    </Kartu>
  );
}
