import { wajibLogin } from "@/lib/auth/session";
import { KepalaHalaman } from "@/components/ui";
import { Angka, FilterPeriode, TabelBar, type Kolom } from "@/components/laporan";
import { filterDari, rasio, type SP } from "./util";
import { agregasi, pilihanFilter, polisTerbit, renewal, ringkasKlaim, total, type Agregat } from "@/lib/laporan";
import { angka, persen, rupiah } from "@/lib/format";

export const metadata = { title: "Laporan" };


export default async function HalamanLaporan({ searchParams }: { searchParams: Promise<SP> }) {
  const { user } = await wajibLogin();
  const admin = user.role === "admin";
  const sp = await searchParams;
  const { p, f } = filterDari(sp);

  const [rows, ren, kl, pilihan] = await Promise.all([polisTerbit(user, f), renewal(user, f), ringkasKlaim(user, f), pilihanFilter(admin)]);
  const t = total(rows, admin);
  const perSales = agregasi(rows, (r) => [r.salesId, r.sales], admin);
  const perAsuransi = agregasi(rows, (r) => [r.asuransi, r.asuransi], admin);
  const perPaket = agregasi(rows, (r) => [`${r.asuransi} · ${r.paket}`, `${r.asuransi} · ${r.paket}`], admin);
  const perBulan = agregasi(rows, (r) => [r.tglTerbit.slice(0, 7), r.tglTerbit.slice(0, 7)], admin).sort((a, b) => a.kunci.localeCompare(b.kunci));
  const baru = rows.filter((r) => !r.perpanjangan).length;
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();

  const kolom: Kolom<Agregat>[] = [
    { label: "Polis", nilai: (r) => angka(r.polis), kanan: true },
    { label: "Premi", nilai: (r) => rupiah(r.premi), kanan: true },
    ...(admin ? [{ label: "Cashback asuransi", nilai: (r: Agregat) => rupiah(r.cashbackTotal), kanan: true }] : []),
    { label: "Cashback nasabah", nilai: (r) => rupiah(r.cashbackNasabah), kanan: true },
    ...(admin ? [{ label: "Bagian kantor", nilai: (r: Agregat) => rupiah(r.bagianKantor), kanan: true }] : []),
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
        sub="Penjualan dihitung pada tanggal polis terbit. Pengajuan batal atau salah input tidak terhitung."
        aksi={
          <a href={`/api/laporan/excel?${qs}`} className="inline-flex h-10 items-center rounded-full border border-line-2 bg-white px-5 text-sm font-semibold hover:border-ink-4">
            Ekspor Excel
          </a>
        }
      />
      <FilterPeriode aksi="/laporan" p={p} nilai={sp} pilihan={pilihan} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-uji="ringkasan-laporan">
        <Angka label="Polis terbit" nilai={angka(t?.polis ?? 0)} sub={`${baru} baru · ${(t?.polis ?? 0) - baru} perpanjangan`} />
        <Angka label="Premi" nilai={rupiah(t?.premi ?? 0)} />
        {admin ? (
          <Angka label="Cashback asuransi" nilai={rupiah(t?.cashbackTotal ?? 0)} sub={`Kantor ${rupiah(t?.bagianKantor ?? 0)}`} />
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
        <Angka label="Lunas" nilai={persen(rasio(rows.filter((r) => r.lunas).length, rows.length))} sub={`${rows.filter((r) => !r.lunas).length} polis belum dibayar`} />
      </div>

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
