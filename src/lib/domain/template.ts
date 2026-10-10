/** Isi variabel {nama} di template pesan. Variabel tak dikenal dibiarkan apa adanya. */
export function renderTemplate(isi: string, vars: Record<string, string | number | null | undefined>): string {
  return isi.replace(/\{([a-z_]+)\}/g, (m, k: string) => {
    const v = vars[k];
    return v == null || v === "" ? m : String(v);
  });
}

/** Sapaan untuk pesan ke nasabah. Badan usaha tanpa sapaan. */
export function sapaan(tipe: "perorangan" | "badan"): string {
  return tipe === "badan" ? "" : "Bapak/Ibu";
}

/** Rapikan spasi ganda yang muncul saat variabel kosong (mis. sapaan badan usaha). */
export function rapikan(s: string): string {
  return s.replace(/[ \t]{2,}/g, " ").replace(/ ([,.])/g, "$1");
}
