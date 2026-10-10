import { hash, samaAman } from "@/lib/auth/crypto";

// Token halaman cetak: hanya worker PDF yang membuka /cetak/* (tanpa cookie sesi).
const UMUR_MS = 10 * 60_000;

export function tokenCetak(jobId: string, sekarang = Date.now()) {
  const exp = sekarang + UMUR_MS;
  return `${exp}.${hash(`cetak:${jobId}:${exp}`)}`;
}

export function cekTokenCetak(jobId: string, token: string | undefined, sekarang = Date.now()) {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < sekarang) return false;
  return samaAman(sig, hash(`cetak:${jobId}:${exp}`));
}
