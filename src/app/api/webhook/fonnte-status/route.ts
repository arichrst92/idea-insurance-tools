import { perbaruiStatusWa } from "@/lib/wa-masuk";
import { bacaBody, webhookSah } from "@/lib/webhook";

// Webhook status pesan Fonnte: terkirim → diterima → dibaca / gagal.
export async function POST(req: Request) {
  if (!webhookSah(req)) return Response.json({ ok: false }, { status: 401 });
  const b = await bacaBody(req);
  if (!b.id) return Response.json({ ok: true, diubah: false });
  const diubah = await perbaruiStatusWa(b.id, b.state || b.status || "");
  return Response.json({ ok: true, diubah });
}
