import Link from "next/link";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import clsx from "clsx";
import { db } from "@/db";
import {
  bengkel,
  dokumen,
  eventBagiHasil,
  klaim,
  polis,
  remindPerpanjangan,
  waLog,
  kategoriPolis,
  kendaraan,
  kirimAsuransiLog,
  kontakAsuransi,
  nasabah,
  penawaran,
  perusahaanAsuransi,
  rekening,
  statusHistory,
  users,
  type StatusPengajuan,
} from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { polisMilik } from "@/lib/akses";
import { FormAksi } from "@/components/form-aksi";
import { Isian, Kartu, KepalaHalaman, Kosong, Lencana, Pilihan } from "@/components/ui";
import { BarJourney, LencanaStatus } from "@/components/journey";
import { LANGKAH, STATUS_DITUTUP, nomorLangkah, labelStatus } from "@/lib/domain/journey";
import { bagiHasilBerlaku } from "@/lib/domain/komisi";
import { persen, rupiah } from "@/lib/format";
import { cekKelengkapan, trackerAktif, urlTracker, MIN_FOTO_KENDARAAN } from "@/lib/pengajuan";
import { PilihPenawaran } from "./pilih-penawaran";
import { IsianRupiah } from "@/components/isian-rupiah";
import { siapkanOpsi } from "./opsi-penawaran";
import { DOK_KHUSUS_ADMIN } from "@/lib/akses";
import { RincianKomisi } from "@/components/rincian-komisi";
import { MASA_PERLU_DIURUS, STATUS_TERBIT, perpanjanganDari } from "@/lib/perpanjangan";
import { sisaHari, waktuWib } from "@/lib/domain/perpanjangan";
import { perpanjang, remindManual } from "../../perpanjangan/actions";
import { LABEL_KLAIM } from "../../klaim/galeri";
import { FormPenawaran } from "./form-penawaran";
import {
  ajukan,
  bagikanTracker,
  batalkanPersetujuan,
  hapusPenawaran,
  ubahPenawaran,
  buatUlangTracker,
  cabutTracker,
  catatCair,
  catatSetor,
  catatSurvei,
  catatTransfer,
  kirimInstruksi,
  kirimKeAsuransi,
  setujuiPenawaran,
  tambahPenawaran,
  tandaiLunas,
  terbitkanPolis,
  ubahCabang,
  simpanNilaiPertanggungan,
} from "../actions";

const hariIni = () => new Date().toISOString().slice(0, 10);
const tglJam = (d: Date) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
const tgl = (d: string | null) =>
  d ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d + "T00:00:00")) : "–";

const kelasFile =
  "w-full text-sm text-ink-2 file:mr-3 file:h-9 file:rounded-full file:border-0 file:bg-brand-soft file:px-4 file:text-sm file:font-semibold file:text-brand-ink";

function InputFile({ label, name, wajib = false, pdf = false }: { label: string; name: string; wajib?: boolean; pdf?: boolean }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
      {label}
      <input type="file" name={name} required={wajib} accept={pdf ? "application/pdf" : "image/*,application/pdf"} className={kelasFile} />
    </label>
  );
}

/** Catatan riwayat versi sales: nominal pencairan dari asuransi tidak ditampilkan. */
function catatanUntuk(status: StatusPengajuan, catatan: string, admin: boolean) {
  if (admin || status !== "cashback_cair") return catatan;
  return catatan.replace(/\s*Rp\s?[\d.]+/g, "").replace(/^Cair\b/, "Dana asuransi cair");
}

export default async function DetailPengajuan({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await wajibLogin();
  const { id } = await params;
  const p = await polisMilik(user, id);
  const admin = user.role === "admin";
  const s: StatusPengajuan = p.statusPengajuan;
  const n = nomorLangkah(s);

  const [[info], riwayat, daftarPenawaran, kirimLog, dokPolis, asuransiList, rekeningBayar, kategori, tracker, kelengkapan] =
    await Promise.all([
      db
        .select({ n: nasabah, k: kendaraan, sales: users, a: perusahaanAsuransi, kat: kategoriPolis, r: rekening, ev: eventBagiHasil })
        .from(nasabah)
        .innerJoin(kendaraan, eq(kendaraan.id, p.kendaraanId))
        .innerJoin(users, eq(users.id, p.salesId))
        .leftJoin(perusahaanAsuransi, eq(perusahaanAsuransi.id, sql`${p.perusahaanId}`))
        .leftJoin(kategoriPolis, eq(kategoriPolis.id, sql`${p.kategoriId}`))
        .leftJoin(rekening, eq(rekening.id, sql`${p.rekeningPembayaranId}`))
        .leftJoin(eventBagiHasil, eq(eventBagiHasil.id, sql`${p.eventId}`))
        .where(eq(nasabah.id, p.nasabahId)),
      db
        .select({ h: statusHistory, oleh: users.nama })
        .from(statusHistory)
        .leftJoin(users, eq(users.id, statusHistory.oleh))
        .where(eq(statusHistory.polisId, id))
        .orderBy(asc(statusHistory.waktu)),
      db
        .select({ pw: penawaran, asuransi: perusahaanAsuransi.nama, paket: kategoriPolis.nama, cakupan: kategoriPolis.cakupan })
        .from(penawaran)
        .innerJoin(perusahaanAsuransi, eq(perusahaanAsuransi.id, penawaran.perusahaanId))
        .leftJoin(kategoriPolis, eq(kategoriPolis.id, penawaran.kategoriId))
        .where(eq(penawaran.polisId, id))
        .orderBy(asc(perusahaanAsuransi.nama), asc(kategoriPolis.urutan), asc(penawaran.premi)),
      db
        .select({ l: kirimAsuransiLog, asuransi: perusahaanAsuransi.nama })
        .from(kirimAsuransiLog)
        .innerJoin(perusahaanAsuransi, eq(perusahaanAsuransi.id, kirimAsuransiLog.perusahaanId))
        .where(and(eq(kirimAsuransiLog.polisId, id), admin ? undefined : eq(kirimAsuransiLog.jenis, "data")))
        .orderBy(desc(kirimAsuransiLog.waktu)),
      db
        .select()
        .from(dokumen)
        .where(and(eq(dokumen.pemilikTipe, "polis"), eq(dokumen.pemilikId, id)))
        .orderBy(asc(dokumen.dibuat)),
      admin
        ? db
            .select({
              a: perusahaanAsuransi,
              email: sql<number>`(select count(*) from ${kontakAsuransi} k where k.perusahaan_id = ${perusahaanAsuransi.id} and k.email is not null)`.mapWith(Number),
              wa: sql<number>`(select count(*) from ${kontakAsuransi} k where k.perusahaan_id = ${perusahaanAsuransi.id} and k.no_wa is not null)`.mapWith(Number),
            })
            .from(perusahaanAsuransi)
            .where(eq(perusahaanAsuransi.aktif, true))
            .orderBy(asc(perusahaanAsuransi.nama))
        : Promise.resolve([]),
      db
        .select()
        .from(rekening)
        .where(and(eq(rekening.pemilikTipe, "pembayaran"), eq(rekening.aktif, true)))
        .orderBy(desc(rekening.utama)),
      db.select().from(kategoriPolis).orderBy(asc(kategoriPolis.urutan), asc(kategoriPolis.nama)),
      trackerAktif(id),
      cekKelengkapan(p),
    ]);
  const terbit = (STATUS_TERBIT as readonly string[]).includes(s);
  const [polisLama, lanjutan, riwayatRemind, daftarKlaim] = await Promise.all([
    p.polisSebelumnyaId
      ? db.select({ id: polis.id, noPolis: polis.noPolis, kode: polis.kode, tglAkhir: polis.tglAkhir }).from(polis).where(eq(polis.id, p.polisSebelumnyaId)).then((r) => r[0] ?? null)
      : Promise.resolve(null),
    terbit ? perpanjanganDari(id) : Promise.resolve(null),
    terbit
      ? db
          .select({ r: remindPerpanjangan, status: waLog.status, oleh: users.nama })
          .from(remindPerpanjangan)
          .leftJoin(waLog, eq(waLog.id, remindPerpanjangan.waLogId))
          .leftJoin(users, eq(users.id, remindPerpanjangan.oleh))
          .where(eq(remindPerpanjangan.polisId, id))
          .orderBy(desc(remindPerpanjangan.dibuat))
      : Promise.resolve([]),
    terbit
      ? db
          .select({
            k: klaim,
            bengkel: bengkel.nama,
            foto: sql<number>`(select count(*) from dokumen d where d.pemilik_tipe = 'klaim' and d.pemilik_id = ${klaim.id})`.mapWith(Number),
          })
          .from(klaim)
          .leftJoin(bengkel, eq(bengkel.id, klaim.bengkelId))
          .where(eq(klaim.polisId, id))
          .orderBy(desc(klaim.tglKlaim))
      : Promise.resolve([]),
  ]);
  const sisa = p.tglAkhir ? sisaHari(p.tglAkhir, waktuWib().tanggal) : null;
  const masaDiurus = terbit && !!p.statusMasa && (MASA_PERLU_DIURUS as readonly string[]).includes(p.statusMasa);

  const events = s === "penawaran_masuk" ? await db.select().from(eventBagiHasil).where(eq(eventBagiHasil.aktif, true)) : [];
  const bh = bagiHasilBerlaku(info.sales, p.tglInput.toISOString().slice(0, 10), events);
  const namaEvent = bh.eventId ? (events.find((e) => e.id === bh.eventId)?.nama ?? null) : null;

  const terakhirLangkah = n ?? Math.max(0, ...riwayat.map((r) => nomorLangkah(r.h.status) ?? 0));
  const waktuLangkah = new Map<StatusPengajuan, Date>();
  for (const r of riwayat) waktuLangkah.set(r.h.status, r.h.waktu);
  const ditutup = STATUS_DITUTUP.includes(s);
  const sebelumTerbit = (n ?? 0) < 7;
  // Dokumen yang memuat angka dari asuransi (file penawaran, bukti pencairan) hanya untuk admin.
  const dokTerlihat = admin ? dokPolis : dokPolis.filter((d) => !DOK_KHUSUS_ADMIN.includes(d.jenis));
  const buktiNasabah = dokPolis.filter((d) => d.jenis === "bukti_bayar_nasabah" && !d.diuploadOleh);
  const bolehUbahPenawaran = ["dikirim_ke_asuransi", "survei_kendaraan", "penawaran_masuk"].includes(s);

  // ─── Panel tindakan sesuai status & peran ───
  const panel: React.ReactNode[] = [];
  const tunggu = (teks: string) =>
    panel.push(
      <p key={`t${panel.length}`} className="rounded-xl bg-canvas px-4 py-3 text-sm text-ink-2">
        {teks}
      </p>,
    );

  if (s === "draft_prospek" || s === "perlu_revisi") {
    panel.push(
      <div key="draft" className="flex flex-col gap-4">
        <div className="rounded-2xl border border-line p-4">
          <h3 className="mb-2 text-sm font-bold">Kelengkapan dokumen</h3>
          {kelengkapan.lengkap ? (
            <p className="text-sm text-ok">KTP, STNK, dan foto kendaraan {MIN_FOTO_KENDARAAN} sisi sudah lengkap.</p>
          ) : (
            <p className="text-sm text-warn">
              Kurang: {kelengkapan.kurang.join(", ")}.{" "}
              <Link href={`/nasabah/${p.nasabahId}`} className="font-semibold text-brand underline">
                Upload di halaman nasabah
              </Link>
            </p>
          )}
        </div>
        <FormAksi aksi={ajukan.bind(null, id)} tombol="Ajukan ke admin">
          <p className="text-sm text-ink-2">Pengajuan pindah ke status Data lengkap dan admin bisa mengirimnya ke asuransi.</p>
        </FormAksi>
      </div>,
    );
  }

  if (["data_lengkap", "dikirim_ke_asuransi", "survei_kendaraan", "penawaran_masuk"].includes(s)) {
    if (admin) {
      panel.push(
        <details key="kirim" open={s === "data_lengkap"} className="rounded-2xl border border-line p-4">
          <summary className="cursor-pointer text-sm font-bold">
            {s === "data_lengkap" ? "Kirim data ke asuransi" : "Kirim ke asuransi lain"}
          </summary>
          <div className="pt-4">
            <FormAksi aksi={kirimKeAsuransi.bind(null, id)} tombol="Kirim">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-[13px] font-semibold text-ink-2">Asuransi tujuan</legend>
                {asuransiList.map(({ a, email, wa }) => (
                  <label key={a.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm has-[:checked]:border-ink">
                    <span className="flex items-center gap-2">
                      <input type="checkbox" name="perusahaanId" value={a.id} defaultChecked={asuransiList.length === 1} className="accent-ink" />
                      {a.nama}
                    </span>
                    <span className="flex gap-1">
                      <Lencana nada={email ? "ok" : "warn"}>EMAIL {email ? "✓" : "–"}</Lencana>
                      <Lencana nada={wa ? "ok" : "warn"}>WA {wa ? "✓" : "–"}</Lencana>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="kanal" value="email" defaultChecked className="accent-ink" /> Email (lampiran dokumen)
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="kanal" value="wa" defaultChecked className="accent-ink" /> WhatsApp (link dokumen)
                </label>
              </div>
            </FormAksi>
          </div>
        </details>,
      );
    } else if (s === "data_lengkap") tunggu("Menunggu admin mengirim data ke asuransi.");
  }

  if (s === "dikirim_ke_asuransi" && admin) {
    panel.push(
      <details key="survei" className="rounded-2xl border border-line p-4">
        <summary className="cursor-pointer text-sm font-bold">Catat survei kendaraan (opsional)</summary>
        <div className="pt-4">
          <FormAksi aksi={catatSurvei.bind(null, id)} tombol="Simpan survei" varian="kedua">
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <Isian label="Tanggal survei" name="tglSurvei" type="date" defaultValue={hariIni()} required />
              <Isian label="Hasil" name="hasil" placeholder="Kondisi baik, tanpa catatan" />
            </div>
          </FormAksi>
        </div>
      </details>,
    );
  }
  if (["dikirim_ke_asuransi", "survei_kendaraan", "penawaran_masuk", "disetujui_nasabah"].includes(s) && admin) {
    panel.push(
      <details key="tsi" open={!p.nilaiPertanggungan} className="rounded-2xl border border-line p-4" data-uji="panel-tsi">
        <summary className="cursor-pointer text-sm font-bold">
          Nilai pertanggungan dari asuransi{p.nilaiPertanggungan ? ` · ${rupiah(p.nilaiPertanggungan)}` : ""}
        </summary>
        <div className="pt-4">
          <FormAksi aksi={simpanNilaiPertanggungan.bind(null, id)} tombol="Simpan nilai pertanggungan" varian="kedua">
            <IsianRupiah
              label="Nilai pertanggungan / TSI"
              name="nilaiPertanggungan"
              placeholder="415.000.000"
              defaultValue={p.nilaiPertanggungan ?? ""}
              hint="Sesuai taksiran asuransi. Wajib diisi sebelum polis diterbitkan."
              required
              className="max-w-sm"
            />
          </FormAksi>
        </div>
      </details>,
    );
  }
  if ((s === "dikirim_ke_asuransi" || s === "survei_kendaraan") && !admin) tunggu("Menunggu taksiran nilai pertanggungan & penawaran dari asuransi.");

  if (["dikirim_ke_asuransi", "survei_kendaraan", "penawaran_masuk"].includes(s) && admin) {
    panel.push(
      <details key="penawaran" open={s !== "penawaran_masuk"} className="rounded-2xl border border-line p-4">
        <summary className="cursor-pointer text-sm font-bold">Input penawaran dari asuransi</summary>
        <div className="pt-4">
          <FormPenawaran
            aksi={tambahPenawaran.bind(null, id)}
            asuransi={asuransiList.map(({ a }) => ({
              id: a.id,
              nama: a.nama,
              paket: kategori.filter((k) => k.perusahaanId === a.id && k.aktif).map((k) => ({ id: k.id, nama: k.nama })),
            }))}
          />
        </div>
      </details>,
    );
  }

  if (s === "penawaran_masuk") {
    panel.push(
      <div key="setuju" className="rounded-2xl border border-line p-4">
        <h3 className="mb-1 text-sm font-bold">Persetujuan nasabah</h3>
        <p className="mb-3 text-[13px] text-ink-3">
          {p.pilihanNasabahId
            ? "Nasabah sudah memilih paket lewat link tracker. Periksa, atur cashback, lalu konfirmasi."
            : "Nasabah juga bisa memilih sendiri lewat link tracker; pilihannya akan ditandai di sini."}
        </p>
        <PilihPenawaran
          aksi={setujuiPenawaran.bind(null, id)}
          opsi={siapkanOpsi(
            daftarPenawaran.map(({ pw, asuransi, paket, cakupan }) => ({
              id: pw.id,
              asuransi,
              paket,
              cakupan: cakupan ?? [],
              premi: pw.premi,
              cashbackTotalPersen: pw.cashbackTotalPersen,
            })),
            { admin, maksCashback: info.sales.maksCashbackNasabahPersen, kantorBerlaku: bh.persen, kantorNormal: info.sales.bagiHasilKantorPersen },
          )}
          admin={admin}
          kantor={admin ? { berlaku: bh.persen, normal: info.sales.bagiHasilKantorPersen } : undefined}
          namaEvent={namaEvent}
          tambahanEvent={bh.tambahan}
          pilihanNasabahId={p.pilihanNasabahId}
        />
      </div>,
    );
  }

  if (s === "disetujui_nasabah") {
    panel.push(
      <details key="batalSetuju" className="order-last rounded-2xl border border-line p-4">
        <summary className="cursor-pointer text-sm font-semibold text-brand">Salah pilih paket? Batalkan persetujuan</summary>
        <div className="pt-3">
          <FormAksi aksi={batalkanPersetujuan.bind(null, id)} tombol="Batalkan persetujuan" varian="bahaya">
            <p className="text-[13px] text-ink-2">
              Status kembali ke Penawaran masuk dan komisi dihapus; penawaran bisa diubah lalu dipilih ulang.
            </p>
            <Isian label="Alasan" name="alasan" required />
          </FormAksi>
        </div>
      </details>,
    );
    if (admin) {
      panel.push(
        <div key="terbit" className="rounded-2xl border border-line p-4">
          <h3 className="mb-3 text-sm font-bold">Polis terbit</h3>
          <FormAksi aksi={terbitkanPolis.bind(null, id)} tombol="Simpan polis terbit">
            <div className="grid gap-3 sm:grid-cols-3">
              <Isian label="No. polis" name="noPolis" required className="sm:col-span-3" />
              <Isian label="Mulai" name="tglMulai" type="date" required defaultValue={hariIni()} />
              <Isian label="Berakhir" name="tglAkhir" type="date" required />
              <Isian label="Batas bayar nasabah" name="batasBayar" type="date" required />
            </div>
            <Pilihan label="Rekening pembayaran" name="rekeningPembayaranId" required defaultValue={rekeningBayar[0]?.id ?? ""}>
              {rekeningBayar.length === 0 && (
                <option value="" disabled>
                  Belum ada — tambah di Master data
                </option>
              )}
              {rekeningBayar.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.namaBank} {r.noRekening} a.n. {r.atasNama}
                </option>
              ))}
            </Pilihan>
            <InputFile label="PDF polis dari asuransi" name="filePolis" wajib pdf />
            <label className="flex items-center gap-2.5 text-sm text-ink-2">
              <input type="checkbox" name="kirimOtomatis" defaultChecked className="size-4 accent-brand" />
              Langsung kirim instruksi pembayaran + PDF polis ke WhatsApp nasabah
            </label>
          </FormAksi>
        </div>,
      );
    } else tunggu("Menunggu admin menginput polis terbit dari asuransi.");
  }

  if (s === "polis_terbit" || s === "menunggu_bayar") {
    panel.push(
      <div key="bayar" className="flex flex-col gap-3 rounded-2xl border border-line p-4">
        <h3 className="text-sm font-bold">Pembayaran nasabah</h3>
        <p className="text-sm text-ink-2">
          {rupiah(p.premiBruto)} ke {info.r ? `${info.r.namaBank} ${info.r.noRekening} a.n. ${info.r.atasNama}` : "–"}, batas {tgl(p.batasBayar)}.
        </p>
        <FormAksi aksi={kirimInstruksi.bind(null, id)} tombol={s === "menunggu_bayar" ? "Kirim ulang instruksi" : "Kirim instruksi pembayaran"} varian="kedua">
          <span className="text-[13px] text-ink-3">Dikirim dari WhatsApp kantor dengan PDF polis terlampir; cadangan wa.me bila nomor kantor terputus.</span>
        </FormAksi>
        {buktiNasabah.length > 0 && (
          <div className="flex flex-col gap-2 rounded-2xl bg-ok-soft p-3.5">
            <span className="text-[13px] font-bold text-ok">Bukti transfer dari nasabah ({buktiNasabah.length})</span>
            <ul className="flex flex-wrap gap-2">
              {buktiNasabah.map((d) => (
                <li key={d.id}>
                  <a
                    href={`/api/dokumen/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                    title={`Diupload ${tglJam(d.dibuat)}`}
                    className="flex size-20 items-center justify-center overflow-hidden rounded-xl border border-line bg-white text-[11px] font-bold text-bad"
                  >
                    {d.fileKey.endsWith(".pdf") ? (
                      "PDF"
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/dokumen/${d.id}`} alt="Bukti transfer" className="size-full object-cover" />
                    )}
                  </a>
                </li>
              ))}
            </ul>
            <span className="text-xs text-ok">Cocokkan nominal & rekening tujuan, lalu tandai lunas di bawah.</span>
          </div>
        )}
        <details open={buktiNasabah.length > 0} className="border-t border-line pt-3">
          <summary className="cursor-pointer text-sm font-semibold text-brand">Tandai lunas</summary>
          <div className="pt-3">
            <FormAksi aksi={tandaiLunas.bind(null, id)} tombol="Tandai lunas">
              <Isian label="Tanggal bayar" name="tglBayar" type="date" required defaultValue={hariIni()} className="max-w-[220px]" />
              <InputFile
                label={buktiNasabah.length ? "Bukti transfer lain (opsional — bukti dari nasabah sudah ada)" : "Bukti transfer nasabah"}
                name="bukti"
                wajib={buktiNasabah.length === 0}
              />
            </FormAksi>
          </div>
        </details>
      </div>,
    );
  }

  if (["lunas", "premi_disetor", "cashback_cair"].includes(s)) {
    if (admin) {
      if (s === "lunas")
        panel.push(
          <div key="setor" className="rounded-2xl border border-line p-4">
            <h3 className="mb-3 text-sm font-bold">Setor premi ke asuransi</h3>
            <FormAksi aksi={catatSetor.bind(null, id)} tombol="Catat setoran" varian="kedua">
              <Isian label="Tanggal setor" name="tglSetor" type="date" required defaultValue={hariIni()} className="max-w-[220px]" />
            </FormAksi>
          </div>,
        );
      if (s === "premi_disetor")
        panel.push(
          <div key="cair" className="rounded-2xl border border-line p-4">
            <h3 className="mb-3 text-sm font-bold">Cashback cair dari asuransi</h3>
            <FormAksi aksi={catatCair.bind(null, id)} tombol="Catat pencairan" varian="kedua">
              <div className="grid gap-3 sm:grid-cols-2">
                <Isian label="Tanggal cair" name="tglCair" type="date" required defaultValue={hariIni()} />
                <IsianRupiah label="Nominal cair" name="nominal" required defaultValue={p.cashbackTotalRp ?? ""} />
              </div>
              <InputFile label="Bukti (opsional)" name="bukti" />
            </FormAksi>
          </div>,
        );
      if (!p.tglTransferNasabah)
        panel.push(
          <div key="trfNasabah" className="rounded-2xl border border-line p-4">
            <h3 className="mb-1 text-sm font-bold">Transfer cashback ke nasabah · {rupiah(p.cashbackNasabahRp)}</h3>
            <p className="mb-3 text-[13px] text-ink-3">Nasabah mendapat WhatsApp konfirmasi.</p>
            <FormAksi aksi={catatTransfer.bind(null, id, "nasabah")} tombol="Catat transfer" varian="kedua">
              <Isian label="Tanggal transfer" name="tgl" type="date" required defaultValue={hariIni()} className="max-w-[220px]" />
              <InputFile label="Bukti transfer (opsional)" name="bukti" />
            </FormAksi>
          </div>,
        );
      if (s === "cashback_cair" && !p.tglTransferSales)
        panel.push(
          <div key="trfSales" className="rounded-2xl border border-line p-4">
            <h3 className="mb-3 text-sm font-bold">Transfer komisi ke {info.sales.nama}</h3>
            <div className="mb-3 rounded-2xl bg-canvas p-3">
              <RincianKomisi
                total={p.komisiSalesRp ?? 0}
                event={p.komisiEventRp ?? 0}
                namaEvent={info.ev?.nama}
                tambahanPersen={info.ev?.tambahanKomisiPersen}
                porsiSalesNormal={p.bagiHasilKantorNormalPersen != null ? 100 - p.bagiHasilKantorNormalPersen : null}
                besar={false}
              />
            </div>
            <FormAksi aksi={catatTransfer.bind(null, id, "sales")} tombol="Catat transfer komisi" varian="kedua">
              <Isian label="Tanggal transfer" name="tgl" type="date" required defaultValue={hariIni()} className="max-w-[220px]" />
              <InputFile label="Bukti transfer (opsional)" name="bukti" />
            </FormAksi>
          </div>,
        );
    } else tunggu(`Menunggu admin: ${s === "lunas" ? "setor premi ke asuransi" : s === "premi_disetor" ? "pencairan dana dari asuransi" : "transfer komisi"}.`);
  }

  if (s === "selesai") tunggu(`Selesai: cashback nasabah dan ${admin ? "komisi sales" : "komisi Anda"} sudah ditransfer.`);
  if (s === "ditolak_asuransi" || s === "batal_nasabah" || s === "batal_salah_input") {
    const akhir = riwayat.at(-1);
    tunggu(`${labelStatus(s)}${akhir?.h.catatan ? ` — ${catatanUntuk(akhir.h.status, akhir.h.catatan, admin)}` : ""}`);
  }

  // Tindakan cabang
  const bolehRevisi = admin && ["data_lengkap", "dikirim_ke_asuransi", "survei_kendaraan", "penawaran_masuk"].includes(s);
  const bolehTolak = admin && !ditutup && sebelumTerbit;
  const bolehBatal = !ditutup && (n ?? 0) < 9;
  // Salah input: sebelum polis terbit, oleh sales pemilik atau admin.
  const bolehSalahInput = !ditutup && sebelumTerbit;

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Pengajuan", href: "/pengajuan" }, { label: p.kode }]}
        judul={info.n.nama}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <LencanaStatus status={s} />
            {info.k.merek} {info.k.model} · {info.k.noPolisi}
            {admin && ` · sales ${info.sales.nama}`}
          </span>
        }
        aksi={
          <Link href={`/nasabah/${p.nasabahId}`} className="inline-flex h-10 items-center rounded-full border border-line-2 bg-white px-5 text-sm font-semibold">
            Data nasabah
          </Link>
        }
      />
      <BarJourney status={s} terakhir={terakhirLangkah} />
      {polisLama && (
        <p className="-mt-2 flex flex-wrap items-center gap-2 rounded-2xl border border-brand-soft bg-brand-soft/40 px-4 py-2.5 text-sm" data-uji="banner-perpanjangan">
          <Lencana nada="brand">PERPANJANGAN</Lencana>
          dari polis
          <Link href={`/pengajuan/${polisLama.id}`} className="font-semibold text-brand">
            {polisLama.noPolis ?? polisLama.kode}
          </Link>
          {polisLama.tglAkhir && <span className="text-ink-3">(berakhir {polisLama.tglAkhir})</span>}
          {p.nasabahSetujuPerpanjangan && <Lencana nada="ok">NASABAH SETUJU VIA WHATSAPP</Lencana>}
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[1.25fr_1fr]">
        <div className="flex flex-col gap-4">
          <Kartu className="flex flex-col gap-4">
            <h2 className="text-base font-bold">{ditutup ? "Status" : "Tindakan berikutnya"}</h2>
            {panel.length ? panel : <Kosong>Tidak ada tindakan.</Kosong>}
          </Kartu>

          {daftarPenawaran.length > 0 && (
            <Kartu className="flex flex-col gap-2">
              <h2 className="text-base font-bold">Penawaran</h2>
              <ul className="flex flex-col divide-y divide-line text-sm">
                {daftarPenawaran.map(({ pw, asuransi, paket }) => (
                  <li key={pw.id} className="flex flex-col gap-2 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <b>{asuransi}</b> {paket && <span className="font-semibold text-brand-ink">· {paket}</span>}{" "}
                      {pw.dipilih && <Lencana nada="ok">DIPILIH</Lencana>}
                      {!pw.dipilih && pw.id === p.pilihanNasabahId && <Lencana nada="ok">PILIHAN NASABAH</Lencana>}
                      {admin && (
                      <span className="block text-[13px] text-ink-3">
                        cashback {persen(pw.cashbackTotalPersen)}
                        {pw.catatan && ` · ${pw.catatan}`}
                        {pw.dokumenId && (
                          <>
                            {" · "}
                            <a href={`/api/dokumen/${pw.dokumenId}`} target="_blank" rel="noreferrer" className="font-semibold text-brand">
                              file
                            </a>
                          </>
                        )}
                      </span>
                      )}
                    </span>
                    <span className="font-bold">{rupiah(pw.premi)}</span>
                    </div>
                    {admin && bolehUbahPenawaran && (
                      <div className="flex flex-wrap items-start gap-x-4">
                        <details className="w-full sm:w-auto sm:flex-1">
                          <summary className="cursor-pointer text-[12px] font-semibold text-brand">Ubah</summary>
                          <div className="pt-3">
                            <FormAksi aksi={ubahPenawaran.bind(null, id, pw.id)} tombol="Simpan" varian="kedua">
                              <div className="grid gap-3 sm:grid-cols-3">
                                <Pilihan label="Paket" name="kategoriId" defaultValue={pw.kategoriId ?? ""}>
                                  <option value="">Tanpa paket</option>
                                  {kategori
                                    .filter((k) => k.perusahaanId === pw.perusahaanId && (k.aktif || k.id === pw.kategoriId))
                                    .map((k) => (
                                      <option key={k.id} value={k.id}>
                                        {k.nama}
                                      </option>
                                    ))}
                                </Pilihan>
                                <IsianRupiah label="Premi" name="premi" defaultValue={pw.premi} required />
                                <Isian label="Cashback total (%)" name="cashbackTotalPersen" inputMode="decimal" defaultValue={String(pw.cashbackTotalPersen)} required />
                              </div>
                              <Isian label="Catatan internal (tidak terlihat sales)" name="catatan" defaultValue={pw.catatan ?? ""} />
                            </FormAksi>
                          </div>
                        </details>
                        <form action={hapusPenawaran.bind(null, id, pw.id)}>
                          <button className="text-[12px] font-semibold text-bad">Hapus</button>
                        </form>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Kartu>
          )}

          {(bolehRevisi || bolehTolak || bolehBatal || bolehSalahInput) && (
            <Kartu>
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-bad">
                  {admin ? "Perlu revisi / ditolak / batal" : "Batalkan pengajuan"}
                </summary>
                <div className="pt-4">
                  <FormAksi aksi={ubahCabang.bind(null, id)} tombol="Simpan" varian="bahaya">
                    <Pilihan label="Status" name="ke" defaultValue={bolehRevisi ? "perlu_revisi" : "batal_nasabah"}>
                      {bolehRevisi && <option value="perlu_revisi">Perlu revisi (data diminta asuransi)</option>}
                      {bolehTolak && <option value="ditolak_asuransi">Ditolak asuransi</option>}
                      {bolehBatal && <option value="batal_nasabah">Batal (nasabah tidak jadi)</option>}
                      {bolehSalahInput && <option value="batal_salah_input">Batalkan karena salah input data</option>}
                    </Pilihan>
                    <Isian label="Alasan / catatan" name="catatan" required placeholder="Mis. salah pilih kendaraan, nasabah dobel" />
                    {bolehSalahInput && (
                      <p className="text-[13px] text-ink-3">
                        Salah input: pengajuan ditutup tanpa dihitung sebagai nasabah batal, link tracker dicabut, dan Anda bisa membuat pengajuan baru
                        dengan data yang benar.
                      </p>
                    )}
                  </FormAksi>
                </div>
              </details>
            </Kartu>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {p.premiBruto != null && (
            <section className="flex flex-col gap-3 rounded-[20px] bg-ink p-5 text-white">
              <span className="text-[11px] font-semibold tracking-[0.08em] text-[#A9B0C2]">
                RINGKASAN {info.a ? `· ${info.a.nama.toUpperCase()}` : ""}
                {info.kat && ` · PAKET ${info.kat.nama.toUpperCase()}`}
                {info.ev && ` · EVENT ${info.ev.nama.toUpperCase()} (KOMISI +${persen(info.ev.tambahanKomisiPersen)})`}
              </span>
              <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
                <dt className="text-[#A9B0C2]">Premi bruto</dt>
                <dd className="text-right text-base font-bold">{rupiah(p.premiBruto)}</dd>
                {admin && (
                  <>
                    <dt className="text-[#A9B0C2]">Cashback total ({persen(p.cashbackTotalPersen)})</dt>
                    <dd className="text-right">{rupiah(p.cashbackTotalRp)}</dd>
                  </>
                )}
                <dt className="text-[#A9B0C2]">Cashback untuk nasabah ({persen(p.cashbackNasabahPersen)})</dt>
                <dd className="text-right">{rupiah(p.cashbackNasabahRp)}</dd>
                {admin && p.bagianKantorRp != null && (
                  <>
                    <dt className="text-[#A9B0C2]">
                      Bagian kantor ({persen(p.bagiHasilKantorPersen)}
                      {p.komisiEventRp ? `, normal ${persen(p.bagiHasilKantorNormalPersen)}` : ""})
                    </dt>
                    <dd className="text-right">{rupiah(p.bagianKantorRp)}</dd>
                  </>
                )}
              </dl>
              {p.komisiSalesRp != null && (
                <div className="border-t border-[#232A3B] pt-3">
                  <RincianKomisi
                    gelap
                    untukSales={!admin}
                    total={p.komisiSalesRp}
                    event={p.komisiEventRp ?? 0}
                    namaEvent={info.ev?.nama}
                    tambahanPersen={info.ev?.tambahanKomisiPersen}
                    porsiSalesNormal={admin && p.bagiHasilKantorNormalPersen != null ? 100 - p.bagiHasilKantorNormalPersen : null}
                  />
                </div>
              )}
              {p.noPolis && (
                <p className="border-t border-[#232A3B] pt-3 text-[13px] text-[#C9D5FF]">
                  Polis {p.noPolis} · {tgl(p.tglMulai)} – {tgl(p.tglAkhir)}
                </p>
              )}
            </section>
          )}

          {terbit && (
            <Kartu className="flex flex-col gap-3" data-uji="kartu-masa">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-base font-bold">Masa polis & perpanjangan</h2>
                {sisa !== null && p.statusMasa !== "diperpanjang" && (
                  <span className={`text-sm font-bold ${sisa < 0 ? "text-bad" : sisa <= 30 ? "text-warn" : "text-ink-2"}`}>
                    {sisa < 0 ? `lewat ${-sisa} hari` : `${sisa} hari lagi`}
                  </span>
                )}
              </div>
              <p className="text-sm text-ink-2">
                {p.tglMulai} s/d {p.tglAkhir}
                {p.statusMasa === "diperpanjang" && " · sudah diperpanjang"}
              </p>
              {lanjutan ? (
                <Link href={`/pengajuan/${lanjutan.id}`} className="flex flex-wrap items-center gap-2 rounded-2xl bg-canvas px-3 py-2 text-sm font-semibold hover:text-brand">
                  Perpanjangan {lanjutan.kode}
                  <LencanaStatus status={lanjutan.statusPengajuan} />
                  {lanjutan.nasabahSetujuPerpanjangan && <Lencana nada="ok">NASABAH SETUJU</Lencana>}
                </Link>
              ) : (
                masaDiurus && (
                  <div className="flex flex-wrap items-start gap-2">
                    <FormAksi aksi={perpanjang.bind(null, id)} tombol="Perpanjang" className="flex flex-col gap-1">
                      {null}
                    </FormAksi>
                    <FormAksi aksi={remindManual.bind(null, id)} tombol="Remind WhatsApp" varian="kedua" className="flex flex-col gap-1">
                      {null}
                    </FormAksi>
                  </div>
                )
              )}
              {riwayatRemind.length > 0 && (
                <ul className="flex flex-col gap-1 border-t border-line pt-2 text-[13px] text-ink-2">
                  {riwayatRemind.map(({ r, status, oleh }) => (
                    <li key={r.id} className="flex justify-between gap-2">
                      <span>
                        Remind {r.tahap ? `H-${r.tahap} (otomatis)` : `manual${oleh ? ` · ${oleh}` : ""}`}
                      </span>
                      <span className="text-ink-3">
                        {r.dibuat.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })} · {r.kanal === "optout" ? "tidak dikirim (berhenti)" : r.kanal === "wame" ? "wa.me" : (status ?? "-")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Kartu>
          )}

          {terbit && (
            <Kartu className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-base font-bold">Klaim</h2>
                <Link href={`/klaim/baru?polis=${id}`} className="text-sm font-semibold text-brand">
                  + Catat klaim
                </Link>
              </div>
              {daftarKlaim.length === 0 ? (
                <p className="text-sm text-ink-3">Belum ada klaim.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line text-sm">
                  {daftarKlaim.map(({ k, bengkel: b, foto }) => (
                    <li key={k.id}>
                      <Link href={`/klaim/${k.id}`} className="flex items-center justify-between gap-2 py-2 hover:text-brand">
                        <span>
                          {k.tglKlaim}
                          {b && ` · ${b}`} · {foto} foto
                        </span>
                        <Lencana nada={LABEL_KLAIM[k.status][1]}>{LABEL_KLAIM[k.status][0]}</Lencana>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Kartu>
          )}

          <Kartu className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-bold">Link tracker nasabah</h2>
              <span className="text-[11px] text-ink-3">berlaku 90 hari setelah selesai</span>
            </div>
            {tracker ? (
              <>
                <div className="flex items-center gap-2 rounded-full border border-line bg-canvas py-1 pl-4 pr-1">
                  <a href={`/t/${tracker.token}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-semibold text-brand-ink">
                    {urlTracker(tracker.token).replace(/^https?:\/\//, "")}
                  </a>
                </div>
                <p className="text-[12px] text-ink-3">
                  {tracker.terakhirDilihat
                    ? `Dilihat ${tracker.jumlahDilihat}× · terakhir ${tglJam(tracker.terakhirDilihat)}`
                    : "Belum pernah dibuka nasabah"}
                </p>
              </>
            ) : (
              <p className="text-sm text-ink-3">Belum ada link. Link dibuat saat dibagikan.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <FormAksi aksi={bagikanTracker.bind(null, id)} tombol="Kirim via WhatsApp kantor" className="contents">
                <input type="hidden" name="kanal" value="fonnte" />
              </FormAksi>
              <FormAksi aksi={bagikanTracker.bind(null, id)} tombol="Kirim dari WA saya" varian="kedua" className="contents">
                <input type="hidden" name="kanal" value="wame" />
              </FormAksi>
            </div>
            {tracker && (
              <div className="flex gap-3 text-[12px]">
                <form action={buatUlangTracker.bind(null, id)}>
                  <button className="font-semibold text-brand">Buat link baru</button>
                </form>
                <form action={cabutTracker.bind(null, id)}>
                  <button className="font-semibold text-bad">Cabut link</button>
                </form>
              </div>
            )}
          </Kartu>

          <Kartu className="flex flex-col gap-3">
            <h2 className="text-base font-bold">Data pengajuan</h2>
            <dl className="grid grid-cols-[130px_1fr] gap-y-1.5 text-sm">
              <dt className="text-ink-3">Nilai pertanggungan</dt>
              <dd>{rupiah(p.nilaiPertanggungan)}</dd>
              <dt className="text-ink-3">Paket</dt>
              <dd>{info.kat && info.a ? `${info.a.nama} ${info.kat.nama}` : "Dipilih dari penawaran"}</dd>
              {p.tglBayar && (
                <>
                  <dt className="text-ink-3">Dibayar</dt>
                  <dd>{tgl(p.tglBayar)}</dd>
                </>
              )}
              {p.tglCairAsuransi && (
                <>
                  <dt className="text-ink-3">Dana asuransi cair</dt>
                  <dd>
                    {tgl(p.tglCairAsuransi)}
                    {admin && ` · ${rupiah(p.nominalCairAsuransi)}`}
                  </dd>
                </>
              )}
              {p.tglTransferNasabah && (
                <>
                  <dt className="text-ink-3">Ke nasabah</dt>
                  <dd>{tgl(p.tglTransferNasabah)}</dd>
                </>
              )}
              {p.tglTransferSales && (
                <>
                  <dt className="text-ink-3">{admin ? "Komisi sales" : "Komisi Anda"}</dt>
                  <dd>{tgl(p.tglTransferSales)}</dd>
                </>
              )}
            </dl>
            {dokTerlihat.length > 0 && (
              <ul className="flex flex-wrap gap-2 border-t border-line pt-3">
                {dokTerlihat.map((d) => (
                  <li key={d.id}>
                    <a
                      href={`/api/dokumen/${d.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center rounded-full border border-line bg-canvas px-3 text-[12px] font-semibold text-ink-2 hover:text-ink"
                    >
                      {d.jenis.replaceAll("_", " ")}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Kartu>

          <Kartu className="flex flex-col gap-1">
            <h2 className="mb-2 text-base font-bold">Perjalanan</h2>
            <ol className="flex flex-col">
              {LANGKAH.map((l, i) => {
                const k = i + 1;
                const w0 = waktuLangkah.get(l.status);
                // Survei kendaraan opsional: bila tidak pernah dicatat, tampil sebagai "dilewati".
                const dilewati = l.status === "survei_kendaraan" && !w0 && k < terakhirLangkah;
                const selesai = !dilewati && (k < terakhirLangkah || (s === "selesai" && k === 12));
                const sekarang = k === terakhirLangkah && s !== "selesai";
                const w = waktuLangkah.get(l.status);
                return (
                  <li key={l.status} className="flex gap-3">
                    <div className="flex w-5 flex-col items-center">
                      <span
                        className={clsx(
                          "mt-0.5 size-4 shrink-0 rounded-full border-2",
                          selesai && "border-ink bg-ink",
                          sekarang && (n ? "border-brand bg-white ring-4 ring-brand-soft" : "border-bad bg-white ring-4 ring-bad-soft"),
                          !selesai && !sekarang && (dilewati ? "border-dashed border-ink-4 bg-white" : "border-line-2 bg-white"),
                        )}
                      />
                      {k < 12 && <span className={clsx("w-0.5 flex-1", selesai || dilewati ? "bg-ink" : "bg-line")} />}
                    </div>
                    <div className="flex flex-1 justify-between gap-2 pb-3 text-sm">
                      <span className={clsx(sekarang ? "font-bold" : selesai ? "font-medium" : "text-ink-4")}>
                        {l.label}
                        {dilewati && <span className="ml-1 text-[11px] font-normal italic">dilewati</span>}
                        <span className="ml-1 text-[11px] font-normal text-ink-4">{l.oleh}</span>
                      </span>
                      {w && <span className="text-[12px] text-ink-3">{tglJam(w)}</span>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Kartu>

          <Kartu className="flex flex-col gap-2">
            <h2 className="text-base font-bold">Riwayat</h2>
            <ul className="flex flex-col gap-2 text-[13px]">
              {[...riwayat].reverse().map(({ h, oleh }) => (
                <li key={h.id} className="flex flex-col border-l-2 border-line pl-3">
                  <span>
                    <b>{labelStatus(h.status)}</b> · {tglJam(h.waktu)} · {oleh ?? "Sistem"}
                  </span>
                  {h.catatan && <span className="text-ink-3">{catatanUntuk(h.status, h.catatan, admin)}</span>}
                </li>
              ))}
              {kirimLog.map(({ l, asuransi }) => (
                <li key={l.id} className="flex flex-col border-l-2 border-brand-edge pl-3">
                  <span>
                    {l.jenis === "tagih_cashback" ? "Tagih pencairan ke" : "Kirim ke"} <b>{asuransi}</b> via {l.kanal === "wa" ? "WhatsApp" : "email"} · {tglJam(l.waktu)}
                  </span>
                  <span className="text-ink-3">
                    {l.tujuan} · {l.hasil}
                  </span>
                </li>
              ))}
            </ul>
          </Kartu>
        </div>
      </div>
    </>
  );
}
