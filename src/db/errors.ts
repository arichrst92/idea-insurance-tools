/** True bila error berasal dari pelanggaran unique constraint Postgres (23505). Drizzle membungkus error asli di `cause`. */
export function pelanggaranUnik(e: unknown): boolean {
  for (let x: unknown = e, i = 0; x && i < 4; x = (x as { cause?: unknown }).cause, i++) {
    if (typeof x === "object" && (x as { code?: string }).code === "23505") return true;
  }
  return false;
}
