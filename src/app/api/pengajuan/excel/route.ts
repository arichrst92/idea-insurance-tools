import ExcelJS from "exceljs";
import { sesiSekarang } from "@/lib/auth/session";
import { daftarPengajuan } from "@/lib/daftar-pengajuan";
import { catatEksporExcel } from "@/lib/ekspor/simpan";
import { labelStatus, nomorLangkah } from "@/lib/domain/journey";
import { adalahStaf } from "@/lib/peran";

// Ekspor daftar pengajuan sesuai filter aktif (sales: miliknya sendiri). Tanpa angka cashback asuransi.
export async function GET(req: Request) {
  const s = await sesiSekarang();
  if (!s) return new Response("Harus login", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams) as Record<string, string>;
  const admin = adalahStaf(s.user);
  const d = await daftarPengajuan(s.user, sp);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Pengajuan");
  ws.columns = [
    { header: "Kode", key: "kode", width: 10 },
    { header: "No. polis", key: "noPolis", width: 18 },
    { header: "Nasabah", key: "nasabah", width: 24 },
    { header: "Plat", key: "plat", width: 12 },
    { header: "Kendaraan", key: "kendaraan", width: 20 },
    ...(admin ? [{ header: "Sales", key: "sales", width: 18 }] : []),
    { header: "Asuransi", key: "asuransi", width: 16 },
    { header: "Langkah", key: "langkah", width: 9 },
    { header: "Status", key: "status", width: 22 },
    { header: "Premi", key: "premi", width: 15, style: { numFmt: '"Rp" #,##0' } },
    { header: "Cashback nasabah", key: "cn", width: 16, style: { numFmt: '"Rp" #,##0' } },
    { header: admin ? "Komisi sales" : "Komisi Anda", key: "komisi", width: 15, style: { numFmt: '"Rp" #,##0' } },
    { header: "Diubah", key: "diubah", width: 12 },
  ];
  for (const r of d.rows)
    ws.addRow({
      kode: r.p.kode,
      noPolis: r.p.noPolis,
      nasabah: r.nasabah,
      plat: r.plat,
      kendaraan: r.kendaraan,
      sales: r.sales,
      asuransi: r.asuransi,
      langkah: nomorLangkah(r.p.statusPengajuan) ? `${nomorLangkah(r.p.statusPengajuan)}/12` : "–",
      status: labelStatus(r.p.statusPengajuan),
      premi: r.p.premiBruto,
      cn: r.p.cashbackNasabahRp,
      komisi: r.p.komisiSalesRp,
      diubah: r.diubah,
    });
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  const nama = `pengajuan-${d.tab}.xlsx`;
  await catatEksporExcel({ userId: s.user.id, jenis: "pengajuan", filter: sp, isi: buf as ArrayBuffer, nama });
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nama}"`,
      "Cache-Control": "no-store",
    },
  });
}
