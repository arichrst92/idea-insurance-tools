import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { eventBagiHasil, polis, users } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { FormAksi } from "@/components/form-aksi";
import { Isian, Kartu, KepalaHalaman, Kosong, Lencana, Pilihan } from "@/components/ui";
import { persen, rupiah } from "@/lib/format";
import { RincianKomisi } from "@/components/rincian-komisi";
import { buatEvent, hapusEvent, ubahAktifEvent, ubahEvent } from "./actions";
import { adalahOwner, adalahStaf, penjualSql } from "@/lib/peran";

export const metadata = { title: "Event" };

const LABEL_BERLAKU = { semua: "Semua sales", fulltime: "Fulltime", freelance: "Freelance", pilihan: "Sales tertentu" };

export default async function HalamanEvent() {
  const { user } = await wajibLogin();
  const admin = adalahStaf(user);
  const owner = adalahOwner(user);
  const hariIni = new Date().toISOString().slice(0, 10);

  const [daftar, sales] = await Promise.all([
    db
      .select({
        e: eventBagiHasil,
        polis: count(polis.id),
        premi: sql<number>`coalesce(sum(${polis.premiBruto}), 0)`.mapWith(Number),
        komisi: sql<number>`coalesce(sum(${polis.komisiSalesRp}), 0)`.mapWith(Number),
        komisiEvent: sql<number>`coalesce(sum(${polis.komisiEventRp}), 0)`.mapWith(Number),
      })
      .from(eventBagiHasil)
      .leftJoin(polis, and(eq(polis.eventId, eventBagiHasil.id), admin ? undefined : eq(polis.salesId, user.id)))
      .groupBy(eventBagiHasil.id)
      .orderBy(desc(eventBagiHasil.tglMulai)),
    admin
      ? db
          .select({ id: users.id, nama: users.nama })
          .from(users)
          .where(and(penjualSql(), eq(users.aktif, true)))
          .orderBy(asc(users.nama))
      : Promise.resolve([]),
  ]);

  // Sales hanya melihat event yang berlaku untuknya.
  const terlihat = admin
    ? daftar
    : daftar.filter(
        ({ e }) =>
          e.aktif &&
          (e.berlakuUntuk === "semua" ||
            e.berlakuUntuk === user.tipeSales ||
            (e.berlakuUntuk === "pilihan" && e.salesIds.includes(user.id))),
      );

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: admin ? "Event bagi hasil" : "Event bonus komisi" }]}
        judul="Event"
        sorot={admin ? "bagi hasil" : "bonus komisi"}
        sub={
          admin
            ? "Selama event, porsi komisi sales bertambah dan porsi kantor berkurang sebesar tambahan itu. Bila beberapa event berlaku bersamaan, dipakai tambahan terbesar."
            : "Selama event berjalan, komisi Anda naik sebesar persen bonusnya untuk setiap polis yang disetujui di periode itu."
        }
      />
      <div className={admin ? "grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]" : "flex flex-col gap-4"}>
        <div className="flex flex-col gap-3">
          {terlihat.length === 0 && <Kosong>Belum ada event.</Kosong>}
          {terlihat.map(({ e, polis: jml, premi, komisi, komisiEvent }) => {
            const berjalan = e.aktif && e.tglMulai <= hariIni && hariIni <= e.tglSelesai;
            return (
              <Kartu key={e.id} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-lg font-extrabold">{e.nama}</div>
                    <div className="text-sm text-ink-2">
                      {e.tglMulai} s/d {e.tglSelesai} · {LABEL_BERLAKU[e.berlakuUntuk]}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!e.aktif ? <Lencana>NONAKTIF</Lencana> : berjalan ? <Lencana nada="ok">BERJALAN</Lencana> : e.tglMulai > hariIni ? <Lencana nada="brand">AKAN DATANG</Lencana> : <Lencana>SELESAI</Lencana>}
                    <span className="rounded-full bg-ink px-3 py-1 text-sm font-extrabold text-white">
                      {admin ? "Komisi sales" : "Komisi Anda"} +{persen(e.tambahanKomisiPersen)}
                    </span>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-ink-3">Polis</dt>
                    <dd className="text-lg font-bold">{jml}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Premi</dt>
                    <dd className="text-lg font-bold">{rupiah(premi)}</dd>
                  </div>
                </dl>
                {jml > 0 && (
                  <div className="rounded-2xl bg-canvas p-3">
                    <RincianKomisi untukSales={!admin} total={komisi} event={komisiEvent} namaEvent={e.nama} tambahanPersen={e.tambahanKomisiPersen} besar={false} />
                  </div>
                )}
                {owner && (
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-2 border-t border-line pt-3">
                    <details className="w-full">
                      <summary className="cursor-pointer text-[13px] font-semibold text-brand">Ubah event</summary>
                      <div className="pt-3">
                        <FormAksi aksi={ubahEvent.bind(null, e.id)} tombol="Simpan perubahan" varian="kedua">
                          <IsianEvent sales={sales} data={e} />
                          {jml > 0 && (
                            <p className="text-[13px] text-ink-3">
                              {jml} polis yang sudah disetujui tetap memakai angka lama; perubahan berlaku untuk persetujuan berikutnya.
                            </p>
                          )}
                        </FormAksi>
                      </div>
                    </details>
                    <form action={ubahAktifEvent.bind(null, e.id, !e.aktif)}>
                      <button className="text-[13px] font-semibold text-ink-3 hover:text-ink">{e.aktif ? "Nonaktifkan" : "Aktifkan"}</button>
                    </form>
                    <details>
                      <summary className="cursor-pointer text-[13px] font-semibold text-bad">Hapus</summary>
                      <div className="pt-2">
                        <FormAksi aksi={hapusEvent.bind(null, e.id)} tombol="Ya, hapus event" varian="bahaya" className="flex flex-col gap-2">
                          <span className="text-[13px] text-ink-2">Event yang sudah dipakai polis tidak bisa dihapus.</span>
                        </FormAksi>
                      </div>
                    </details>
                  </div>
                )}
              </Kartu>
            );
          })}
        </div>

        {admin && !owner && (
          <Kartu className="text-sm text-ink-2">Event dibuat dan diubah oleh owner.</Kartu>
        )}
        {owner && (
          <Kartu className="flex flex-col gap-4">
            <h2 className="text-base font-bold">Buat event</h2>
            <FormAksi aksi={buatEvent} tombol="Buat event" resetSetelahOk>
              <IsianEvent sales={sales} />
            </FormAksi>
          </Kartu>
        )}
      </div>
    </>
  );
}

function IsianEvent({ sales, data }: { sales: { id: string; nama: string }[]; data?: typeof eventBagiHasil.$inferSelect }) {
  return (
    <>
      <Isian label="Nama event" name="nama" placeholder="Akhir Tahun Ngebut" defaultValue={data?.nama} required />
      <div className="grid grid-cols-2 gap-3">
        <Isian label="Mulai" name="tglMulai" type="date" defaultValue={data?.tglMulai} required />
        <Isian label="Selesai" name="tglSelesai" type="date" defaultValue={data?.tglSelesai} required />
      </div>
      <Isian
        label="Tambahan komisi sales (%)"
        name="tambahanKomisiPersen"
        inputMode="decimal"
        placeholder="15"
        defaultValue={data ? String(data.tambahanKomisiPersen) : undefined}
        required
        hint="Dari porsi sales. Contoh kantor 60 / sales 40, +15% → sales 46, kantor 54."
      />
      <Pilihan label="Berlaku untuk" name="berlakuUntuk" defaultValue={data?.berlakuUntuk ?? "semua"}>
        <option value="semua">Semua sales</option>
        <option value="fulltime">Fulltime saja</option>
        <option value="freelance">Freelance saja</option>
        <option value="pilihan">Sales tertentu (centang di bawah)</option>
      </Pilihan>
      {sales.length > 0 && (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1 text-[13px] font-semibold text-ink-2">Sales tertentu</legend>
          {sales.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
            >
              <input type="checkbox" name="salesIds" value={s.id} defaultChecked={data?.salesIds.includes(s.id)} className="accent-brand" />
              {s.nama}
            </label>
          ))}
        </fieldset>
      )}
    </>
  );
}
