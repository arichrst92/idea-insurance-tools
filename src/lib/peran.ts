import { and, eq, inArray, or } from "drizzle-orm";
import { users, type User } from "@/db/schema";

/**
 * Peran:
 * - owner : pemilik. Semua menu admin + keuangan, bagian kantor, kebijakan (bagi hasil, gaji, target, event),
 *           persetujuan batch transfer, kelola akun staf. Boleh lebih dari satu. Bisa merangkap sales (jugaSales).
 * - admin : operasional (pengajuan, master data, WhatsApp, otomasi, menyiapkan batch transfer). Melihat cashback
 *           asuransi per polis, tetapi tidak melihat bagian kantor / saldo kas.
 * - sales : penjual; hanya data miliknya.
 */
type P = Pick<User, "role"> & Partial<Pick<User, "jugaSales">>;

/** Admin atau owner: melihat semua data & menu operasional. */
export const adalahStaf = (u: P) => u.role === "admin" || u.role === "owner";
export const adalahOwner = (u: P) => u.role === "owner";
/** Bisa punya nasabah/pengajuan sendiri & menerima komisi. */
export const bisaJual = (u: P) => u.role === "sales" || (u.role === "owner" && !!u.jugaSales);

export const LABEL_PERAN: Record<User["role"], string> = { owner: "Owner", admin: "Admin", sales: "Sales" };
export const labelPeran = (u: P) => (u.role === "owner" && u.jugaSales ? "Owner · sales" : LABEL_PERAN[u.role]);

/** SQL: user yang berjualan (sales, atau owner merangkap sales). */
export const penjualSql = () => or(eq(users.role, "sales"), and(eq(users.role, "owner"), eq(users.jugaSales, true)));
/** SQL: admin & owner. */
export const stafSql = () => inArray(users.role, ["admin", "owner"]);
