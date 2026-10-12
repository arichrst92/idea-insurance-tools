import { wajibLogin } from "@/lib/auth/session";
import { Kartu, KepalaHalaman } from "@/components/ui";
import { Angka, FilterPeriode, TabelBar, type Kolom } from "@/components/laporan";
import { filterDari, type SP } from "./util";
import { agregasi, belumLunas, pilihanFilter, polisLunas, renewal, ringkasKlaim, total, type Agregat } from "@/lib/laporan";
import { angka, persen, rupiah } from "@/lib/format";
import { TombolPdf } from "@/components/tombol-ekspor";
import { ChartSvg } from "@/components/chart-svg";
import { svgBar, WARNA } from "@/lib/chart";
import { geserBulan, namaBulanId } from "@/lib/domain/periode";
import { adalahOwner, adalahStaf } from "@/lib/peran";

export const metadata = { title: "Laporan" };


export default async function HalamanLaporan({ searchParams }: { searchParams: Promise<SP> }) {
  const { user } = await wajibLogin();
  const admin = adalahStaf(user);
  const owner = adalahOwner(user);
  const sp = await searchParams;
  const { p, f } = filterDari(sp);

  const awal6 = geserBulan(f.sampai.slice(0, 8) + "01", -5);
  const [rows, rows6, ren, kl, pilihan] = await Promise.all([
    polisLunas(user, f),
    polisLunas(user, { ...f, dari: awal6 < f.dari ? awal6 : f.dari }),
    renewal(user, f),
    ringkasKlaim(user, f),
    pilihanFilter(admin),
  ]);
  const bl = await belumLunas(user, f);
  const bulan6 = Array.from({ length: 6 }, (_, i) => geserBulan(awal6, i));
  const premi6 = agregasi(rows6, (r) => [r.tglLunas.slice(0, 7), r.tglLunas.slice(0, 7)], admin);
  const svgPremi = svgBar({
    kategori: bulan6.map((b) => namaBulanId(b).slice(0, 3)),
    seri: [{ nama: "Premi", data: bulan6.map((b) => premi6.find((x) => x.kunci === b.slice(0, 7))?.premi ?? 0), warna: WARNA.brand }],
    lebar: 760,
    tinggi: 240,
    label: true,
  });
  const t = total(rows, admin);
  const perSales = agregasi(rows, (r) => [r.salesId, r.sales], admin);
  const perAsuransi = agregasi(rows, (r) => [r.asuransi, r.asuransi], admin);
  const perPaket = agregasi(rows, (r) => [`${r.asuransi} · ${r.paket}`, `${r.asuransi} · ${r.paket}`], admin);
  const perBulan = agregasi(rows, (r) => [r.tglLunas.slice(0, 7), r.tglLunas.slice(0, 7)], admin).sort((a, b) => a.kunci.localeCompare(b.kunci));
  const baru = rows.filter((r) => !r.perpanjangan).length;
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();

  const kolom: Kolom<Agregat>[] = [
    { label: "Polis", nilai: (r) => angka(r.polis), kanan: true },
    { label: "Premi", nilai: (r) => rupiah(r.premi), kanan: true },
    ...(admin ? [{ label: "Cashback asuransi", nilai: (r: Agregat) => rupiah(r.cashbackTotal), kanan: true }] : []),
    { label: "Cashback nasabah", nilai: (r) => rupiah(r.cashbackNasabah), kanan: true },
    ...(owner ? [{ label: "Bagian kantor", nilai: (r: Agregat) => rupiah(r.bagianKantor), kanan: true }] : []),
    { label: admin ? "Komisi sales" : "Komisi Anda", nilai: (r) => rupiah(r.komisi), kanan: true },
    { label: "dari event", nilai: (r) => (r.komisiEvent ? rupiah(r.komisiEvent) : "–"), kanan: true, className: "text-warn" },
  ];
  const bar = (label: (r: Agregat) => string) => ({ nilai: (r: Agregat) => r.premi, label });

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Laporan" }]}
        judul="Laporan"
        sorot={admin ? "penjualan" : "saya"}
        sub="Penjualan dihitung pada tanggal lunas (premi sudah dibayar nasabah) — acuan yang sama untuk target & gaji sales. Polis terbit yang belum dibayar belum terhitung."
        aksi={
          <>
            <a href={`/api/laporan/excel?${qs}`} download className="inline-flex h-10 items-center rounded-full border border-line-2 bg-white px-5 text-sm font-semibold hover:border-ink-4">
              Ekspor Excel
            </a>
            <TombolPdf jenis="laporan" filter={{ ...sp }} />
          </>
        }
      />
      <FilterPeriode aksi="/laporan" p={p} nilai={sp} pilihan={pilihan} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-uji="ringkasan-laporan">
        <Angka label="Polis lunas" nilai={angka(t?.polis ?? 0)} sub={`${baru} baru · ${(t?.polis ?? 0) - baru} perpanjangan`} />
        <Angka label="Premi" nilai={rupiah(t?.premi ?? 0)} />
        {admin ? (
          <Angka label="Cashback asuransi" nilai={rupiah(t?.cashbackTotal ?? 0)} sub={owner ? `Kantor ${rupiah(t?.bagianKantor ?? 0)}` : undefined} />
        ) : (
          <Angka label="Cashback nasabah" nilai={rupiah(t?.cashbackNasabah ?? 0)} />
        )}
        <Angka label={admin ? "Komisi sales" : "Komisi Anda"} nilai={rupiah(t?.komisi ?? 0)} sub={t?.komisiEvent ? `termasuk bonus event ${rupiah(t.komisiEvent)}` : undefined} />
        <Angka
          label="Renewal rate"
          nilai={persen(ren.rate)}
          sub={`${ren.diperpanjang} dari ${ren.jatuhTempo} jatuh tempo · ${ren.proses} diproses`}
          href="/perpanjangan"
          nada={ren.jatuhTempo && ren.rate < 50 ? "warn" : undefined}
        />
        <Angka label="Klaim" nilai={angka(kl.total)} sub={`${kl.diproses} diproses · ${kl.selesai} selesai · ${kl.ditolak} ditolak`} href="/klaim?tab=semua" />
        <Angka label="Rata-rata premi" nilai={rupiah(t ? Math.round(t.premi / t.polis) : 0)} />
        <Angka label="Belum lunas" nilai={rupiah(bl.premi)} sub={`${bl.n} polis terbit menunggu pembayaran — belum dihitung`} href="/pengajuan?tab=giliran" nada={bl.n ? "warn" : undefined} />
      </div>

      <Kartu className="flex flex-col gap-2" data-uji="chart-premi">
        <h2 className="text-base font-bold">Premi per bulan · 6 bulan s/d {namaBulanId(f.sampai)}</h2>
        <ChartSvg svg={svgPremi} label="Chart premi per bulan" />
      </Kartu>
      {perBulan.length > 1 && <TabelBar judul="Per bulan" baris={perBulan} kolom={kolom} bar={bar((r) => r.label)} uji="per-bulan" />}
      {admin && <TabelBar judul="Per sales" baris={perSales} kolom={kolom} bar={bar((r) => r.label)} uji="per-sales" />}
      <div className="grid gap-4 xl:grid-cols-2">
        <TabelBar judul="Per asuransi" baris={perAsuransi} kolom={kolom.slice(0, 2)} bar={bar((r) => r.label)} uji="per-asuransi" />
        <TabelBar judul="Per paket" baris={perPaket} kolom={kolom.slice(0, 2)} bar={bar((r) => r.label)} uji="per-paket" />
      </div>
      {admin && ren.perSales.length > 0 && (
        <TabelBar
          judul="Renewal per sales"
          baris={ren.perSales}
          kolom={[
            { label: "Jatuh tempo", nilai: (r) => r.jatuhTempo, kanan: true },
            { label: "Diperpanjang", nilai: (r) => r.diperpanjang, kanan: true },
            { label: "Diproses", nilai: (r) => r.proses, kanan: true },
            { label: "Belum", nilai: (r) => r.belum, kanan: true },
            { label: "Rate", nilai: (r) => persen(r.rate), kanan: true },
          ]}
          bar={{ nilai: (r) => r.rate, label: (r) => r.sales }}
        />
      )}
      {kl.perAsuransi.length > 0 && (
        <TabelBar
          judul="Klaim per asuransi"
          baris={kl.perAsuransi}
          kolom={[
            { label: "Diproses", nilai: (r) => r.diproses, kanan: true },
            { label: "Selesai", nilai: (r) => r.selesai, kanan: true },
            { label: "Ditolak", nilai: (r) => r.ditolak, kanan: true },
          ]}
          bar={{ nilai: (r) => r.diproses + r.selesai + r.ditolak, label: (r) => r.asuransi }}
        />
      )}
    </>
  );
}
