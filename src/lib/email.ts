import "server-only";

// Email lewat SendGrid (v3 Mail Send). Tanpa SENDGRID_API_KEY (development) atau
// dengan EMAIL_DRY_RUN=1 (staging/uji), email hanya dicetak ke log server.

export type Lampiran = { namaFile: string; tipe: string; isi: Buffer };

export type KirimEmail = {
  ke: string;
  subjek: string;
  html: string;
  teks: string;
  balasKe?: string;
  lampiran?: Lampiran[];
};

export type HasilEmail = { ok: true; id: string | null } | { ok: false; alasan: string };

export async function kirimEmail(p: KirimEmail): Promise<HasilEmail> {
  const key = process.env.SENDGRID_API_KEY;
  const dari = process.env.EMAIL_FROM ?? "asuransi@ide.asia";
  if (!key || process.env.EMAIL_DRY_RUN === "1") {
    if (process.env.NODE_ENV === "production" && process.env.EMAIL_DRY_RUN !== "1") {
      return { ok: false, alasan: "SENDGRID_API_KEY belum diatur" };
    }
    console.info(
      `[email:dev] → ${p.ke}\nSubjek: ${p.subjek}\n${p.teks}${p.lampiran?.length ? `\n[lampiran] ${p.lampiran.map((l) => l.namaFile).join(", ")}` : ""}`,
    );
    return { ok: true, id: null };
  }

  try {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        personalizations: [{ to: [{ email: p.ke }] }],
        from: { email: dari, name: process.env.EMAIL_FROM_NAME ?? "Rekap Asuransi" },
        ...(p.balasKe ? { reply_to: { email: p.balasKe } } : {}),
        subject: p.subjek,
        content: [
          { type: "text/plain", value: p.teks },
          { type: "text/html", value: p.html },
        ],
        attachments: p.lampiran?.map((l) => ({
          content: l.isi.toString("base64"),
          filename: l.namaFile,
          type: l.tipe,
          disposition: "attachment",
        })),
      }),
    });
    if (!res.ok) return { ok: false, alasan: `SendGrid ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true, id: res.headers.get("x-message-id") };
  } catch (e) {
    return { ok: false, alasan: e instanceof Error ? e.message : "Gagal menghubungi SendGrid" };
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
