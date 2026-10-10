import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createId } from "@/lib/id";

// Penyimpanan file privat (KTP, STNK, foto, PDF polis, bukti transfer) di filesystem.
// Folder: STORAGE_DIR (bawaan ./storage di folder aplikasi). Di server, arahkan ke
// volume yang di-backup, mis. /var/lib/insurance/storage.
// File tidak pernah diakses langsung; selalu lewat /api/dokumen/[id] (cek hak akses)
// atau link unduh berbatas waktu /p/[kode].

export const MAKS_UKURAN = 10 * 1024 * 1024; // 10 MB
export const TIPE_DIIZINKAN: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

export function folderStorage(): string {
  return path.resolve(process.env.STORAGE_DIR || path.join(process.cwd(), "storage"));
}

/** Path absolut untuk key; menolak key yang mencoba keluar dari folder storage. */
function pathFile(key: string): string {
  const root = folderStorage();
  const p = path.resolve(root, key);
  if (!p.startsWith(root + path.sep)) throw new Error("Key file tidak valid");
  return p;
}

export class FileTidakValid extends Error {}

/** Simpan file upload; mengembalikan key relatif, mis. kendaraan/2026-10/ab12….jpg */
export async function simpanFile(file: File, folder: string): Promise<string> {
  const ext = TIPE_DIIZINKAN[file.type];
  if (!ext) throw new FileTidakValid("Format file harus JPG, PNG, WEBP, HEIC, atau PDF");
  if (file.size === 0) throw new FileTidakValid("File kosong");
  if (file.size > MAKS_UKURAN) throw new FileTidakValid("Ukuran file maksimal 10 MB");

  const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${createId()}.${ext}`;
  const tujuan = pathFile(key);
  await mkdir(path.dirname(tujuan), { recursive: true });
  // Tulis ke file sementara lalu rename, agar tidak ada file setengah jadi bila proses terputus.
  const sementara = `${tujuan}.part`;
  await writeFile(sementara, Buffer.from(await file.arrayBuffer()));
  await rename(sementara, tujuan);
  return key;
}

export async function bacaFile(key: string): Promise<Buffer> {
  return readFile(pathFile(key));
}

export function tipeKonten(key: string): string {
  const ext = key.split(".").pop()!;
  return Object.entries(TIPE_DIIZINKAN).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
}
