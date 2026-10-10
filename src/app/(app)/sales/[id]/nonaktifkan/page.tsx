import { notFound, redirect } from "next/navigation";
import { and, asc, count, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { kendaraan, nasabah, polis, users } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { FormAksi } from "@/components/form-aksi";
import { Isian, Kartu, KepalaHalaman, Kosong, Pilihan } from "@/components/ui";
import { STATUS_SEBELUM_TERBIT } from "@/lib/domain/journey";
import { nonaktifkanSales } from "./actions";

export const metadata = { title: "Nonaktifkan sales" };

export default async function NonaktifkanSales({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await wajibLogin("admin");
  const { id } = await params;
  const [s] = await db.select().from(users).where(eq(users.id, id));
  if (!s || s.role !== "sales") notFound();
  if (!s.aktif || s.id === user.id) redirect(`/sales/${id}`);

  const [daftar, salesLain, [{ terbit }]] = await Promise.all([
    db
      .select({
        id: nasabah.id,
        nama: nasabah.nama,
        plat: sql<string>`(select string_agg(${kendaraan.noPolisi}, ', ') from ${kendaraan} where ${kendaraan.nasabahId} = ${nasabah.id})`,
        pengajuan: sql<number>`(select count(*) from ${polis} where ${polis.nasabahId} = ${nasabah.id} and ${polis.salesId} = ${id} and ${inArray(polis.statusPengajuan, STATUS_SEBELUM_TERBIT)})`.mapWith(Number),
      })
      .from(nasabah)
      .where(eq(nasabah.salesId, id))
      .orderBy(asc(nasabah.nama)),
    db
      .select({ id: users.id, nama: users.nama })
      .from(users)
      .where(and(eq(users.role, "sales"), eq(users.aktif, true), ne(users.id, id)))
      .orderBy(asc(users.nama)),
    db
      .select({ terbit: count() })
      .from(polis)
      .where(
        and(eq(polis.salesId, id), notInArray(polis.statusPengajuan, [...STATUS_SEBELUM_TERBIT, "ditolak_asuransi", "batal_nasabah", "batal_salah_input"])),
      ),
  ]);
  const totalPengajuan = daftar.reduce((a, n) => a + n.pengajuan, 0);
  const pilihan = salesLain.map((x) => (
    <option key={x.id} value={x.id}>
      {x.nama}
    </option>
  ));

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Sales", href: "/sales" }, { label: s.nama, href: `/sales/${id}` }, { label: "Nonaktifkan" }]}
        judul="Nonaktifkan"
        sorot={s.nama}
        sub="Data tidak dihapus: riwayat polis, komisi, dan laporan tetap utuh. Bisa diaktifkan kembali kapan saja."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Nasabah dialihkan", nilai: daftar.length },
          { label: "Pengajuan belum terbit (ikut pindah)", nilai: totalPengajuan },
          { label: "Polis terbit (komisi tetap ke sales lama)", nilai: terbit },
        ].map((x) => (
          <Kartu key={x.label} className="flex flex-col gap-1">
            <span className="text-[13px] text-ink-3">{x.label}</span>
            <span className="text-3xl font-extrabold">{x.nilai}</span>
          </Kartu>
        ))}
      </div>

      {salesLain.length === 0 && daftar.length > 0 ? (
        <Kosong>Tambahkan sales aktif lain dulu agar nasabah {s.nama} bisa dialihkan.</Kosong>
      ) : (
        <Kartu className="max-w-4xl">
          <FormAksi aksi={nonaktifkanSales.bind(null, id)} tombol={`Nonaktifkan ${s.nama}`} varian="bahaya" className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
              <Isian label="Tanggal nonaktif" name="tglNonaktif" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
              <Isian label="Alasan" name="alasan" required placeholder="Resign, kontrak selesai, …" />
            </div>

            {daftar.length > 0 && (
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-2 text-base font-bold">Alihkan nasabah</legend>
                <Pilihan label="Alihkan semua ke" name="keSalesId" required defaultValue="" className="max-w-sm">
                  <option value="" disabled>
                    Pilih sales…
                  </option>
                  {pilihan}
                </Pilihan>
                <details className="rounded-2xl border border-line p-4">
                  <summary className="cursor-pointer text-[13px] font-semibold text-brand">Atur per nasabah ({daftar.length})</summary>
                  <ul className="mt-3 flex flex-col divide-y divide-line">
                    {daftar.map((n) => (
                      <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                        <div className="text-sm">
                          <div className="font-semibold">{n.nama}</div>
                          <div className="text-xs text-ink-3">
                            {n.plat ?? "Tanpa kendaraan"}
                            {n.pengajuan > 0 && ` · ${n.pengajuan} pengajuan berjalan`}
                          </div>
                        </div>
                        <select name={`ke_${n.id}`} defaultValue="" className="h-9 rounded-full border border-line-2 bg-white px-3 text-sm" aria-label={`Sales tujuan untuk ${n.nama}`}>
                          <option value="">Ikuti pilihan di atas</option>
                          {pilihan}
                        </select>
                      </li>
                    ))}
                  </ul>
                </details>
                <label className="flex items-center gap-2.5 text-sm text-ink-2">
                  <input type="checkbox" name="komisiIkut" className="size-4 accent-brand" />
                  Komisi polis yang sudah terbit ikut pindah ke sales baru (bawaan: tetap milik {s.nama})
                </label>
              </fieldset>
            )}

            <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-2">
              <li>Semua sesi login {s.nama} dicabut seketika dan nomornya tidak bisa meminta OTP lagi.</li>
              <li>Target bulan berjalan dihentikan; gaji terakhir dihitung admin secara manual.</li>
              <li>Tetap tampil di laporan dengan label Nonaktif, tapi tidak muncul di pilihan sales, event, dan peringkat.</li>
            </ul>
          </FormAksi>
        </Kartu>
      )}
    </>
  );
}
