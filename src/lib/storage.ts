import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createId } from "@/lib/id";

// Penyimpanan file privat (KTP, STNK, foto, PDF polis, bukti transfer).
// - S3_ENDPOINT diisi → S3-compatible (MinIO di VPS).
// - Kosong → folder lokal ./storage (development, tanpa Docker).
// File tidak pernah diakses langsung; selalu lewat /api/dokumen/[id] yang memeriksa hak akses.

export const MAKS_UKURAN = 10 * 1024 * 1024; // 10 MB
export const TIPE_DIIZINKAN: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

const FOLDER_LOKAL = path.join(process.cwd(), "storage");

let s3: S3Client | null = null;
function klienS3(): S3Client | null {
  if (!process.env.S3_ENDPOINT) return null;
  s3 ??= new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? "", secretAccessKey: process.env.S3_SECRET_KEY ?? "" },
  });
  return s3;
}
const bucket = () => process.env.S3_BUCKET ?? "insurance";

export class FileTidakValid extends Error {}

/** Simpan file upload; mengembalikan key penyimpanan. */
export async function simpanFile(file: File, folder: string): Promise<string> {
  const ext = TIPE_DIIZINKAN[file.type];
  if (!ext) throw new FileTidakValid("Format file harus JPG, PNG, WEBP, HEIC, atau PDF");
  if (file.size === 0) throw new FileTidakValid("File kosong");
  if (file.size > MAKS_UKURAN) throw new FileTidakValid("Ukuran file maksimal 10 MB");

  const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${createId()}.${ext}`;
  const isi = Buffer.from(await file.arrayBuffer());
  const c = klienS3();
  if (c) {
    await c.send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: isi, ContentType: file.type }));
  } else {
    const tujuan = path.join(FOLDER_LOKAL, key);
    await mkdir(path.dirname(tujuan), { recursive: true });
    await writeFile(tujuan, isi);
  }
  return key;
}

export async function bacaFile(key: string): Promise<Buffer> {
  if (key.includes("..")) throw new Error("Key tidak valid");
  const c = klienS3();
  if (c) {
    const res = await c.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  return readFile(path.join(FOLDER_LOKAL, key));
}

export function tipeKonten(key: string): string {
  const ext = key.split(".").pop()!;
  return Object.entries(TIPE_DIIZINKAN).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
}
