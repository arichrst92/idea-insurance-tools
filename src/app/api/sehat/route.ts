import { access, constants, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { folderStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Cek sehat untuk pemantau uptime & skrip deploy: database terjangkau dan folder upload bisa ditulis.
 * Publik (tanpa login), tidak mengembalikan data bisnis apa pun.
 */
export async function GET() {
  const mulai = Date.now();
  const cek = { db: false, storage: false };
  try {
    await db.execute(sql`select 1`);
    cek.db = true;
  } catch {}
  try {
    await mkdir(folderStorage(), { recursive: true });
    await access(folderStorage(), constants.W_OK);
    cek.storage = true;
  } catch {}
  const versi = await readFile(path.join(process.cwd(), "VERSI"), "utf8").then((s) => s.trim()).catch(() => "dev");
  const ok = cek.db && cek.storage;
  return Response.json(
    { ok, ...cek, versi, uptimeDetik: Math.round(process.uptime()), ms: Date.now() - mulai },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
