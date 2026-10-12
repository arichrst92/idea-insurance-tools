import Link from "next/link";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import clsx from "clsx";
import { db } from "@/db";
import { kasKantor, polis, users } from "@/db/schema";
import { perluVerifikasiUlang, wajibLogin } from "@/lib/auth/session";
import { FormAksi } from "@/components/form-aksi";
import { IsianRupiah } from "@/components/isian-rupiah";
import { Isian, Kartu, KepalaHalaman, Kosong, Pilihan } from "@/components/ui";
import { Angka, FilterPeriode } from "@/components/laporan";
import { KATEGORI_KAS, arusKasBulanan, posisiKas, saldoKas, type KategoriKas } from "@/lib/keuangan";
import { filterDari, type SP } from "../laporan/util";
import { geserBulan, namaBulanId } from "@/lib/domain/periode";
import { waktuWib } from "@/lib/domain/perpanjangan";
import { rupiah } from "@/lib/format";
import { TombolPdf } from "@/components/tombol-ekspor";
import { ChartSvg } from "@/components/chart-svg";
import { svgBar, WARNA } from "@/lib/chart";
import { entriManual, hapusEntri, tarikDana } from "./actions";

export const metadata = { title: "Keuangan" };

const kelasFile =
  "w-full text-sm text-ink-2 file:mr-3 file:h-9 file:rounded-full file:border-0 file:bg-brand-soft file:px-4 file:text-sm file:font-semibold file:text-brand-ink";

export default async function HalamanKeuangan({ searchParams }: { searchParams: Promise<SP & { kategori?: string }> }) {
  const sesi = await wajibLogin("owner");
  const sp = await searchParams;
  const { p } = filterDari(sp);
  const hariIni = waktuWib().tanggal;
  const kategori = sp.kategori && sp.kategori in KATEGORI_KAS ? (sp.kategori as KategoriKas) : undefined;
  const awal6 = geserBulan(hariIni.slice(0, 7) + "-01", -5);

  const [pos, awalPeriode, mutasi, arus] = await Promise.all([
    posisiKas(),
    saldoKas(geserTanggal(p.dari, -1)),
    db
      .select({ k: kasKantor, kode: polis.kode, noPolis: polis.noPolis, oleh: users.nama })
      .from(kasKantor)
      .leftJoin(polis, eq(polis.id, kasKantor.polisId))
      .leftJoin(users, eq(users.id, kasKantor.dibuatOleh))
      .where(and(gte(kasKantor.tanggal, p.dari), lte(kasKantor.tanggal, p.sampai), kategori ? eq(kasKantor.kategori, kategori) : undefined))
      .orderBy(desc(kasKantor.tanggal), desc(kasKantor.dibuat))
      .limit(500),
    arusKasBulanan(awal6, hariIni),
  ]);
  const masuk = mutasi.filter((m) => m.k.arah === "masuk").reduce((a, m) => a + m.k.nominal, 0);
  const keluar = mutasi.filter((m) => m.k.arah === "keluar").reduce((a, m) => a + m.k.nominal, 0);
  const bulan6 = Array.from({ length: 6 }, (_, i) => geserBulan(awal6, i).slice(0, 7));
  const svgArus = svgBar({
    kategori: bulan6.map((b) => namaBulanId(b + "-01").slice(0, 3)),
    seri: [
      { nama: "Masuk", data: bulan6.map((b) => arus.find((x) => x.bulan === b)?.masuk ?? 0), warna: WARNA.ok },
      { nama: "Keluar", data: bulan6.map((b) => arus.find((x) => x.bulan === b)?.keluar ?? 0), warna: WARNA.bad },
    ],
    lebar: 760,
    tinggi: 240,
  });
  const perluOtp = perluVerifikasiUlang(sesi);
  const manual = (Object.keys(KATEGORI_KAS) as KategoriKas[]).filter((k) => !KATEGORI_KAS[k].otomatis && k !== "penarikan");

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Keuangan" }]}
        judul="Buku kas"
        sorot="kantor"
        sub="Premi masuk, setor premi, dana asuransi, transfer cashback & komisi, dan gaji tercatat otomatis. Entri lain diinput manual."
        aksi={<TombolPdf jenis="keuangan" filter={{ periode: sp.periode, dari: sp.dari, sampai: sp.sampai }} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-uji="posisi-kas">
        <Angka label="Saldo kas" nilai={rupiah(pos.saldo)} sub={`Masuk ${rupiah(pos.masuk)} · keluar ${rupiah(pos.keluar)}`} />
        <Angka
          label="Dana titipan"
          nilai={rupiah(pos.titipan.total)}
          sub={`Premi belum disetor ${rupiah(pos.titipan.premi)} · cashback ${rupiah(pos.titipan.cashback)} · komisi ${rupiah(pos.titipan.komisi)}`}
          nada="warn"
        />
        <Angka label="Saldo bisa ditarik" nilai={rupiah(pos.bisaDitarik)} sub="Saldo kas − dana titipan" nada="ok" />
        <Angka label={`Mutasi ${p.label}`} nilai={rupiah(masuk - keluar)} sub={`Masuk ${rupiah(masuk)} · keluar ${rupiah(keluar)}`} />
      </div>

      <Kartu className="flex flex-col gap-3" data-uji="arus-kas">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">Arus kas 6 bulan</h2>
        </div>
        <ChartSvg svg={svgArus} label="Chart arus kas masuk dan keluar per bulan" />
      </Kartu>

      <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-3">
          <FilterPeriode
            aksi="/keuangan"
            p={p}
            nilai={{}}
            tampilkan={[]}
            ekstra={
              <select name="kategori" defaultValue={kategori ?? ""} aria-label="Kategori" className="h-10 rounded-full border border-line-2 bg-white px-3.5 text-sm font-semibold">
                <option value="">Semua kategori</option>
                {(Object.keys(KATEGORI_KAS) as KategoriKas[]).map((k) => (
                  <option key={k} value={k}>
                    {KATEGORI_KAS[k].label}
                  </option>
                ))}
              </select>
            }
          />
          {mutasi.length === 0 ? (
            <Kosong>Belum ada mutasi di periode ini.</Kosong>
          ) : (
            <Kartu className="overflow-x-auto p-0">
              <table className="w-full min-w-[680px] text-sm" data-uji="buku-kas">
                <thead className="text-left text-[11px] uppercase tracking-wider text-ink-3">
                  <tr className="border-b border-line">
                    <th className="px-5 py-3 font-semibold">Tanggal</th>
                    <th className="px-3 py-3 font-semibold">Kategori</th>
                    <th className="px-3 py-3 font-semibold">Keterangan</th>
                    <th className="px-3 py-3 text-right font-semibold">Masuk</th>
                    <th className="px-5 py-3 text-right font-semibold">Keluar</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-line bg-canvas text-[13px]">
                    <td className="px-5 py-2 text-ink-3" colSpan={3}>
                      Saldo awal periode
                    </td>
                    <td className="px-5 py-2 text-right font-semibold tabular-nums" colSpan={2}>
                      {rupiah(awalPeriode.saldo)}
                    </td>
                  </tr>
                  {mutasi.map(({ k, kode, noPolis, oleh }) => (
                    <tr key={k.id} className="border-b border-line last:border-0">
                      <td className="whitespace-nowrap px-5 py-2.5 tabular-nums">{k.tanggal}</td>
                      <td className="px-3 py-2.5">
                        {KATEGORI_KAS[k.kategori as KategoriKas]?.label ?? k.kategori}
                        <div className="text-[11px] uppercase tracking-wider text-ink-3">{k.sumber}</div>
                      </td>
                      <td className="px-3 py-2.5 text-ink-2">
                        {k.polisId ? (
                          <Link href={`/pengajuan/${k.polisId}`} className="hover:text-brand">
                            {noPolis ?? kode}
                          </Link>
                        ) : (
                          k.keterangan
                        )}
                        <div className="flex gap-2 text-[12px] text-ink-3">
                          {oleh}
                          {k.buktiDokumenId && (
                            <a href={`/api/dokumen/${k.buktiDokumenId}`} target="_blank" rel="noreferrer" className="font-semibold text-brand">
                              bukti
                            </a>
                          )}
                          {k.sumber === "manual" && (
                            <form action={hapusEntri.bind(null, k.id)}>
                              <button className="font-semibold text-bad">hapus</button>
                            </form>
                          )}
                        </div>
                      </td>
                      <td className={clsx("whitespace-nowrap px-3 py-2.5 text-right tabular-nums", k.arah === "masuk" && "font-semibold text-ok")}>
                        {k.arah === "masuk" ? rupiah(k.nominal) : ""}
                      </td>
                      <td className={clsx("whitespace-nowrap px-5 py-2.5 text-right tabular-nums", k.arah === "keluar" && "font-semibold text-bad")}>
                        {k.arah === "keluar" ? rupiah(k.nominal) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Kartu>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Kartu className="flex flex-col gap-3" data-uji="form-penarikan">
            <h2 className="text-base font-bold">Penarikan dana kantor</h2>
            <p className="text-[13px] text-ink-3">
              Maksimal <b className="text-ink">{rupiah(pos.bisaDitarik)}</b>. Dana titipan nasabah, asuransi, dan sales tidak bisa ditarik.
            </p>
            {perluOtp && (
              <p className="rounded-xl bg-warn-soft px-3 py-2 text-[13px] text-warn">
                Penarikan perlu verifikasi OTP ulang.{" "}
                <Link href="/verifikasi?lanjut=/keuangan" className="font-bold underline">
                  Verifikasi
                </Link>
              </p>
            )}
            <FormAksi aksi={tarikDana} tombol="Catat penarikan" varian="bahaya" resetSetelahOk>
              <div className="grid grid-cols-2 gap-3">
                <Isian label="Tanggal" name="tanggal" type="date" defaultValue={hariIni} required />
                <IsianRupiah label="Nominal" name="nominal" required />
              </div>
              <Isian label="Keperluan" name="keterangan" placeholder="Mis. bagi hasil pemilik Oktober" required />
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
                Bukti transfer penarikan
                <input type="file" name="bukti" required accept="image/*,application/pdf" className={kelasFile} />
              </label>
            </FormAksi>
          </Kartu>
          <Kartu className="flex flex-col gap-3">
            <h2 className="text-base font-bold">Entri manual</h2>
            <FormAksi aksi={entriManual} tombol="Simpan entri" varian="kedua" resetSetelahOk>
              <Pilihan label="Kategori" name="kategori" defaultValue="operasional">
                {manual.map((k) => (
                  <option key={k} value={k}>
                    {KATEGORI_KAS[k].label} ({KATEGORI_KAS[k].arah})
                  </option>
                ))}
              </Pilihan>
              <div className="grid grid-cols-2 gap-3">
                <Isian label="Tanggal" name="tanggal" type="date" defaultValue={hariIni} required />
                <IsianRupiah label="Nominal" name="nominal" required />
              </div>
              <Isian label="Keterangan" name="keterangan" required />
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
                Bukti (opsional)
                <input type="file" name="bukti" accept="image/*,application/pdf" className={kelasFile} />
              </label>
            </FormAksi>
          </Kartu>
        </div>
      </div>
    </>
  );
}

function geserTanggal(t: string, n: number) {
  return new Date(Date.parse(t + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
}
