import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import clsx from "clsx";
import { db } from "@/db";
import { dokumen, kategoriPolis, kendaraan, nasabah, perusahaanAsuransi, polis, rekening, statusHistory, trackerLink, users } from "@/db/schema";
import { LANGKAH_NASABAH, langkahNasabah, samarkanPlat } from "@/lib/domain/journey";
import { rupiah } from "@/lib/format";
import { linkWaMe } from "@/lib/wa";
import { UMUR_TRACKER_HARI } from "@/lib/pengajuan";
import { FormUnduh } from "./form-unduh";

export const metadata: Metadata = { title: "Status pengajuan asuransi", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const tgl = (d: Date | string | null | undefined) =>
  d
    ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(
        typeof d === "string" ? new Date(d + "T00:00:00") : d,
      )
    : null;

export default async function Tracker({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [b] = await db
    .select({ t: trackerLink, p: polis, n: nasabah, k: kendaraan, a: perusahaanAsuransi, s: users, r: rekening, kat: kategoriPolis })
    .from(trackerLink)
    .innerJoin(polis, eq(polis.id, trackerLink.polisId))
    .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
    .innerJoin(kendaraan, eq(kendaraan.id, polis.kendaraanId))
    .innerJoin(users, eq(users.id, polis.salesId))
    .leftJoin(perusahaanAsuransi, eq(perusahaanAsuransi.id, polis.perusahaanId))
    .leftJoin(rekening, eq(rekening.id, polis.rekeningPembayaranId))
    .leftJoin(kategoriPolis, eq(kategoriPolis.id, polis.kategoriId))
    .where(and(eq(trackerLink.token, token.toUpperCase()), isNull(trackerLink.dicabut)));
  if (!b) notFound();

  const riwayat = await db.select().from(statusHistory).where(eq(statusHistory.polisId, b.p.id)).orderBy(asc(statusHistory.waktu));
  const waktu = (s: string) => riwayat.find((r) => r.status === s)?.waktu;

  // Kedaluwarsa 90 hari setelah Selesai.
  const selesai = waktu("selesai");
  if (selesai && Date.now() - selesai.getTime() > UMUR_TRACKER_HARI * 86_400_000) notFound();

  await db
    .update(trackerLink)
    .set({ jumlahDilihat: sql`${trackerLink.jumlahDilihat} + 1`, terakhirDilihat: new Date() })
    .where(eq(trackerLink.id, b.t.id));

  const [pdf] = await db
    .select({ id: dokumen.id })
    .from(dokumen)
    .where(and(eq(dokumen.pemilikTipe, "polis"), eq(dokumen.pemilikId, b.p.id), eq(dokumen.jenis, "polis")))
    .limit(1);

  const s = b.p.statusPengajuan;
  const ditutup = s === "ditolak_asuransi" || s === "batal_nasabah";
  const langkah = langkahNasabah({ status: s, tglTransferNasabah: b.p.tglTransferNasabah });
  const sapa = b.n.tipe === "badan" ? b.n.nama : `Bapak/Ibu ${b.n.nama.split(" ")[0]}`;
  const namaDepanSales = b.s.nama.split(" ")[0];

  const tanggalLangkah = [
    riwayat[0]?.waktu,
    waktu("dikirim_ke_asuransi"),
    waktu("disetujui_nasabah"),
    waktu("polis_terbit"),
    waktu("lunas"),
    b.p.tglTransferNasabah,
    b.p.tglTransferNasabah ?? selesai,
  ];
  const catatan = [
    "Data dan dokumen kendaraan diterima",
    b.a ? `Diajukan ke ${b.a.nama}` : "Diajukan ke perusahaan asuransi",
    b.p.premiBruto ? `${b.kat ? `Paket ${b.kat.nama} · ` : ""}Premi ${rupiah(b.p.premiBruto)}` : "Menunggu penawaran terbaik",
    b.p.noPolis ? `No. polis ${b.p.noPolis}` : "Diterbitkan oleh asuransi",
    b.p.statusBayar === "lunas" ? `Lunas ${tgl(b.p.tglBayar)}` : b.p.batasBayar ? `Batas ${tgl(b.p.batasBayar)}` : "Transfer premi",
    b.p.cashbackNasabahRp ? `${rupiah(b.p.cashbackNasabahRp)} ke rekening Anda` : "Cashback ke rekening Anda",
    b.p.tglAkhir ? `Polis aktif s/d ${tgl(b.p.tglAkhir)}` : "Polis aktif",
  ];

  // Judul & tindakan untuk nasabah sesuai langkah
  let judul: React.ReactNode;
  let aksi: React.ReactNode = null;
  if (ditutup) {
    judul = <>Pengajuan Anda <span className="text-bad">{s === "batal_nasabah" ? "dibatalkan" : "belum disetujui"}</span></>;
  } else if (langkah <= 2) {
    judul = <>Pengajuan Anda <span className="text-brand">sedang diproses</span></>;
  } else if (langkah === 3) {
    judul = s === "penawaran_masuk" ? <>Penawaran <span className="text-brand">sudah masuk</span></> : <>Polis Anda <span className="text-brand">sedang diterbitkan</span></>;
  } else if (langkah <= 5 && b.p.statusBayar !== "lunas") {
    judul = <>Polis Anda <span className="text-brand">sudah terbit</span></>;
    if (b.r && b.p.premiBruto) {
      aksi = (
        <section className="flex flex-col gap-3 rounded-[20px] bg-ink p-5 text-white">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-[#A9B0C2]">YANG PERLU ANDA LAKUKAN</span>
          <span className="text-xl font-extrabold leading-tight tracking-tight">
            Transfer {rupiah(b.p.premiBruto)}
            {b.p.batasBayar && ` sebelum ${tgl(b.p.batasBayar)}`}
          </span>
          <dl className="flex flex-col gap-1.5 rounded-[14px] border border-[#232A3B] bg-[#161C2B] p-3.5 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-[#A9B0C2]">Bank</dt>
              <dd className="font-bold">{b.r.namaBank}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#A9B0C2]">No. rekening</dt>
              <dd className="font-bold tracking-wide">{b.r.noRekening}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#A9B0C2]">Atas nama</dt>
              <dd className="text-right font-bold">{b.r.atasNama}</dd>
            </div>
          </dl>
          {b.p.cashbackNasabahRp ? (
            <div className="flex justify-between gap-3 rounded-[14px] bg-[rgba(143,168,255,0.14)] px-3.5 py-3 text-[13px]">
              <span className="text-[#C9D5FF]">Cashback untuk Anda setelah lunas</span>
              <span className="whitespace-nowrap font-extrabold text-[#8FA8FF]">{rupiah(b.p.cashbackNasabahRp)}</span>
            </div>
          ) : null}
          <span className="text-xs text-[#A9B0C2]">Kirim bukti transfer dengan membalas pesan WhatsApp kami.</span>
        </section>
      );
    }
  } else if (langkah === 6) {
    judul = <>Pembayaran <span className="text-brand">sudah kami terima</span></>;
    if (b.p.cashbackNasabahRp)
      aksi = (
        <section className="rounded-[20px] bg-ink p-5 text-white">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-[#A9B0C2]">CASHBACK ANDA</span>
          <p className="mt-2 text-xl font-extrabold">{rupiah(b.p.cashbackNasabahRp)} segera kami transfer</p>
        </section>
      );
  } else {
    judul = <>Polis Anda <span className="text-ok">sudah aktif</span></>;
  }

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <div aria-hidden className="bg-dots pointer-events-none absolute inset-x-0 top-0 h-72" />
      <header className="relative flex flex-col gap-4 px-4 pb-2 pt-5">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-line bg-white py-1 pl-1 pr-3.5">
            <span className="flex size-[30px] items-center justify-center rounded-full bg-ink text-[11px] font-extrabold text-white">RA</span>
            <span className="text-[13px] font-bold">Rekap Asuransi</span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="self-start rounded-full border border-brand-edge bg-brand-soft px-3 py-1 text-[11px] font-semibold tracking-[0.08em] text-brand-ink">
            {b.p.polisSebelumnyaId ? "PERPANJANGAN" : "PENGAJUAN"} · {b.p.kode}
          </span>
          <p className="text-sm text-ink-2">Halo {sapa},</p>
          <h1 className="text-[30px] font-extrabold leading-[1.08] tracking-tight">{judul}</h1>
          <p className="text-sm text-ink-2">
            {b.k.merek} {b.k.model} {b.k.tahun} · {samarkanPlat(b.k.noPolisi)}
            {b.a && ` · ${b.a.nama}${b.kat && b.p.premiBruto ? ` ${b.kat.nama}` : ""}`}
          </p>
        </div>
      </header>

      <div className="relative flex flex-1 flex-col gap-3 px-4 pb-8 pt-2">
        {!ditutup && (
          <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-white p-[18px]">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-bold">
                Langkah {langkah} dari {LANGKAH_NASABAH.length}
              </span>
              <span className="text-[13px] font-bold text-brand-ink">{LANGKAH_NASABAH[langkah - 1]}</span>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {LANGKAH_NASABAH.map((l, i) => (
                <div
                  key={l}
                  className={clsx(
                    "h-2 rounded-full",
                    i + 1 < langkah || (langkah === 7 && i === 6) ? "bg-ink" : i + 1 === langkah ? "bg-brand" : "bg-line",
                  )}
                />
              ))}
            </div>
          </section>
        )}

        {aksi}

        {pdf && b.p.noPolis && (
          <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-white p-[18px]">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-10 shrink-0 items-center justify-center rounded-lg bg-bad text-[10px] font-extrabold text-white">PDF</span>
              <div>
                <div className="text-sm font-bold">Polis {b.p.noPolis}</div>
                <div className="text-xs text-ink-3">
                  {tgl(b.p.tglMulai)} – {tgl(b.p.tglAkhir)}
                </div>
              </div>
            </div>
            <FormUnduh token={b.t.token} />
          </section>
        )}

        <section className="flex flex-col rounded-[20px] border border-line bg-white p-[18px]">
          <h2 className="mb-2.5 text-base font-bold">Perjalanan pengajuan</h2>
          <ol className="flex flex-col">
            {LANGKAH_NASABAH.map((l, i) => {
              const k = i + 1;
              const done = k < langkah || (langkah === 7 && k === 7);
              const now = k === langkah && langkah !== 7 && !ditutup;
              const t = done || now ? tgl(tanggalLangkah[i]) : null;
              return (
                <li key={l} className="flex min-h-10 gap-3">
                  <div className="flex w-[22px] shrink-0 flex-col items-center">
                    {done ? (
                      <span className="flex size-[22px] items-center justify-center rounded-full bg-ink text-white">
                        <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                      </span>
                    ) : now ? (
                      <span className="size-[22px] rounded-full border-4 border-brand bg-white ring-4 ring-brand-soft" />
                    ) : (
                      <span className="size-[22px] rounded-full border-[1.5px] border-[#CBD0DC] bg-white" />
                    )}
                    {k < 7 && <span className={clsx("min-h-3.5 w-0.5 flex-1", done ? "bg-ink" : "bg-line")} />}
                  </div>
                  <div className="flex flex-col gap-0.5 pb-3">
                    <span className={clsx("text-sm", now ? "font-extrabold" : "font-semibold", !done && !now && "text-ink-4")}>{l}</span>
                    <span className="text-xs text-ink-3">{[t, done || now ? catatan[i] : null].filter(Boolean).join(" · ")}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="flex items-center gap-3 rounded-[20px] border border-line bg-white p-[18px]">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand-ink">
            {b.s.nama
              .split(" ")
              .slice(0, 2)
              .map((x) => x[0])
              .join("")
              .toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">{namaDepanSales}</div>
            <div className="text-xs text-ink-3">Sales yang menangani Anda</div>
          </div>
          <a
            href={linkWaMe(b.s.noWa, `Halo ${namaDepanSales}, saya ${b.n.nama} (${b.p.kode}).`)}
            className="inline-flex h-[42px] items-center rounded-full bg-wa px-4 text-[13px] font-semibold text-white"
          >
            Chat
          </a>
        </section>

        <p className="mx-2 mt-1 text-center text-[11px] leading-relaxed text-ink-4">
          Link ini khusus untuk {b.n.nama}. Mohon tidak dibagikan ke orang lain.
        </p>
      </div>
    </main>
  );
}
