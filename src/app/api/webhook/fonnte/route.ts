import { prosesPesanMasuk } from "@/lib/wa-masuk";
import { bacaBody, webhookSah } from "@/lib/webhook";

// Webhook pesan masuk Fonnte (balasan nasabah ke nomor WhatsApp kantor).
export async function POST(req: Request) {
  if (!webhookSah(req)) return Response.json({ ok: false }, { status: 401 });
  const b = await bacaBody(req);
  if (!b.sender) return Response.json({ ok: true, aksi: "abaikan" });
  const h = await prosesPesanMasuk({ sender: b.sender, message: b.message ?? b.text ?? "", url: b.url || null, filename: b.filename || null, name: b.name || null });
  return Response.json({ ok: true, ...h });
}
