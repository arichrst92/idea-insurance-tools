import Link from "next/link";
import { and, asc, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import clsx from "clsx";
import { db } from "@/db";
import { batchTransfer, jadwalBayar, rekening } from "@/db/schema";
import { perluVerifikasiUlang, wajibLogin } from "@/lib/auth/session";
import { FormAksi } from "@/components/form-aksi";
import { Isian, Kartu, KepalaHalaman, Kosong, Lencana } from "@/components/ui";
import { Angka } from "@/components/laporan";
import { LABEL_JENIS, sinkronJadwal } from "@/lib/jadwal-bayar";
import { posisiKas } from "@/lib/keuangan";
import { sesamaBca } from "@/lib/domain/jadwal";
import { akhirDariBulan, geserBulan, namaBulanId } from "@/lib/domain/periode";
import { tambahHari, waktuWib } from "@/lib/domain/perpanjangan";
import { rupiah } from "@/lib/format";
import { batalBatch, buatFileTransfer, tandaiDibayar } from "./actions";

export const metadata = { title: "Jadwal bayar" };

const NADA = { terjadwal: "netral", menunggu: "netral", siap: "brand", diekspor: "warn", dibayar: "ok" } as const;
const LABEL_STATUS = { terjadwal: "Terjadwal", menunggu: "Menunggu", siap: "Siap bayar", diekspor: "Sudah diekspor", dibayar: "Dibayar" } as const;
const WARNA_JENIS = { cashback_nasabah: "bg-brand", komisi: "bg-ok", gaji: "bg-warn" } as const;

export default async function HalamanJadwal({ searchParams }: { searchParams: Promise<{ bulan?: string }> }) {
  const sesi = await wajibLogin("admin");
  await sinkronJadwal();
  const hariIni = waktuWib().tanggal;
  const { bulan: bq } = await searchParams;
  const bulan = bq && /^\d{4}-\d{2}$/.test(bq) ? `${bq}-01` : hariIni.slice(0, 8) + "01";
  const akhir = akhirDariBulan(bulan);
  // Minggu ini: Senin–Minggu
  const dow = (new Date(hariIni + "T00:00:00Z").getUTCDay() + 6) % 7;
  const senin = tambahHari(hariIni, -dow);
  const minggu = tambahHari(senin, 6);

  const [rows, siap, batches, pos] = await Promise.all([
    db.select().from(jadwalBayar).where(and(gte(jadwalBayar.tglJadwal, bulan), lte(jadwalBayar.tglJadwal, akhir))).orderBy(asc(jadwalBayar.tglJadwal)),
    db
      .select({ j: jadwalBayar, r: rekening })
      .from(jadwalBayar)
      .leftJoin(rekening, eq(rekening.id, jadwalBayar.rekeningId))
      .where(and(eq(jadwalBayar.status, "siap"), isNull(jadwalBayar.batchId)))
      .orderBy(asc(jadwalBayar.tglJadwal)),
    db.select().from(batchTransfer).where(or(isNull(batchTransfer.dibayar), gte(batchTransfer.dibuat, new Date(Date.now() - 30 * 86_400_000)))).orderBy(desc(batchTransfer.dibuat)),
    posisiKas(),
  ]);
  // Yang harus dibayar s/d akhir minggu ini, termasuk tunggakan yang lewat jadwal.
  const mingguIni = await db.select().from(jadwalBayar).where(lte(jadwalBayar.tglJadwal, minggu));
  const harusMingguIni = mingguIni.filter((j) => j.status !== "dibayar").reduce((a, j) => a + j.nominal, 0);
  // Dana untuk membayar jadwal = saldo kas dikurangi premi yang wajib disetor ke asuransi.
  const tersedia = pos.saldo - pos.titipan.premi;
  const lewat = siap.filter((x) => x.j.tglJadwal < hariIni);

  // Kalender (Senin di kiri)
  const kosongAwal = (new Date(bulan + "T00:00:00Z").getUTCDay() + 6) % 7;
  const jmlHari = Number(akhir.slice(8));
  const sel: (string | null)[] = [...Array(kosongAwal).fill(null), ...Array.from({ length: jmlHari }, (_, i) => `${bulan.slice(0, 8)}${String(i + 1).padStart(2, "0")}`)];
  while (sel.length % 7) sel.push(null);
  const perHari = new Map<string, typeof rows>();
  for (const r of rows) perHari.set(r.tglJadwal, [...(perHari.get(r.tglJadwal) ?? []), r]);
  const perluOtp = perluVerifikasiUlang(sesi);

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Jadwal bayar" }]}
        judul="Jadwal"
        sorot="bayar"
        sub="Cashback nasabah (lunas + 3 hari kerja), komisi sales (Jumat setelah dana asuransi cair), dan gaji fulltime (tanggal gajian). Ekspor yang siap bayar ke CSV untuk KlikBCA Bisnis."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-uji="ringkasan-jadwal">
        <Angka label="Siap dibayar" nilai={rupiah(siap.reduce((a, x) => a + x.j.nominal, 0))} sub={`${siap.length} pembayaran${lewat.length ? ` · ${lewat.length} lewat jadwal` : ""}`} nada={lewat.length ? "warn" : undefined} />
        <Angka label="Harus dibayar s/d minggu ini" nilai={rupiah(harusMingguIni)} sub={`sampai ${minggu}, termasuk yang lewat jadwal`} />
        <Angka
          label="Dana tersedia"
          nilai={rupiah(tersedia)}
          sub={tersedia < harusMingguIni ? `Kurang ${rupiah(harusMingguIni - tersedia)} untuk jadwal minggu ini` : "Saldo kas − premi belum disetor"}
          nada={tersedia < harusMingguIni ? "bad" : "ok"}
        />
        <Angka label="Saldo bisa ditarik" nilai={rupiah(pos.bisaDitarik)} href="/keuangan" />
      </div>

      <Kartu className="flex flex-col gap-3 p-4 sm:p-5" data-uji="kalender">
        <div className="flex items-center justify-between">
          <Link href={`/jadwal-bayar?bulan=${geserBulan(bulan, -1).slice(0, 7)}`} className="rounded-full border border-line px-3 py-1 text-sm font-semibold">
            ←
          </Link>
          <h2 className="text-base font-bold">{namaBulanId(bulan)}</h2>
          <Link href={`/jadwal-bayar?bulan=${geserBulan(bulan, 1).slice(0, 7)}`} className="rounded-full border border-line px-3 py-1 text-sm font-semibold">
            →
          </Link>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-3">
          {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((h) => (
            <span key={h}>{h}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {sel.map((t, i) => {
            const isi = t ? (perHari.get(t) ?? []) : [];
            return (
              <div
                key={i}
                className={clsx(
                  "flex min-h-20 flex-col gap-1 rounded-xl border p-1.5 text-left",
                  !t ? "border-transparent" : t === hariIni ? "border-brand bg-brand-soft/40" : "border-line",
                )}
              >
                {t && <span className="text-[11px] font-bold text-ink-3">{Number(t.slice(8))}</span>}
                {(["cashback_nasabah", "komisi", "gaji"] as const).map((jenis) => {
                  const d = isi.filter((x) => x.jenis === jenis);
                  if (!d.length) return null;
                  const belum = d.filter((x) => x.status !== "dibayar");
                  const tunggu = d.every((x) => x.status === "menunggu" || x.status === "terjadwal");
                  return (
                    <span
                      key={jenis}
                      title={`${LABEL_JENIS[jenis]}: ${d.length} · ${rupiah(d.reduce((a, x) => a + x.nominal, 0))}`}
                      className={clsx(
                        "flex items-center gap-1 truncate rounded-md px-1 py-0.5 text-[10px] font-semibold",
                        belum.length === 0 ? "bg-ok-soft text-ok line-through decoration-1" : tunggu ? "border border-dashed border-line-2 text-ink-3" : "bg-canvas text-ink",
                      )}
                    >
                      <span className={clsx("size-1.5 shrink-0 rounded-full", WARNA_JENIS[jenis])} />
                      <span className="truncate">{rupiah(d.reduce((a, x) => a + x.nominal, 0)).replace("Rp ", "")}</span>
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 text-[12px] text-ink-3">
          {(Object.keys(LABEL_JENIS) as (keyof typeof LABEL_JENIS)[]).map((j) => (
            <span key={j} className="flex items-center gap-1.5">
              <span className={clsx("size-2 rounded-full", WARNA_JENIS[j])} /> {LABEL_JENIS[j]}
            </span>
          ))}
          <span>· garis putus-putus = menunggu syarat (mis. dana asuransi belum cair / estimasi gaji)</span>
        </div>
      </Kartu>

      <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Kartu className="flex flex-col gap-3" data-uji="siap-bayar">
          <h2 className="text-base font-bold">Siap dibayar</h2>
          {siap.length === 0 ? (
            <p className="text-sm text-ink-3">Tidak ada pembayaran yang siap.</p>
          ) : (
            <FormAksi aksi={buatFileTransfer} tombol="Buat file transfer (CSV)" className="flex flex-col gap-3">
              <ul className="flex flex-col divide-y divide-line text-sm">
                {siap.map(({ j, r }) => (
                  <li key={j.id}>
                    <label className="flex cursor-pointer items-start gap-3 py-2.5">
                      <input type="checkbox" name="jadwalId" value={j.id} defaultChecked={j.tglJadwal <= minggu && !!r} className="mt-1 size-4 accent-ink" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <b>{j.penerima}</b>
                          <span className="text-[12px] text-ink-3">{LABEL_JENIS[j.jenis]}</span>
                          {j.tglJadwal < hariIni && <Lencana nada="warn">LEWAT {j.tglJadwal}</Lencana>}
                        </span>
                        <span className="block text-[12px] text-ink-3">
                          {r ? `${r.namaBank} ${r.noRekening} · ${sesamaBca(r) ? "sesama BCA" : "antarbank"}` : <span className="text-bad">Rekening belum diisi</span>}
                          {" · "}jadwal {j.tglJadwal}
                        </span>
                      </span>
                      <span className="font-bold tabular-nums">{rupiah(j.nominal)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </FormAksi>
          )}
        </Kartu>

        <Kartu className="flex flex-col gap-3" data-uji="batch">
          <h2 className="text-base font-bold">File transfer</h2>
          {perluOtp && (
            <p className="rounded-xl bg-warn-soft px-3 py-2 text-[13px] text-warn">
              Menandai dibayar perlu verifikasi OTP ulang.{" "}
              <Link href="/verifikasi?lanjut=/jadwal-bayar" className="font-bold underline">
                Verifikasi
              </Link>
            </p>
          )}
          {batches.length === 0 ? (
            <Kosong>Belum ada file transfer.</Kosong>
          ) : (
            <ul className="flex flex-col gap-3">
              {batches.map((b) => (
                <li key={b.id} className="rounded-2xl border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm">
                      <b>{b.jenisFile === "sesama_bca" ? "Sesama BCA" : "Antarbank"}</b> · {b.jumlah} transfer · <b>{rupiah(b.total)}</b>
                    </span>
                    {b.dibayar ? <Lencana nada="ok">DIBAYAR</Lencana> : <Lencana nada="warn">{b.diekspor ? "DIEKSPOR" : "BELUM DIUNDUH"}</Lencana>}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px]">
                    <a href={`/api/jadwal-bayar/${b.id}`} download className="font-semibold text-brand">
                      Unduh CSV
                    </a>
                    {!b.dibayar && (
                      <form action={batalBatch.bind(null, b.id)}>
                        <button className="font-semibold text-ink-3 hover:text-bad">Batalkan</button>
                      </form>
                    )}
                  </div>
                  {!b.dibayar && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[13px] font-semibold text-ok">Tandai dibayar</summary>
                      <div className="pt-3">
                        <FormAksi aksi={tandaiDibayar.bind(null, b.id)} tombol="Sudah ditransfer" varian="kedua">
                          <Isian label="Tanggal transfer" name="tgl" type="date" defaultValue={hariIni} required />
                          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
                            Bukti dari KlikBCA (opsional)
                            <input
                              type="file"
                              name="bukti"
                              accept="image/*,application/pdf"
                              className="text-sm file:mr-3 file:h-9 file:rounded-full file:border-0 file:bg-brand-soft file:px-4 file:text-sm file:font-semibold file:text-brand-ink"
                            />
                          </label>
                        </FormAksi>
                      </div>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[12px] text-ink-3">
            Kolom CSV (template standar): no. rekening, nama penerima, [kode bank], nominal, berita. Cocokkan sekali dengan template transfer massal KlikBCA Bisnis kantor.
          </p>
        </Kartu>
      </div>

      <Kartu className="overflow-x-auto p-0">
        <h2 className="px-5 pt-4 text-base font-bold">Semua jadwal {namaBulanId(bulan)}</h2>
        <table className="mt-2 w-full min-w-[640px] text-sm" data-uji="tabel-jadwal">
          <thead className="text-left text-[11px] uppercase tracking-wider text-ink-3">
            <tr className="border-b border-line">
              <th className="px-5 py-2 font-semibold">Tanggal</th>
              <th className="px-3 py-2 font-semibold">Jenis</th>
              <th className="px-3 py-2 font-semibold">Penerima</th>
              <th className="px-3 py-2 text-right font-semibold">Nominal</th>
              <th className="px-5 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((j) => (
              <tr key={j.id} className="border-b border-line last:border-0">
                <td className="px-5 py-2.5 tabular-nums">{j.tglJadwal}</td>
                <td className="px-3 py-2.5">{LABEL_JENIS[j.jenis]}</td>
                <td className="px-3 py-2.5">
                  {j.polisId ? (
                    <Link href={`/pengajuan/${j.polisId}`} className="hover:text-brand">
                      {j.penerima}
                    </Link>
                  ) : (
                    j.penerima
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                  {rupiah(j.nominal)}
                  {j.estimasi && <span className="block text-[11px] text-ink-3">estimasi</span>}
                </td>
                <td className="px-5 py-2.5">
                  <Lencana nada={NADA[j.status]}>{LABEL_STATUS[j.status].toUpperCase()}</Lencana>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Kartu>
    </>
  );
}
