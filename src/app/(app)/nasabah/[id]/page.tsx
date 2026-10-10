import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { dokumen, kendaraan, polis, rekening, users } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { nasabahMilik } from "@/lib/akses";
import { FormAksi } from "@/components/form-aksi";
import { Isian, Kartu, KepalaHalaman, Kosong, Lencana, Pilihan } from "@/components/ui";
import { formatNoWa, linkWaMe } from "@/lib/wa";
import { labelStatus } from "@/lib/domain/journey";
import { LABEL_STATUS_KENDARAAN } from "@/lib/domain/kendaraan";
import { IsianKendaraan, IsianNasabah } from "../isian";
import { Dokumen } from "../dokumen";
import {
  pindahKepemilikan,
  simpanRekeningNasabah,
  tambahKendaraan,
  ubahKendaraan,
  ubahNasabah,
  ubahStatusKendaraan,
} from "../actions";

export default async function DetailNasabah({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await wajibLogin();
  const { id } = await params;
  const n = await nasabahMilik(user, id);
  const admin = user.role === "admin";

  const daftarKendaraan = await db.select().from(kendaraan).where(eq(kendaraan.nasabahId, id)).orderBy(asc(kendaraan.dibuat));
  const kendaraanIds = daftarKendaraan.map((k) => k.id);
  const [[sales], [rek], dokNasabah, dokKendaraan, daftarPolis, salesLain] = await Promise.all([
    db.select({ nama: users.nama, aktif: users.aktif }).from(users).where(eq(users.id, n.salesId)),
    db
      .select()
      .from(rekening)
      .where(and(eq(rekening.pemilikTipe, "nasabah"), eq(rekening.pemilikId, id), eq(rekening.utama, true))),
    db
      .select()
      .from(dokumen)
      .where(and(eq(dokumen.pemilikTipe, "nasabah"), eq(dokumen.pemilikId, id)))
      .orderBy(asc(dokumen.dibuat)),
    kendaraanIds.length
      ? db
          .select()
          .from(dokumen)
          .where(and(eq(dokumen.pemilikTipe, "kendaraan"), inArray(dokumen.pemilikId, kendaraanIds)))
          .orderBy(asc(dokumen.dibuat))
      : Promise.resolve([]),
    db.select().from(polis).where(eq(polis.nasabahId, id)).orderBy(desc(polis.tglInput)),
    admin
      ? db
          .select({ id: users.id, nama: users.nama })
          .from(users)
          .where(and(eq(users.role, "sales"), eq(users.aktif, true), ne(users.id, n.salesId)))
          .orderBy(asc(users.nama))
      : Promise.resolve([]),
  ]);

  const aktif = daftarKendaraan.filter((k) => k.status === "aktif").length;

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Nasabah", href: "/nasabah" }, { label: n.nama }]}
        judul={n.nama}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            {n.tipe === "badan" && <Lencana>BADAN USAHA</Lencana>}
            {formatNoWa(n.noWa)} · sales {sales?.nama}
            {sales && !sales.aktif && <Lencana nada="bad">SALES NONAKTIF</Lencana>}
          </span>
        }
        aksi={
          <a
            href={linkWaMe(n.noWa, `Halo ${n.tipe === "badan" ? "" : "Bapak/Ibu "}${n.nama},`)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center rounded-full bg-wa px-5 text-sm font-semibold text-white"
          >
            Chat WhatsApp
          </a>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.35fr]">
        <div className="flex flex-col gap-4">
          <Kartu className="flex flex-col gap-4">
            <details>
              <summary className="cursor-pointer list-none">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold">Data nasabah</h2>
                  <span className="text-[13px] font-semibold text-brand">Ubah</span>
                </div>
                <dl className="mt-3 grid grid-cols-[110px_1fr] gap-y-1.5 text-sm">
                  <dt className="text-ink-3">NIK</dt>
                  <dd>{n.nik ?? "–"}</dd>
                  <dt className="text-ink-3">Email</dt>
                  <dd>{n.email ?? "–"}</dd>
                  <dt className="text-ink-3">Tgl lahir</dt>
                  <dd>{n.tglLahir ?? "–"}</dd>
                  <dt className="text-ink-3">Alamat</dt>
                  <dd>{n.alamat ?? "–"}</dd>
                </dl>
              </summary>
              <div className="mt-4 border-t border-line pt-4">
                <FormAksi aksi={ubahNasabah.bind(null, id)} tombol="Simpan perubahan">
                  <IsianNasabah data={n} />
                </FormAksi>
              </div>
            </details>
          </Kartu>

          <Kartu className="flex flex-col gap-3">
            <h2 className="text-base font-bold">KTP</h2>
            <Dokumen pemilik={{ tipe: "nasabah", id }} daftar={dokNasabah} jenis={["ktp"]} />
          </Kartu>

          <Kartu className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-bold">Rekening cashback</h2>
              {!rek && <Lencana nada="warn">BELUM ADA</Lencana>}
            </div>
            <p className="text-[13px] text-ink-3">Tujuan transfer cashback setelah premi lunas.</p>
            <FormAksi aksi={simpanRekeningNasabah.bind(null, id)} tombol={rek ? "Simpan rekening" : "Tambah rekening"} varian="kedua">
              <div className="grid grid-cols-[1fr_84px] gap-3">
                <Isian label="Bank" name="namaBank" defaultValue={rek?.namaBank ?? "BCA"} required />
                <Isian label="Kode" name="kodeBank" defaultValue={rek?.kodeBank ?? "014"} maxLength={3} inputMode="numeric" />
              </div>
              <Isian label="No. rekening" name="noRekening" defaultValue={rek?.noRekening ?? ""} inputMode="numeric" required />
              <Isian label="Atas nama" name="atasNama" defaultValue={rek?.atasNama ?? n.nama} required />
            </FormAksi>
          </Kartu>

          {admin && (
            <Kartu className="flex flex-col gap-3">
              <h2 className="text-base font-bold">Pindah ke sales lain</h2>
              <p className="text-[13px] text-ink-3">
                Pengajuan yang belum terbit ikut pindah. Polis yang sudah terbit tetap milik sales lama kecuali komisinya ikut dipindah.
              </p>
              {salesLain.length === 0 ? (
                <p className="text-sm text-ink-3">Tidak ada sales aktif lain.</p>
              ) : (
                <FormAksi aksi={pindahKepemilikan.bind(null, id)} tombol="Pindahkan" varian="kedua">
                  <Pilihan label="Sales tujuan" name="keSalesId" required defaultValue="">
                    <option value="" disabled>
                      Pilih sales…
                    </option>
                    {salesLain.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nama}
                      </option>
                    ))}
                  </Pilihan>
                  <label className="flex items-center gap-2.5 text-sm text-ink-2">
                    <input type="checkbox" name="komisiIkut" className="size-4 accent-brand" />
                    Komisi polis yang sudah terbit ikut pindah
                  </label>
                </FormAksi>
              )}
            </Kartu>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-lg font-bold">Kendaraan</h2>
            <span className="text-[13px] text-ink-3">
              {aktif} aktif dari {daftarKendaraan.length}
            </span>
          </div>

          {daftarKendaraan.length === 0 && <Kosong>Belum ada kendaraan.</Kosong>}

          {daftarKendaraan.map((k) => {
            const dok = dokKendaraan.filter((d) => d.pemilikId === k.id);
            const nonaktif = k.status !== "aktif";
            return (
              <Kartu key={k.id} className={`flex flex-col gap-4 ${nonaktif ? "bg-[#FBFBFD]" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className={`text-xl font-extrabold tracking-tight ${nonaktif ? "text-ink-3" : ""}`}>{k.noPolisi}</div>
                    <div className="text-sm text-ink-2">
                      {k.merek} {k.model} · {k.tahun}
                      {k.warna && ` · ${k.warna}`}
                    </div>
                  </div>
                  <Lencana nada={nonaktif ? "warn" : "ok"}>{LABEL_STATUS_KENDARAAN[k.status].toUpperCase()}</Lencana>
                </div>
                {nonaktif && (
                  <p className="rounded-xl bg-warn-soft px-3.5 py-2.5 text-[13px] text-warn">
                    {LABEL_STATUS_KENDARAAN[k.status]} sejak {k.tglStatus}
                    {k.catatanStatus && ` — ${k.catatanStatus}`}. Tidak muncul di perpanjangan dan remind otomatis.
                  </p>
                )}

                <Dokumen pemilik={{ tipe: "kendaraan", id: k.id }} daftar={dok} jenis={["stnk", "foto_kendaraan"]} />

                <div className="flex flex-col divide-y divide-line border-t border-line">
                  <details className="py-3">
                    <summary className="cursor-pointer text-[13px] font-semibold text-brand">Ubah data kendaraan</summary>
                    <div className="pt-4">
                      <FormAksi aksi={ubahKendaraan.bind(null, k.id)} tombol="Simpan kendaraan">
                        <IsianKendaraan data={k} />
                      </FormAksi>
                    </div>
                  </details>
                  <details className="pt-3">
                    <summary className="cursor-pointer text-[13px] font-semibold text-brand">
                      {nonaktif ? "Aktifkan kembali" : "Tandai dijual / tidak dipakai"}
                    </summary>
                    <div className="pt-4">
                      {nonaktif ? (
                        <FormAksi aksi={ubahStatusKendaraan.bind(null, k.id)} tombol="Aktifkan kembali" varian="kedua">
                          <input type="hidden" name="status" value="aktif" />
                          <p className="text-[13px] text-ink-2">Kendaraan kembali muncul di perpanjangan dan bisa dipilih di pengajuan baru.</p>
                        </FormAksi>
                      ) : (
                        <FormAksi aksi={ubahStatusKendaraan.bind(null, k.id)} tombol="Simpan status" varian="bahaya">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Pilihan label="Status" name="status" defaultValue="dijual">
                              <option value="dijual">Dijual</option>
                              <option value="tidak_dipakai">Tidak dipakai (hilang, rusak total, dll.)</option>
                            </Pilihan>
                            <Isian label="Tanggal" name="tglStatus" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
                          </div>
                          <Isian label="Catatan" name="catatanStatus" placeholder="Opsional untuk dijual: nama pembeli (prospek baru)" />
                          <p className="text-[13px] text-ink-3">
                            Polis yang masih berjalan ditandai &ldquo;Kendaraan dijual&rdquo; dan tidak diperpanjang; remind WhatsApp berhenti.
                          </p>
                        </FormAksi>
                      )}
                    </div>
                  </details>
                </div>
              </Kartu>
            );
          })}

          <Kartu className="flex flex-col gap-3">
            <details>
              <summary className="cursor-pointer text-base font-bold">+ Tambah kendaraan</summary>
              <div className="pt-4">
                <FormAksi aksi={tambahKendaraan.bind(null, id)} tombol="Tambah kendaraan" resetSetelahOk>
                  <IsianKendaraan />
                </FormAksi>
              </div>
            </details>
          </Kartu>

          {daftarPolis.length > 0 && (
            <Kartu className="flex flex-col gap-3">
              <h2 className="text-base font-bold">Riwayat pengajuan & polis</h2>
              <ul className="flex flex-col divide-y divide-line text-sm">
                {daftarPolis.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                    <span>
                      <b>{p.kode}</b> {p.noPolis && <span className="text-ink-3">· {p.noPolis}</span>}
                    </span>
                    <Lencana nada="brand">{labelStatus(p.statusPengajuan).toUpperCase()}</Lencana>
                  </li>
                ))}
              </ul>
            </Kartu>
          )}
        </div>
      </div>
    </>
  );
}
