import { sesiSekarang } from "@/lib/auth/session";
import { rekapKomisiSiapBayar } from "@/lib/pencairan";
import { waktuWib } from "@/lib/domain/perpanjangan";
import { adalahStaf } from "@/lib/peran";

// Rekap komisi siap bayar per sales (CSV, admin). Format unggah BCA menyusul bersama Jadwal bayar.
export async function GET() {
  const s = await sesiSekarang();
  if (!s || !adalahStaf(s.user)) return new Response("Tidak diizinkan", { status: 403 });
  const rows = await rekapKomisiSiapBayar();
  const tgl = waktuWib().tanggal;
  const sel = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    ["Nama sales", "Bank", "Kode bank", "No. rekening", "Atas nama", "Jumlah polis", "Total komisi", "Berita"].map(sel).join(","),
    ...rows.map((r) => [r.sales, r.bank, r.kodeBank, r.noRekening, r.atasNama, r.polis, r.total, `Komisi ${tgl}`].map(sel).join(",")),
  ].join("\r\n");
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rekap-komisi-${tgl}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
