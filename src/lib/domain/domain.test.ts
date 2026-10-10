import { describe, expect, it } from "vitest";
import { hitungKomisi, bagiHasilBerlaku, KomisiError, porsiKantorDenganEvent, type EventAktif } from "./komisi";
import { hitungGaji, pencapaianPersen } from "./gaji";
import { langkahNasabah, nomorLangkah, samarkanPlat, transisiSah } from "./journey";
import { normalisasiNoWa } from "../wa";
import { normalisasiPlat } from "./kendaraan";
import { rapikan, renderTemplate } from "./template";

describe("hitungKomisi — contoh di dokumen", () => {
  const dasar = {
    premiBruto: 6_000_000,
    cashbackTotalPersen: 35,
    cashbackNasabahPersen: 15,
    maksCashbackNasabahPersen: 20,
    bagiHasilKantorPersen: 30,
  };

  it("premi 6 jt, 35% / 15% / kantor 30%", () => {
    expect(hitungKomisi(dasar)).toEqual({
      cashbackTotalRp: 2_100_000,
      cashbackNasabahRp: 900_000,
      cashbackSalesRp: 1_200_000,
      bagianKantorRp: 360_000,
      komisiSalesRp: 840_000,
    });
  });

  it("event +15% komisi: sales 70% → 80,5%, kantor 19,5% → komisi 966.000", () => {
    expect(hitungKomisi({ ...dasar, bagiHasilKantorPersen: porsiKantorDenganEvent(30, 15) })).toMatchObject({
      bagianKantorRp: 234_000,
      komisiSalesRp: 966_000,
    });
  });

  it("menolak cashback nasabah di atas batas sales", () => {
    expect(() => hitungKomisi({ ...dasar, cashbackNasabahPersen: 21 })).toThrow(KomisiError);
  });

  it("menolak cashback nasabah di atas cashback total", () => {
    expect(() =>
      hitungKomisi({ ...dasar, cashbackTotalPersen: 10, cashbackNasabahPersen: 15 }),
    ).toThrow(KomisiError);
  });
});

describe("porsiKantorDenganEvent — event menambah porsi sales", () => {
  it.each([
    [60, 15, 54], // contoh: kantor 60 / sales 40, +15% → sales 46, kantor 54
    [30, 15, 19.5],
    [50, 100, 0], // sales 50 × 2 = 100 → kantor 0
    [20, 50, 0], // dibatasi: porsi sales maks 100%
    [40, 0, 40],
  ])("kantor %d%%, tambahan %d%% → kantor %d%%", (k, t, hasil) => {
    expect(porsiKantorDenganEvent(k, t)).toBe(hasil);
  });
});

describe("bagiHasilBerlaku", () => {
  const sales = { id: "s1", tipeSales: "fulltime" as const, bagiHasilKantorPersen: 60 };
  const ev = (o: Partial<EventAktif>): EventAktif => ({
    id: "e",
    tglMulai: "2026-11-01",
    tglSelesai: "2026-12-31",
    tambahanKomisiPersen: 15,
    berlakuUntuk: "semua",
    salesIds: [],
    aktif: true,
    ...o,
  });

  it("tanpa event pakai % normal", () => {
    expect(bagiHasilBerlaku(sales, "2026-10-10", [ev({})])).toEqual({ persen: 60, eventId: null, tambahan: 0 });
  });
  it("event menambah porsi sales 40 → 46, kantor 60 → 54", () => {
    expect(bagiHasilBerlaku(sales, "2026-11-05", [ev({ id: "akhir-tahun" })])).toEqual({
      persen: 54,
      eventId: "akhir-tahun",
      tambahan: 15,
    });
  });
  it("event bersamaan → tambahan terbesar, tidak dijumlahkan", () => {
    const r = bagiHasilBerlaku(sales, "2026-11-05", [ev({ id: "a", tambahanKomisiPersen: 10 }), ev({ id: "b", tambahanKomisiPersen: 25 })]);
    expect(r).toEqual({ persen: 50, eventId: "b", tambahan: 25 });
  });
  it("event freelance tidak berlaku untuk fulltime", () => {
    expect(bagiHasilBerlaku(sales, "2026-11-05", [ev({ berlakuUntuk: "freelance" })]).eventId).toBeNull();
  });
  it("event pilihan hanya untuk sales terpilih", () => {
    expect(bagiHasilBerlaku(sales, "2026-11-05", [ev({ berlakuUntuk: "pilihan", salesIds: ["s1"] })]).persen).toBe(54);
    expect(bagiHasilBerlaku(sales, "2026-11-05", [ev({ berlakuUntuk: "pilihan", salesIds: ["s2"] })]).persen).toBe(60);
  });
});

describe("hitungGaji — tabel di dokumen", () => {
  it.each([
    [40, 800_000],
    [25, 500_000],
    [50, 1_000_000],
    [130, 1_000_000],
    [0, 0],
  ])("pencapaian %i%% → Rp %i", (p, gaji) => {
    expect(hitungGaji(1_000_000, p).gajiDibayar).toBe(gaji);
  });
  it("DetailSales Jan: 20/50 case = 40% dari 4,5 jt → 3,6 jt", () => {
    expect(hitungGaji(4_500_000, pencapaianPersen(20, 50)).gajiDibayar).toBe(3_600_000);
  });
});

describe("journey", () => {
  it("nomor langkah", () => {
    expect(nomorLangkah("draft_prospek")).toBe(1);
    expect(nomorLangkah("selesai")).toBe(12);
    expect(nomorLangkah("perlu_revisi")).toBeNull();
  });
  it("transisi", () => {
    expect(transisiSah("draft_prospek", "data_lengkap")).toBe(true);
    expect(transisiSah("dikirim_ke_asuransi", "penawaran_masuk")).toBe(true); // survei dilewati
    expect(transisiSah("draft_prospek", "polis_terbit")).toBe(false);
    expect(transisiSah("penawaran_masuk", "perlu_revisi")).toBe(true);
    expect(transisiSah("perlu_revisi", "draft_prospek")).toBe(true);
    expect(transisiSah("selesai", "batal_nasabah")).toBe(false);
  });
  it("langkah versi nasabah", () => {
    expect(langkahNasabah({ status: "data_lengkap", tglTransferNasabah: null })).toBe(1);
    expect(langkahNasabah({ status: "survei_kendaraan", tglTransferNasabah: null })).toBe(2);
    expect(langkahNasabah({ status: "polis_terbit", tglTransferNasabah: null })).toBe(4);
    expect(langkahNasabah({ status: "menunggu_bayar", tglTransferNasabah: null })).toBe(5);
    expect(langkahNasabah({ status: "cashback_cair", tglTransferNasabah: null })).toBe(6);
    expect(langkahNasabah({ status: "cashback_cair", tglTransferNasabah: "2026-10-20" })).toBe(7);
  });
  it("plat disamarkan", () => {
    expect(samarkanPlat("D 1234 ABC")).toBe("D 12** ABC");
    expect(samarkanPlat("b1777tp")).toBe("B 17** TP");
  });
});

describe("normalisasiNoWa", () => {
  it.each([
    ["0812-3456-7890", "6281234567890"],
    ["+62 812 3456 7890", "6281234567890"],
    ["812 3456 7890", "6281234567890"],
    ["6281234567890", "6281234567890"],
  ])("%s → %s", (a, b) => expect(normalisasiNoWa(a)).toBe(b));
  it("menolak nomor tidak valid", () => {
    expect(normalisasiNoWa("12345")).toBeNull();
  });
});

describe("normalisasiPlat", () => {
  it.each([
    ["d1234abc", "D 1234 ABC"],
    ["B  12 XY", "B 12 XY"],
    ["AB-1-C", "AB 1 C"],
    ["L 1", "L 1"],
  ])("%s → %s", (a, b) => expect(normalisasiPlat(a)).toBe(b));
  it.each(["1234", "ABC 1234 D", "D 12345 A", ""])("menolak %s", (a) => expect(normalisasiPlat(a)).toBeNull());
});

describe("template pesan", () => {
  it("mengisi variabel, membiarkan yang tidak dikenal", () => {
    expect(renderTemplate("Halo {sapaan} {nama}, {x}", { sapaan: "Bapak/Ibu", nama: "Budi" })).toBe("Halo Bapak/Ibu Budi, {x}");
  });
  it("sapaan kosong untuk badan usaha dirapikan", () => {
    expect(rapikan(renderTemplate("Halo {sapaan} {nama}, ok", { sapaan: "", nama: "PT Maju" }).replace("{sapaan}", ""))).toBe("Halo PT Maju, ok");
  });
});
