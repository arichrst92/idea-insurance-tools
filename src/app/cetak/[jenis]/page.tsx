import { notFound } from "next/navigation";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { ReactNode } from "react";
import { db } from "@/db";
import { exportJobs, kasKantor, polis, users } from "@/db/schema";
import { cekTokenCetak } from "@/lib/ekspor/token";
import { JENIS_EKSPOR, type JenisEkspor } from "@/lib/ekspor/antrian";
import { agregasi, polisLunas, renewal, ringkasKlaim, total, type FilterLaporan } from "@/lib/laporan";
import { KATEGORI_KAS, arusKasBulanan, posisiKas, saldoKas, type KategoriKas } from "@/lib/keuangan";
import { daftarPengajuan } from "@/lib/daftar-pengajuan";
import { svgBar, WARNA } from "@/lib/chart";
import { ChartSvg } from "@/components/chart-svg";
import { LANGKAH, labelStatus, nomorLangkah } from "@/lib/domain/journey";
import { geserBulan, namaBulanId, periode } from "@/lib/domain/periode";
import { waktuWib } from "@/lib/domain/perpanjangan";
import { angka, persen, rupiah } from "@/lib/format";
import { adalahOwner, adalahStaf } from "@/lib/peran";

// Halaman cetak A4 untuk worker PDF. Hanya bisa dibuka dengan token job yang masih berlaku.
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

type F = Record<string, string>;

export default async function Cetak({ params, searchParams }: { params: Promise<{ jenis: string }>; searchParams: Promise<{ job?: string; t?: string }> }) {
  const { jenis } = await params;
  const { job: jobId, t } = await searchParams;
  if (!jobId || !cekTokenCetak(jobId, t)) notFound();
  const [b] = await db.select({ j: exportJobs, u: users }).from(exportJobs).innerJoin(users, eq(users.id, exportJobs.userId)).where(eq(exportJobs.id, jobId));
  if (!b || b.j.jenisLaporan !== jenis) notFound();
  const f = (b.j.filter ?? {}) as F;
  const user = b.u;
  const hariIni = waktuWib().tanggal;

  let isi: ReactNode;
  let subjudul = "";
  if (jenis === "laporan") {
    const p = periode(f.periode, hariIni, f.dari, f.sampai);
    subjudul = `${p.label} (${p.dari} s/d ${p.sampai})`;
    isi = await Laporan({ user, f: { dari: p.dari, sampai: p.sampai, salesId: f.sales || undefined, perusahaanId: f.asuransi || undefined, kategoriId: f.paket || undefined } });
  } else if (jenis === "keuangan") {
    if (!adalahOwner(user)) notFound();
    const p = periode(f.periode, hariIni, f.dari, f.sampai);
    subjudul = `${p.label} (${p.dari} s/d ${p.sampai})`;
    isi = await Keuangan({ dari: p.dari, sampai: p.sampai, hariIni });
  } else if (jenis === "pengajuan") {
    const d = await daftarPengajuan(user, f);
    subjudul = `${d.label}${d.q ? ` · cari "${d.q}"` : ""} · ${d.rows.length} pengajuan`;
    isi = <Pengajuan rows={d.rows} admin={adalahStaf(user)} />;
  } else notFound();

  return (
    <div className="mx-auto max-w-[190mm] bg-white p-0 text-[12px] text-ink [print-color-adjust:exact]">
      <header className="mb-5 flex items-start justify-between border-b-2 border-ink pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-ink text-[10px] font-extrabold text-white">RA</span>
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-2">Rekap Asuransi · PT Solusi Inovasi Bangsa</span>
          </div>
          <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">{JENIS_EKSPOR[jenis as JenisEkspor]}</h1>
          <p className="text-[12px] text-ink-2">{subjudul}</p>
        </div>
        <div className="text-right text-[11px] text-ink-3">
          Dibuat untuk {user.nama}
          <br />
          {adalahStaf(user) ? "Admin" : "Sales"}
        </div>
      </header>
      {isi}
    </div>
  );
}

function Tabel({ kepala, baris, kanan = [] }: { kepala: string[]; baris: ReactNode[][]; kanan?: number[] }) {
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr className="border-b border-ink-3 text-left text-[10px] uppercase tracking-wider text-ink-3">
          {kepala.map((k, i) => (
            <th key={k} className={`px-1.5 py-1.5 font-semibold ${kanan.includes(i) ? "text-right" : ""}`}>
              {k}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {baris.map((r, i) => (
          <tr key={i} className="break-inside-avoid border-b border-line">
            {r.map((c, j) => (
              <td key={j} className={`px-1.5 py-1.5 tabular-nums ${kanan.includes(j) ? "whitespace-nowrap text-right" : ""}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Kotak({ label, nilai, sub }: { label: string; nilai: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line p-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">{label}</div>
      <div className="text-[16px] font-extrabold">{nilai}</div>
      {sub && <div className="text-[10px] text-ink-3">{sub}</div>}
    </div>
  );
}

const Judul = ({ children }: { children: ReactNode }) => <h2 className="mb-2 mt-5 text-[13px] font-bold">{children}</h2>;

async function Laporan({ user, f }: { user: typeof users.$inferSelect; f: FilterLaporan }) {
  const admin = adalahStaf(user);
  const owner = adalahOwner(user);
  const awal6 = geserBulan(f.sampai.slice(0, 8) + "01", -5);
  const [rows, rows6, ren, kl] = await Promise.all([polisLunas(user, f), polisLunas(user, { ...f, dari: awal6 < f.dari ? awal6 : f.dari }), renewal(user, f), ringkasKlaim(user, f)]);
  const t = total(rows, admin);
  const bulan = Array.from({ length: 6 }, (_, i) => geserBulan(awal6, i));
  const perBulan = agregasi(rows6, (r) => [r.tglLunas.slice(0, 7), r.tglLunas.slice(0, 7)], admin);
  const svg = svgBar({
    kategori: bulan.map((b) => namaBulanId(b).slice(0, 3)),
    seri: [{ nama: "Premi", data: bulan.map((b) => perBulan.find((x) => x.kunci === b.slice(0, 7))?.premi ?? 0), warna: WARNA.brand }],
    lebar: 700,
    tinggi: 220,
    label: true,
  });
  const kolom = (a: ReturnType<typeof agregasi>[number]) => [
    a.label,
    angka(a.polis),
    rupiah(a.premi),
    ...(admin ? [rupiah(a.cashbackTotal)] : []),
    ...(owner ? [rupiah(a.bagianKantor)] : []),
    rupiah(a.cashbackNasabah),
    rupiah(a.komisi),
  ];
  const kepala = (nama: string) => [nama, "Polis", "Premi", ...(admin ? ["Cashback asuransi"] : []), ...(owner ? ["Kantor"] : []), "Cashback nasabah", admin ? "Komisi" : "Komisi Anda"];
  const kanan = owner ? [1, 2, 3, 4, 5, 6] : admin ? [1, 2, 3, 4, 5] : [1, 2, 3, 4];
  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        <Kotak label="Polis lunas" nilai={angka(t?.polis ?? 0)} sub={`${rows.filter((r) => !r.perpanjangan).length} baru · ${rows.filter((r) => r.perpanjangan).length} perpanjangan`} />
        <Kotak label="Premi" nilai={rupiah(t?.premi ?? 0)} />
        {admin ? <Kotak label="Cashback asuransi" nilai={rupiah(t?.cashbackTotal ?? 0)} sub={owner ? `Kantor ${rupiah(t?.bagianKantor ?? 0)}` : undefined} /> : <Kotak label="Cashback nasabah" nilai={rupiah(t?.cashbackNasabah ?? 0)} />}
        <Kotak label={admin ? "Komisi sales" : "Komisi Anda"} nilai={rupiah(t?.komisi ?? 0)} sub={t?.komisiEvent ? `bonus event ${rupiah(t.komisiEvent)}` : undefined} />
        <Kotak label="Renewal rate" nilai={persen(ren.rate)} sub={`${ren.diperpanjang} dari ${ren.jatuhTempo} jatuh tempo`} />
        <Kotak label="Klaim" nilai={angka(kl.total)} sub={`${kl.diproses} diproses · ${kl.selesai} selesai`} />
      </div>
      <Judul>Premi per bulan (6 bulan s/d {namaBulanId(f.sampai)})</Judul>
      <ChartSvg svg={svg} label="Chart premi per bulan" />
      <Judul>Per asuransi</Judul>
      <Tabel kepala={kepala("Asuransi")} baris={agregasi(rows, (r) => [r.asuransi, r.asuransi], admin).map(kolom)} kanan={kanan} />
      {admin && (
        <>
          <Judul>Per sales</Judul>
          <Tabel kepala={kepala("Sales")} baris={agregasi(rows, (r) => [r.salesId, r.sales], admin).map(kolom)} kanan={kanan} />
        </>
      )}
      <Judul>Detail polis ({rows.length})</Judul>
      <Tabel
        kepala={["Lunas", "No. polis", "Nasabah", ...(admin ? ["Sales"] : []), "Asuransi", "Premi", admin ? "Komisi" : "Komisi Anda"]}
        baris={rows.map((r) => [r.tglLunas, r.noPolis ?? r.kode, `${r.nasabah} · ${r.plat}`, ...(admin ? [r.sales] : []), `${r.asuransi} ${r.paket}`, rupiah(r.premi), rupiah(r.komisi)])}
        kanan={admin ? [5, 6] : [4, 5]}
      />
    </>
  );
}

async function Keuangan({ dari, sampai, hariIni }: { dari: string; sampai: string; hariIni: string }) {
  const awal6 = geserBulan(sampai.slice(0, 8) + "01", -5);
  const [pos, awal, arus, mutasi] = await Promise.all([
    posisiKas(),
    saldoKas(new Date(Date.parse(dari + "T00:00:00Z") - 86_400_000).toISOString().slice(0, 10)),
    arusKasBulanan(awal6 < dari ? awal6 : dari, sampai < hariIni ? sampai : hariIni),
    db
      .select({ k: kasKantor, kode: polis.kode, noPolis: polis.noPolis })
      .from(kasKantor)
      .leftJoin(polis, eq(polis.id, kasKantor.polisId))
      .where(and(gte(kasKantor.tanggal, dari), lte(kasKantor.tanggal, sampai)))
      .orderBy(desc(kasKantor.tanggal)),
  ]);
  const bulan = Array.from({ length: 6 }, (_, i) => geserBulan(awal6, i).slice(0, 7));
  const svg = svgBar({
    kategori: bulan.map((b) => namaBulanId(b + "-01").slice(0, 3)),
    seri: [
      { nama: "Masuk", data: bulan.map((b) => arus.find((a) => a.bulan === b)?.masuk ?? 0), warna: WARNA.ok },
      { nama: "Keluar", data: bulan.map((b) => arus.find((a) => a.bulan === b)?.keluar ?? 0), warna: WARNA.bad },
    ],
    lebar: 700,
    tinggi: 220,
  });
  const masuk = mutasi.filter((m) => m.k.arah === "masuk").reduce((a, m) => a + m.k.nominal, 0);
  const keluar = mutasi.filter((m) => m.k.arah === "keluar").reduce((a, m) => a + m.k.nominal, 0);
  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        <Kotak label="Saldo kas (hari ini)" nilai={rupiah(pos.saldo)} />
        <Kotak label="Dana titipan" nilai={rupiah(pos.titipan.total)} sub={`premi ${rupiah(pos.titipan.premi)} · cashback ${rupiah(pos.titipan.cashback)} · komisi ${rupiah(pos.titipan.komisi)}`} />
        <Kotak label="Saldo bisa ditarik" nilai={rupiah(pos.bisaDitarik)} />
        <Kotak label="Mutasi periode" nilai={rupiah(masuk - keluar)} sub={`awal ${rupiah(awal.saldo)} · masuk ${rupiah(masuk)} · keluar ${rupiah(keluar)}`} />
      </div>
      <Judul>Arus kas masuk vs keluar per bulan</Judul>
      <ChartSvg svg={svg} label="Chart arus kas per bulan" />
      <Judul>Buku kas ({mutasi.length} mutasi)</Judul>
      <Tabel
        kepala={["Tanggal", "Kategori", "Keterangan", "Masuk", "Keluar"]}
        baris={mutasi.map(({ k, kode, noPolis }) => [
          k.tanggal,
          KATEGORI_KAS[k.kategori as KategoriKas]?.label ?? k.kategori,
          k.polisId ? (noPolis ?? kode) : k.keterangan,
          k.arah === "masuk" ? rupiah(k.nominal) : "",
          k.arah === "keluar" ? rupiah(k.nominal) : "",
        ])}
        kanan={[3, 4]}
      />
    </>
  );
}

function Pengajuan({ rows, admin }: { rows: Awaited<ReturnType<typeof daftarPengajuan>>["rows"]; admin: boolean }) {
  return (
    <Tabel
      kepala={["Kode", "Nasabah / kendaraan", ...(admin ? ["Sales"] : []), "Asuransi", "Journey", "Status", "Diubah"]}
      baris={rows.map((r) => {
        const n = nomorLangkah(r.p.statusPengajuan) ?? nomorLangkah(r.statusTerakhir ?? "draft_prospek") ?? 0;
        const cabang = nomorLangkah(r.p.statusPengajuan) === null;
        return [
          r.p.kode,
          <span key="n">
            <b>{r.nasabah}</b>
            <br />
            <span className="text-ink-3">
              {r.plat} · {r.kendaraan}
            </span>
          </span>,
          ...(admin ? [r.sales] : []),
          r.asuransi ?? "–",
          <span key="j" className="flex gap-[2px]">
            {LANGKAH.map((_, i) => (
              <span key={i} className={`inline-block h-[7px] w-[9px] rounded-[2px] ${i < n ? (cabang ? "bg-warn" : r.p.statusPengajuan === "selesai" ? "bg-ok" : "bg-brand") : "bg-line"}`} />
            ))}
          </span>,
          `${nomorLangkah(r.p.statusPengajuan) ? `${n}/12 · ` : ""}${labelStatus(r.p.statusPengajuan)}`,
          r.diubah,
        ];
      })}
    />
  );
}
