// Dijalankan di browser: kecilkan foto sebelum diupload (foto HP 3–8 MB → ~300–700 KB).
// Dokumen tetap terbaca jelas: sisi terpanjang maks 2000 px, JPEG kualitas 0,85.

const SISI_MAKS = 2000;
const KUALITAS = 0.85;
const LEWATI_DI_BAWAH = 900 * 1024; // file kecil tidak perlu dikompres
export const MAKS_PER_FILE = 10 * 1024 * 1024;
export const MAKS_TOTAL = 45 * 1024 * 1024;

const BISA_DIKOMPRES = ["image/jpeg", "image/png", "image/webp"];

export async function kompresGambar(file: File): Promise<File> {
  if (!BISA_DIKOMPRES.includes(file.type) || file.size < LEWATI_DI_BAWAH) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const skala = Math.min(1, SISI_MAKS / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * skala);
    const h = Math.round(bmp.height * skala);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; // PNG transparan → latar putih
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", KUALITAS));
    if (!blob || blob.size >= file.size) return file;
    const nama = file.name.replace(/\.(png|webp|jpe?g)$/i, "") + ".jpg";
    return new File([blob], nama, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file; // browser tidak bisa membaca format ini → kirim apa adanya
  }
}

/** Kompres semua foto di FormData; kembalikan pesan galat bila masih terlalu besar. */
export async function siapkanUpload(data: FormData): Promise<string | null> {
  let total = 0;
  for (const [k, v] of [...data.entries()]) {
    if (!(v instanceof File) || v.size === 0) continue;
    const kecil = await kompresGambar(v);
    if (kecil.size > MAKS_PER_FILE) return `"${v.name}" lebih dari 10 MB. Kecilkan dulu atau kirim sebagai foto.`;
    total += kecil.size;
    if (kecil !== v) {
      // Ganti entri file asli dengan hasil kompres, urutan tetap.
      const semua = data.getAll(k);
      data.delete(k);
      for (const x of semua) data.append(k, x === v ? kecil : x);
    }
  }
  if (total > MAKS_TOTAL) return "Total file terlalu besar. Upload sebagian dulu, sisanya menyusul.";
  return null;
}
