import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET belum diatur");
  return s ?? "dev-secret-ganti-di-production";
}

/** Hash satu arah untuk OTP & token sesi (HMAC-SHA256 dengan AUTH_SECRET). */
export function hash(nilai: string): string {
  return createHmac("sha256", secret()).update(nilai).digest("hex");
}

export function samaAman(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function kodeOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function tokenSesi(): string {
  return randomBytes(32).toString("base64url");
}
