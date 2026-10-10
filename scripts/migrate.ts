// Terapkan migrasi drizzle/ tanpa drizzle-kit (dipakai di server produksi).
// Dibundel ke rilis sebagai migrate.mjs: `node migrate.mjs` di folder rilis (butuh DATABASE_URL).
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL kosong");
  process.exit(1);
}
const client = postgres(url, { max: 1, onnotice: () => {} });
const folder = process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "drizzle");
migrate(drizzle(client), { migrationsFolder: folder })
  .then(() => console.log("Migrasi selesai:", folder))
  .catch((e) => {
    console.error("Migrasi gagal:", e);
    process.exitCode = 1;
  })
  .finally(() => client.end());
