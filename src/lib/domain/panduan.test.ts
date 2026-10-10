import { describe, expect, it } from "vitest";
import { PANDUAN_BAWAAN, progresOnboarding, uraiInline, uraiPanduan } from "./panduan";

describe("uraiPanduan", () => {
  it("paragraf, sub judul, poin, nomor", () => {
    const b = uraiPanduan("Halo\nsemua\n\n## Komisi\n- satu\n- dua\n1. a\n2. b");
    expect(b.map((x) => x.t)).toEqual(["paragraf", "judul", "poin", "nomor"]);
    expect(b[0]).toEqual({ t: "paragraf", isi: [{ t: "teks", v: "Halo semua" }] });
    expect(b[2].t === "poin" && b[2].item.length).toBe(2);
  });

  it("FAQ mengumpulkan jawaban sampai pertanyaan berikutnya", () => {
    const b = uraiPanduan("?? Kapan?\nJumat.\n- cek Pencairan\n\n?? Kenapa?\nKarena.\n## Lain\nteks");
    expect(b.map((x) => x.t)).toEqual(["tanya", "tanya", "judul", "paragraf"]);
    const t = b[0];
    expect(t.t === "tanya" && t.jawab.map((x) => x.t)).toEqual(["paragraf", "poin"]);
  });

  it("tebal & tautan; skema berbahaya tidak jadi tautan", () => {
    expect(uraiInline("a **b** [c](/pencairan) [d](javascript:alert(1))")).toEqual([
      { t: "teks", v: "a " },
      { t: "tebal", v: "b" },
      { t: "teks", v: " " },
      { t: "tautan", v: "c", href: "/pencairan" },
      { t: "teks", v: " [d](javascript:alert(1))" },
    ]);
  });

  it("isi bawaan terurai tanpa blok kosong & tanpa istilah rahasia", () => {
    for (const b of PANDUAN_BAWAAN) {
      expect(uraiPanduan(b.isi).length).toBeGreaterThan(0);
      expect(b.isi).not.toMatch(/cashback (dari )?asuransi|bagian kantor|bagi hasil|porsi/i);
    }
  });
});

describe("progresOnboarding", () => {
  it("manual dari centang, sisanya dari data", () => {
    const p = progresOnboarding(["journey"], { rekening: true, nasabah_pertama: false, pengajuan_pertama: false });
    expect(p.selesai).toBe(2);
    expect(p.beres).toBe(false);
    expect(progresOnboarding(["cara_dibayar", "journey", "rekening"], { rekening: true, nasabah_pertama: true, pengajuan_pertama: true }).beres).toBe(true);
    // Centang manual untuk langkah otomatis diabaikan
    expect(progresOnboarding(["rekening"], {}).selesai).toBe(0);
  });
});
