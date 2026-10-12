import ExcelJS from "exceljs";
import { sesiSekarang } from "@/lib/auth/session";
import { agregasi, polisLunas, renewal, ringkasKlaim, total, type Agregat } from "@/lib/laporan";
import { filterDari, type SP } from "@/app/(app)/laporan/util";
import { catatEksporExcel } from "@/lib/ekspor/simpan";
import { adalahOwner, adalahStaf } from "@/lib/peran";

// Ekspor laporan ke Excel dengan filter yang sama seperti halaman Laporan.
// Kolom cashback asuransi untuk admin & owner; bagian kantor hanya owner.
export async function GET(req: Request) {
  const s = await sesiSekarang();
  if (!s) return new Response("Harus login", { status: 401 });
  const user = s.user;
  const admin = adalahStaf(user);
  const owner = adalahOwner(user);
  const sp = Object.fromEntries(new URL(req.url).searchParams) as SP;
  const { p, f } = filterDari(sp);
  const [rows, ren, kl] = await Promise.all([polisLunas(user, f), renewal(user, f), ringkasKlaim(user, f)]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Rekap Asuransi";
  wb.created = new Date();
  const RP = '"Rp" #,##0';
  const tebal = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FF" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  // Ringkasan
  const t = total(rows, admin);
  const r1 = wb.addWorksheet("Ringkasan");
  r1.columns = [{ width: 32 }, { width: 22 }];
  const isi: [string, string | number][] = [
    ["Periode", `${p.label} (${p.dari} s/d ${p.sampai})`],
    ["Polis lunas", t?.polis ?? 0],
    ["Premi", t?.premi ?? 0],
    ...(admin ? ([["Cashback asuransi", t?.cashbackTotal ?? 0]] as [string, number][]) : []),
    ...(owner ? ([["Bagian kantor", t?.bagianKantor ?? 0]] as [string, number][]) : []),
    ["Cashback nasabah", t?.cashbackNasabah ?? 0],
    [admin ? "Komisi sales" : "Komisi Anda", t?.komisi ?? 0],
    ["  dari bonus event", t?.komisiEvent ?? 0],
    ["Polis jatuh tempo", ren.jatuhTempo],
    ["Diperpanjang", ren.diperpanjang],
    ["Renewal rate (%)", ren.rate],
    ["Klaim", kl.total],
  ];
  isi.forEach(([k, v]) => {
    const row = r1.addRow([k, v]);
    if (typeof v === "number" && !/Polis|Diperpanjang|rate|Klaim/.test(k)) row.getCell(2).numFmt = RP;
  });
  r1.getColumn(1).font = { bold: true };

  // Agregat
  const lembarAgregat = (nama: string, data: Agregat[]) => {
    const ws = wb.addWorksheet(nama);
    ws.columns = [
      { header: nama.replace("Per ", ""), key: "label", width: 30 },
      { header: "Polis", key: "polis", width: 8 },
      { header: "Premi", key: "premi", width: 16, style: { numFmt: RP } },
      ...(admin ? [{ header: "Cashback asuransi", key: "cashbackTotal", width: 18, style: { numFmt: RP } }] : []),
      { header: "Cashback nasabah", key: "cashbackNasabah", width: 18, style: { numFmt: RP } },
      ...(owner ? [{ header: "Bagian kantor", key: "bagianKantor", width: 16, style: { numFmt: RP } }] : []),
      { header: admin ? "Komisi sales" : "Komisi Anda", key: "komisi", width: 16, style: { numFmt: RP } },
      { header: "Dari event", key: "komisiEvent", width: 14, style: { numFmt: RP } },
    ];
    data.forEach((d) => ws.addRow(d));
    tebal(ws);
  };
  if (admin) lembarAgregat("Per sales", agregasi(rows, (r) => [r.salesId, r.sales], admin));
  lembarAgregat("Per asuransi", agregasi(rows, (r) => [r.asuransi, r.asuransi], admin));
  lembarAgregat("Per paket", agregasi(rows, (r) => [`${r.asuransi} · ${r.paket}`, `${r.asuransi} · ${r.paket}`], admin));

  // Detail
  const d = wb.addWorksheet("Detail polis");
  d.columns = [
    { header: "Tgl lunas", key: "tglLunas", width: 12 },
    { header: "Kode", key: "kode", width: 10 },
    { header: "No. polis", key: "noPolis", width: 18 },
    { header: "Nasabah", key: "nasabah", width: 24 },
    { header: "Plat", key: "plat", width: 12 },
    ...(admin ? [{ header: "Sales", key: "sales", width: 18 }] : []),
    { header: "Asuransi", key: "asuransi", width: 16 },
    { header: "Paket", key: "paket", width: 12 },
    { header: "Jenis", key: "jenis", width: 13 },
    { header: "Premi", key: "premi", width: 15, style: { numFmt: RP } },
    ...(admin ? [{ header: "Cashback asuransi", key: "cashbackTotal", width: 17, style: { numFmt: RP } }] : []),
    { header: "Cashback nasabah", key: "cashbackNasabah", width: 17, style: { numFmt: RP } },
    ...(owner ? [{ header: "Bagian kantor", key: "bagianKantor", width: 15, style: { numFmt: RP } }] : []),
    { header: admin ? "Komisi sales" : "Komisi Anda", key: "komisi", width: 15, style: { numFmt: RP } },
    { header: "Dari event", key: "komisiEvent", width: 13, style: { numFmt: RP } },
    { header: "Bayar", key: "bayar", width: 10 },
  ];
  rows.forEach((r) => d.addRow({ ...r, jenis: r.perpanjangan ? "Perpanjangan" : "Baru", bayar: r.lunas ? "Lunas" : "Belum" }));
  tebal(d);

  const buf = await wb.xlsx.writeBuffer();
  const nama = `laporan-${p.dari}_${p.sampai}.xlsx`;
  await catatEksporExcel({ userId: user.id, jenis: "laporan", filter: sp as Record<string, string>, isi: buf as ArrayBuffer, nama });
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nama}"`,
      "Cache-Control": "no-store",
    },
  });
}
