// Templat paket coverage umum; dipakai tombol "Tambah paket standar" di master asuransi.
// Setiap asuransi tetap bisa mengubah nama & cakupannya sendiri.
const DASAR = "Tabrakan, benturan, terperosok, tergelincir, kehilangan, kebakaran, pencurian";

export const PAKET_STANDAR = [
  { nama: "Biasa", urutan: 1, cakupan: [DASAR, "Tuntutan pihak ke-3"] },
  {
    nama: "Plus",
    urutan: 2,
    cakupan: [DASAR, "Banjir, badai, angin topan, hujan es, tanah longsor", "Kerusuhan, huru-hara", "Tuntutan pihak ke-3"],
  },
  {
    nama: "Complete",
    urutan: 3,
    cakupan: [
      DASAR,
      "Banjir, badai, angin topan, hujan es, tanah longsor",
      "Gempa bumi, tsunami, letusan gunung berapi",
      "Kerusuhan, huru-hara",
      "Terorisme, sabotase",
      "Tuntutan pihak ke-3",
      "Personal accident sopir & 4 penumpang",
    ],
  },
];
