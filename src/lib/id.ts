import { randomBytes } from "node:crypto";

// Huruf/angka tanpa karakter yang mudah tertukar (0/O, 1/I/L).
const ALFABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Token acak tak tertebak dari alfabet yang mudah dibaca (untuk link tracker / unduh). */
export function tokenPendek(panjang = 8): string {
  const bytes = randomBytes(panjang);
  let out = "";
  for (let i = 0; i < panjang; i++) out += ALFABET[bytes[i] % ALFABET.length];
  return out;
}

/** ID baris: 20 karakter base32 huruf kecil, ~100 bit entropi. */
export function createId(): string {
  return tokenPendek(20).toLowerCase();
}
