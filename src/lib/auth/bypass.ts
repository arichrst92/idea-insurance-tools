import "server-only";

/**
 * Bypass OTP untuk development: OTP_BYPASS=1 → login cukup dengan nomor
 * WhatsApp terdaftar, tanpa kode. Selalu mati di production (NODE_ENV=production),
 * apa pun isi env-nya, agar tidak terbawa ke server live.
 */
export function otpDibypass(): boolean {
  return process.env.OTP_BYPASS === "1" && process.env.NODE_ENV !== "production";
}
