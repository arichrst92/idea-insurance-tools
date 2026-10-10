import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Webhook Fonnte diamankan dengan ?k=<FONNTE_WEBHOOK_SECRET>. Tanpa secret hanya diizinkan di luar production. */
export function webhookSah(req: Request) {
  const rahasia = process.env.FONNTE_WEBHOOK_SECRET;
  if (!rahasia) return process.env.NODE_ENV !== "production";
  const k = Buffer.from(new URL(req.url).searchParams.get("k") ?? "");
  const r = Buffer.from(rahasia);
  return k.length === r.length && timingSafeEqual(k, r);
}

/** Fonnte mengirim JSON; sebagian konfigurasi mengirim form-urlencoded. */
export async function bacaBody(req: Request): Promise<Record<string, string>> {
  const tipe = req.headers.get("content-type") ?? "";
  if (tipe.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(j).map(([k, v]) => [k, v == null ? "" : String(v)]));
  }
  const f = await req.formData().catch(() => null);
  return f ? Object.fromEntries([...f.entries()].map(([k, v]) => [k, String(v)])) : {};
}
