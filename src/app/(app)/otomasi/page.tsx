import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { otomasiLog, otomasiSetting, perusahaanAsuransi } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { FormAksi } from "@/components/form-aksi";
import { Kartu, KepalaHalaman, Lencana } from "@/components/ui";
import { JOB } from "@/lib/otomasi";
import { cronKeTeks } from "@/lib/domain/cron-teks";
import { jalankanSekarang, simpanOtomasi } from "./actions";

export const metadata = { title: "Otomasi" };
export const dynamic = "force-dynamic";

const LABEL_PARAM: Record<string, string> = {
  hariSebelum: "Draft dibuat H- (hari sebelum habis)",
  hari: "Tahap remind (hari sebelum habis)",
  hariCepat: "Ambang cepat untuk Penawaran masuk & Menunggu bayar (hari)",
  eskalasiAdmin: "Eskalasi ke admin setelah (hari)",
  jedaHari: "Jeda pengingat ke asuransi yang sama (hari)",
  mingguan: "Kirim laporan mingguan (Senin)",
  bulanan: "Kirim laporan bulanan (tanggal 1)",
  hariKerjaCashback: "Cashback nasabah dibayar lunas + N hari kerja",
  hariBayarKomisi: "Hari bayar komisi (0 = Minggu … 5 = Jumat)",
  tglGajian: "Tanggal gajian",
  perusahaanIds: "Asuransi bawaan",
  kanal: "Kanal kirim",
};
// Ambang "hari" pada alert mandek adalah angka, pada remind perpanjangan berupa daftar.
const labelParam = (kode: string, k: string) => (kode === "alert_mandek" && k === "hari" ? "Pengajuan dianggap mandek setelah (hari)" : (LABEL_PARAM[k] ?? k));

const jam = (d: Date) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(d);

export default async function HalamanOtomasi() {
  await wajibLogin("admin");
  const [daftar, log, asuransi] = await Promise.all([
    db.select().from(otomasiSetting).orderBy(asc(otomasiSetting.kode)),
    db.select().from(otomasiLog).orderBy(desc(otomasiLog.mulai)).limit(60),
    db.select({ id: perusahaanAsuransi.id, nama: perusahaanAsuransi.nama }).from(perusahaanAsuransi).where(eq(perusahaanAsuransi.aktif, true)).orderBy(asc(perusahaanAsuransi.nama)),
  ]);
  const terakhir = new Map<string, (typeof log)[number]>();
  for (const l of log) if (!terakhir.has(l.kode)) terakhir.set(l.kode, l);

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Otomasi" }]}
        judul="Otomasi"
        sub="Semua jadwal dalam WIB. Otomasi yang gagal mengirim notifikasi ke admin & owner. Laporan berkala (berisi keuangan) diatur owner. Tombol Jalankan sekarang mengabaikan status aktif/nonaktif."
      />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {daftar.map((s) => {
          const param = (s.parameter ?? {}) as Record<string, unknown>;
          const l = terakhir.get(s.kode);
          const bisaJalan = !!JOB[s.kode];
          return (
            <Kartu key={s.kode} className="flex flex-col gap-3" data-uji={`otomasi-${s.kode}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold">{s.nama}</h2>
                  <p className="text-[13px] text-ink-3">{cronKeTeks(s.jadwalCron)}</p>
                </div>
                <span className="flex items-center gap-2">
                  {l && <Lencana nada={l.status === "gagal" ? "bad" : l.status === "sukses" ? "ok" : "brand"}>{l.status === "gagal" ? "GAGAL" : l.status === "sukses" ? "OK" : "BERJALAN"}</Lencana>}
                  {s.aktif ? <Lencana nada="ok">AKTIF</Lencana> : <Lencana>NONAKTIF</Lencana>}
                </span>
              </div>
              {l && (
                <p className="rounded-xl bg-canvas px-3 py-2 text-[12px] text-ink-2">
                  Terakhir {jam(l.mulai)}: {l.error ?? l.ringkasan ?? "–"}
                </p>
              )}
              <details>
                <summary className="cursor-pointer text-[13px] font-semibold text-brand">Pengaturan</summary>
                <div className="pt-3">
                  <FormAksi aksi={simpanOtomasi.bind(null, s.kode)} tombol="Simpan" varian="kedua">
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input type="checkbox" name="aktif" defaultChecked={s.aktif} className="size-4 accent-ink" /> Aktif
                    </label>
                    {!s.jadwalCron.startsWith("event:") && (
                      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
                        Jadwal (cron: menit jam tanggal bulan hari)
                        <input name="jadwalCron" defaultValue={s.jadwalCron} className="h-10 rounded-xl border border-line-2 px-3 font-mono text-sm text-ink" />
                      </label>
                    )}
                    {Object.entries(param).map(([k, v]) => {
                      const label = labelParam(s.kode, k);
                      if (typeof v === "boolean")
                        return (
                          <label key={k} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" name={`p_${k}`} defaultChecked={v} className="size-4 accent-ink" /> {label}
                          </label>
                        );
                      if (typeof v === "number")
                        return (
                          <label key={k} className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
                            {label}
                            <input name={`p_${k}`} type="number" min={0} defaultValue={v} className="h-10 w-32 rounded-xl border border-line-2 px-3 text-sm text-ink" />
                          </label>
                        );
                      if (k === "perusahaanIds" || k === "kanal") {
                        const opsi = k === "kanal" ? [{ id: "email", nama: "Email (lampiran dokumen)" }, { id: "wa", nama: "WhatsApp (link dokumen)" }] : asuransi;
                        return (
                          <fieldset key={k} className="flex flex-col gap-1.5">
                            <legend className="mb-1 text-[13px] font-semibold text-ink-2">{label}</legend>
                            <input type="hidden" name={`p_${k}_teks`} value="1" />
                            {opsi.length === 0 && <span className="text-[13px] text-ink-3">Belum ada asuransi aktif.</span>}
                            {opsi.map((o) => (
                              <label key={o.id} className="flex items-center gap-2 text-sm">
                                <input type="checkbox" name={`p_${k}`} value={o.id} defaultChecked={(v as string[]).includes(o.id)} className="size-4 accent-ink" /> {o.nama}
                              </label>
                            ))}
                          </fieldset>
                        );
                      }
                      if (Array.isArray(v))
                        return (
                          <label key={k} className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
                            {label}
                            <input name={`p_${k}`} defaultValue={(v as number[]).join(", ")} className="h-10 w-48 rounded-xl border border-line-2 px-3 text-sm text-ink" />
                          </label>
                        );
                      return null;
                    })}
                    {s.kode === "laporan_berkala" && (
                      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
                        Penerima email (pisahkan dengan koma; kosong = email semua owner)
                        <input name="penerima" defaultValue={s.penerima.join(", ")} placeholder="owner@ide.asia, keuangan@ide.asia" className="h-10 rounded-xl border border-line-2 px-3 text-sm text-ink" />
                      </label>
                    )}
                  </FormAksi>
                </div>
              </details>
              {bisaJalan && (
                <FormAksi aksi={jalankanSekarang.bind(null, s.kode)} tombol="Jalankan sekarang" varian="kedua" className="flex flex-col items-start gap-1">
                  {null}
                </FormAksi>
              )}
            </Kartu>
          );
        })}
      </div>
      <Kartu className="overflow-x-auto p-0">
        <h2 className="px-5 pt-4 text-base font-bold">Log eksekusi</h2>
        <table className="mt-2 w-full min-w-[640px] text-sm" data-uji="log-otomasi">
          <thead className="text-left text-[11px] uppercase tracking-wider text-ink-3">
            <tr className="border-b border-line">
              <th className="px-5 py-2 font-semibold">Waktu</th>
              <th className="px-3 py-2 font-semibold">Otomasi</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 text-right font-semibold">Diproses</th>
              <th className="px-5 py-2 font-semibold">Ringkasan</th>
            </tr>
          </thead>
          <tbody>
            {log.map((l) => (
              <tr key={l.id} className="border-b border-line align-top last:border-0">
                <td className="whitespace-nowrap px-5 py-2.5 tabular-nums">{jam(l.mulai)}</td>
                <td className="px-3 py-2.5">{daftar.find((d) => d.kode === l.kode)?.nama ?? l.kode}</td>
                <td className="px-3 py-2.5">
                  <Lencana nada={l.status === "gagal" ? "bad" : l.status === "sukses" ? "ok" : "brand"}>{(l.status ?? "berjalan").toUpperCase()}</Lencana>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{l.jumlahDiproses}</td>
                <td className="px-5 py-2.5 text-[13px] text-ink-2">{l.error ?? l.ringkasan}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Kartu>
    </>
  );
}
