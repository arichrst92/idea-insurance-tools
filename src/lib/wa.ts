/** Normalisasi nomor WhatsApp Indonesia ke format 62xxxxxxxxxx. Null bila tidak valid. */
export function normalisasiNoWa(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  if (!d.startsWith("628")) return null;
  if (d.length < 11 || d.length > 15) return null;
  return d;
}

/** Tampilan ramah: 6281234567890 → 0812-3456-7890 */
export function formatNoWa(no: string): string {
  const lokal = no.startsWith("62") ? "0" + no.slice(2) : no;
  return lokal.replace(/^(\d{4})(\d{4})(\d+)$/, "$1-$2-$3");
}

/** Link wa.me (cadangan bila Fonnte tidak tersedia). */
export function linkWaMe(no: string, pesan: string): string {
  return `https://wa.me/${no}?text=${encodeURIComponent(pesan)}`;
}
