import "server-only";

// Klien Fonnte (https://docs.fonnte.com). Semua pesan sistem dikirim dari
// satu nomor WhatsApp kantor. Tanpa FONNTE_TOKEN (development) atau dengan
// FONNTE_DRY_RUN=1 (staging/uji), pesan hanya dicetak ke log server.

export type KirimWa = {
  target: string; // 62xxxxxxxxxx
  message: string;
  /** URL file publik untuk lampiran (PDF polis, bukti transfer, …) */
  url?: string;
  filename?: string;
  /** Unix timestamp (detik) untuk kirim terjadwal */
  schedule?: number;
  /** Jeda acak, mis. "5-15" detik */
  delay?: string;
};

export type HasilKirimWa = { ok: true; id: string | null } | { ok: false; alasan: string };

export async function kirimWa(p: KirimWa): Promise<HasilKirimWa> {
  const token = process.env.FONNTE_TOKEN;
  if (!token || process.env.FONNTE_DRY_RUN === "1") {
    if (process.env.NODE_ENV === "production" && process.env.FONNTE_DRY_RUN !== "1") {
      return { ok: false, alasan: "FONNTE_TOKEN belum diatur" };
    }
    console.info(`[fonnte:dev] → ${p.target}\n${p.message}${p.url ? `\n[lampiran] ${p.url}` : ""}`);
    return { ok: true, id: null };
  }

  const body = new FormData();
  body.set("target", p.target);
  body.set("message", p.message);
  body.set("countryCode", "62");
  if (p.url) body.set("url", p.url);
  if (p.filename) body.set("filename", p.filename);
  if (p.schedule) body.set("schedule", String(p.schedule));
  if (p.delay) body.set("delay", p.delay);

  try {
    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: token },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json()) as { status?: boolean; id?: (string | number)[]; reason?: string; detail?: string };
    if (!json.status) return { ok: false, alasan: json.reason ?? json.detail ?? `HTTP ${res.status}` };
    return { ok: true, id: json.id?.[0] != null ? String(json.id[0]) : null };
  } catch (e) {
    return { ok: false, alasan: e instanceof Error ? e.message : "Gagal menghubungi Fonnte" };
  }
}
