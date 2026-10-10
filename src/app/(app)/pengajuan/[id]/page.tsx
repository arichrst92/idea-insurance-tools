import Link from "next/link";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import clsx from "clsx";
import { db } from "@/db";
import {
  dokumen,
  eventBagiHasil,
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
import { LANGKAH, nomorLangkah, labelStatus } from "@/lib/domain/journey";
import { bagiHasilBerlaku } from "@/lib/domain/komisi";
import { persen, rupiah } from "@/lib/format";
import { cekKelengkapan, trackerAktif, urlTracker, MIN_FOTO_KENDARAAN } from "@/lib/pengajuan";
import { PilihPenawaran } from "./pilih-penawaran";
import {
  ajukan,
  bagikanTracker,
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
  ubahDataPengajuan,
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
        .select({ pw: penawaran, asuransi: perusahaanAsuransi.nama })
        .from(penawaran)
        .innerJoin(perusahaanAsuransi, eq(perusahaanAsuransi.id, penawaran.perusahaanId))
        .where(eq(penawaran.polisId, id))
        .orderBy(asc(penawaran.premi)),
      db
        .select({ l: kirimAsuransiLog, asuransi: perusahaanAsuransi.nama })
        .from(kirimAsuransiLog)
        .innerJoin(perusahaanAsuransi, eq(perusahaanAsuransi.id, kirimAsuransiLog.perusahaanId))
        .where(eq(kirimAsuransiLog.polisId, id))
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
      db
        .select({ k: kategoriPolis, asuransi: perusahaanAsuransi.nama })
        .from(kategoriPolis)
        .innerJoin(perusahaanAsuransi, eq(perusahaanAsuransi.id, kategoriPolis.perusahaanId))
        .where(eq(kategoriPolis.aktif, true)),
      trackerAktif(id),
      cekKelengkapan(p),
    ]);

  const events = s === "penawaran_masuk" ? await db.select().from(eventBagiHasil).where(eq(eventBagiHasil.aktif, true)) : [];
  const bh = bagiHasilBerlaku(info.sales, p.tglInput.toISOString().slice(0, 10), events);
  const namaEvent = bh.eventId ? (events.find((e) => e.id === bh.eventId)?.nama ?? null) : null;

  const terakhirLangkah = n ?? Math.max(0, ...riwayat.map((r) => nomorLangkah(r.h.status) ?? 0));
  const waktuLangkah = new Map<StatusPengajuan, Date>();
  for (const r of riwayat) waktuLangkah.set(r.h.status, r.h.waktu);
  const ditutup = s === "selesai" || s === "ditolak_asuransi" || s === "batal_nasabah";
  const perluasanSemua = [...new Set(kategori.flatMap((k) => k.k.perluasanTersedia))];
  const sebelumTerbit = (n ?? 0) < 7;

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
        <FormAksi aksi={ubahDataPengajuan.bind(null, id)} tombol="Simpan data" varian="kedua">
          <div className="grid gap-3 sm:grid-cols-2">
            <Isian label="Nilai pertanggungan (Rp)" name="nilaiPertanggungan" inputMode="numeric" defaultValue={p.nilaiPertanggungan ?? ""} />
            <Pilihan label="Produk diminta" name="kategoriId" defaultValue={p.kategoriId ?? ""}>
              <option value="">Belum ditentukan</option>
              {kategori.map(({ k, asuransi }) => (
                <option key={k.id} value={k.id}>
                  {asuransi} — {k.namaProduk}
                </option>
              ))}
            </Pilihan>
          </div>
          {perluasanSemua.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {perluasanSemua.map((x) => (
                <label key={x} className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                  <input type="checkbox" name="perluasanDiminta" value={x} defaultChecked={p.perluasanDiminta.includes(x)} className="accent-brand" />
                  {x}
                </label>
              ))}
            </div>
          )}
        </FormAksi>
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
                      <input type="checkbox" name="perusahaanId" value={a.id} defaultChecked={info.kat?.perusahaanId === a.id} className="accent-ink" />
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
  if ((s === "dikirim_ke_asuransi" || s === "survei_kendaraan") && !admin) tunggu("Menunggu penawaran dari asuransi.");

  if (["dikirim_ke_asuransi", "survei_kendaraan", "penawaran_masuk"].includes(s) && admin) {
    panel.push(
      <details key="penawaran" open={s !== "penawaran_masuk"} className="rounded-2xl border border-line p-4">
        <summary className="cursor-pointer text-sm font-bold">Input penawaran dari asuransi</summary>
        <div className="pt-4">
          <FormAksi aksi={tambahPenawaran.bind(null, id)} tombol="Simpan penawaran" resetSetelahOk>
            <div className="grid gap-3 sm:grid-cols-2">
              <Pilihan label="Asuransi" name="perusahaanId" required defaultValue="">
                <option value="" disabled>
                  Pilih…
                </option>
                {asuransiList.map(({ a }) => (
                  <option key={a.id} value={a.id}>
                    {a.nama}
                  </option>
                ))}
              </Pilihan>
              <Isian label="Premi bruto (Rp)" name="premi" inputMode="numeric" required />
              <Isian label="Rate (%)" name="ratePersen" inputMode="decimal" />
              <Isian label="Cashback total dari asuransi (%)" name="cashbackTotalPersen" inputMode="decimal" required />
            </div>
            <Isian label="Catatan" name="catatan" />
            <InputFile label="File penawaran (opsional)" name="file" />
          </FormAksi>
        </div>
      </details>,
    );
  }

  if (s === "penawaran_masuk") {
    panel.push(
      <div key="setuju" className="rounded-2xl border border-line p-4">
        <h3 className="mb-3 text-sm font-bold">Persetujuan nasabah</h3>
        <PilihPenawaran
          aksi={setujuiPenawaran.bind(null, id)}
          opsi={daftarPenawaran.map(({ pw, asuransi }) => ({
            id: pw.id,
            asuransi,
            premi: pw.premi,
            cashbackTotalPersen: pw.cashbackTotalPersen,
            ratePersen: pw.ratePersen,
            dokumenId: pw.dokumenId,
          }))}
          maksCashback={info.sales.maksCashbackNasabahPersen}
          bagiHasilKantor={bh.persen}
          namaEvent={namaEvent}
        />
      </div>,
    );
  }

  if (s === "disetujui_nasabah") {
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
        <details className="border-t border-line pt-3">
          <summary className="cursor-pointer text-sm font-semibold text-brand">Tandai lunas</summary>
          <div className="pt-3">
            <FormAksi aksi={tandaiLunas.bind(null, id)} tombol="Tandai lunas">
              <Isian label="Tanggal bayar" name="tglBayar" type="date" required defaultValue={hariIni()} className="max-w-[220px]" />
              <InputFile label="Bukti transfer nasabah" name="bukti" wajib />
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
                <Isian label="Nominal cair (Rp)" name="nominal" inputMode="numeric" required defaultValue={p.cashbackTotalRp ?? ""} />
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
            <h3 className="mb-3 text-sm font-bold">Transfer komisi ke {info.sales.nama} · {rupiah(p.komisiSalesRp)}</h3>
            <FormAksi aksi={catatTransfer.bind(null, id, "sales")} tombol="Catat transfer komisi" varian="kedua">
              <Isian label="Tanggal transfer" name="tgl" type="date" required defaultValue={hariIni()} className="max-w-[220px]" />
              <InputFile label="Bukti transfer (opsional)" name="bukti" />
            </FormAksi>
          </div>,
        );
    } else tunggu(`Menunggu admin: ${s === "lunas" ? "setor premi ke asuransi" : s === "premi_disetor" ? "pencairan cashback dari asuransi" : "transfer komisi"}.`);
  }

  if (s === "selesai") tunggu("Selesai: cashback nasabah dan komisi sales sudah ditransfer.");
  if (s === "ditolak_asuransi" || s === "batal_nasabah") {
    const akhir = riwayat.at(-1);
    tunggu(`${labelStatus(s)}${akhir?.h.catatan ? ` — ${akhir.h.catatan}` : ""}`);
  }

  // Tindakan cabang
  const bolehRevisi = admin && ["data_lengkap", "dikirim_ke_asuransi", "survei_kendaraan", "penawaran_masuk"].includes(s);
  const bolehTolak = admin && !ditutup && sebelumTerbit;
  const bolehBatal = !ditutup && (n ?? 0) < 9;

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
                {daftarPenawaran.map(({ pw, asuransi }) => (
                  <li key={pw.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span>
                      <b>{asuransi}</b> {pw.dipilih && <Lencana nada="ok">DIPILIH</Lencana>}
                      <span className="block text-[13px] text-ink-3">
                        {pw.ratePersen != null && `rate ${persen(pw.ratePersen)} · `}cashback {persen(pw.cashbackTotalPersen)}
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
                    </span>
                    <span className="font-bold">{rupiah(pw.premi)}</span>
                  </li>
                ))}
              </ul>
            </Kartu>
          )}

          {(bolehRevisi || bolehTolak || bolehBatal) && (
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
                    </Pilihan>
                    <Isian label="Alasan / catatan" name="catatan" required />
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
                {info.ev && ` · EVENT ${info.ev.nama.toUpperCase()}`}
              </span>
              <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
                <dt className="text-[#A9B0C2]">Premi bruto</dt>
                <dd className="text-right text-base font-bold">{rupiah(p.premiBruto)}</dd>
                <dt className="text-[#A9B0C2]">Cashback total ({persen(p.cashbackTotalPersen)})</dt>
                <dd className="text-right">{rupiah(p.cashbackTotalRp)}</dd>
                <dt className="text-[#A9B0C2]">Ke nasabah ({persen(p.cashbackNasabahPersen)})</dt>
                <dd className="text-right">{rupiah(p.cashbackNasabahRp)}</dd>
                <dt className="text-[#A9B0C2]">Bagian kantor ({persen(p.bagiHasilKantorPersen)})</dt>
                <dd className="text-right">{rupiah(p.bagianKantorRp)}</dd>
                <dt className="text-[#C9D5FF]">Komisi sales</dt>
                <dd className="text-right text-lg font-extrabold text-[#8FA8FF]">{rupiah(p.komisiSalesRp)}</dd>
              </dl>
              {p.noPolis && (
                <p className="border-t border-[#232A3B] pt-3 text-[13px] text-[#C9D5FF]">
                  Polis {p.noPolis} · {tgl(p.tglMulai)} – {tgl(p.tglAkhir)}
                </p>
              )}
            </section>
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
              <dt className="text-ink-3">Produk diminta</dt>
              <dd>{info.kat ? info.kat.namaProduk : "–"}</dd>
              <dt className="text-ink-3">Perluasan</dt>
              <dd>{p.perluasanDiminta.join(", ") || "–"}</dd>
              {p.tglBayar && (
                <>
                  <dt className="text-ink-3">Dibayar</dt>
                  <dd>{tgl(p.tglBayar)}</dd>
                </>
              )}
              {p.tglCairAsuransi && (
                <>
                  <dt className="text-ink-3">Cashback cair</dt>
                  <dd>
                    {tgl(p.tglCairAsuransi)} · {rupiah(p.nominalCairAsuransi)}
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
                  <dt className="text-ink-3">Komisi sales</dt>
                  <dd>{tgl(p.tglTransferSales)}</dd>
                </>
              )}
            </dl>
            {dokPolis.length > 0 && (
              <ul className="flex flex-wrap gap-2 border-t border-line pt-3">
                {dokPolis.map((d) => (
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
                const selesai = k < terakhirLangkah || (s === "selesai" && k === 12);
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
                          !selesai && !sekarang && "border-line-2 bg-white",
                        )}
                      />
                      {k < 12 && <span className={clsx("w-0.5 flex-1", selesai ? "bg-ink" : "bg-line")} />}
                    </div>
                    <div className="flex flex-1 justify-between gap-2 pb-3 text-sm">
                      <span className={clsx(sekarang ? "font-bold" : selesai ? "font-medium" : "text-ink-4")}>
                        {l.label}
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
                  {h.catatan && <span className="text-ink-3">{h.catatan}</span>}
                </li>
              ))}
              {kirimLog.map(({ l, asuransi }) => (
                <li key={l.id} className="flex flex-col border-l-2 border-brand-edge pl-3">
                  <span>
                    Kirim ke <b>{asuransi}</b> via {l.kanal === "wa" ? "WhatsApp" : "email"} · {tglJam(l.waktu)}
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
