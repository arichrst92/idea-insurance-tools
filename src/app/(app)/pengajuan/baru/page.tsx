import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { kendaraan, nasabah } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { filterNasabah } from "@/lib/akses";
import { FormAksi } from "@/components/form-aksi";
import { Isian, Kartu, KepalaHalaman, Kosong, Pilihan } from "@/components/ui";
import { buatPengajuan } from "../actions";

export const metadata = { title: "Pengajuan baru" };

export default async function PengajuanBaru({ searchParams }: { searchParams: Promise<{ nasabah?: string }> }) {
  const { user } = await wajibLogin();
  const { nasabah: nasabahId } = await searchParams;

  const daftarNasabah = await db
    .select({ id: nasabah.id, nama: nasabah.nama })
    .from(nasabah)
    .where(filterNasabah(user))
    .orderBy(asc(nasabah.nama));
  const terpilih = daftarNasabah.find((n) => n.id === nasabahId);

  if (!terpilih) {
    return (
      <>
        <KepalaHalaman jejak={[{ label: "Pengajuan", href: "/pengajuan" }, { label: "Baru" }]} judul="Pengajuan" sorot="baru" sub="Langkah 1: pilih nasabah." />
        {daftarNasabah.length === 0 ? (
          <Kosong>
            Belum ada nasabah.{" "}
            <Link href="/nasabah/baru" className="font-semibold text-brand">
              Tambah nasabah dulu
            </Link>
            .
          </Kosong>
        ) : (
          <Kartu className="max-w-2xl">
            <form className="flex flex-col gap-4">
              <Pilihan label="Nasabah" name="nasabah" required defaultValue="">
                <option value="" disabled>
                  Pilih nasabah…
                </option>
                {daftarNasabah.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nama}
                  </option>
                ))}
              </Pilihan>
              <p className="text-[13px] text-ink-3">
                Nasabah baru?{" "}
                <Link href="/nasabah/baru" className="font-semibold text-brand">
                  Tambahkan dulu
                </Link>
                .
              </p>
              <div>
                <button className="h-10 rounded-full bg-ink px-5 text-sm font-semibold text-white">Lanjut</button>
              </div>
            </form>
          </Kartu>
        )}
      </>
    );
  }

  const daftarKendaraan = await db
    .select()
    .from(kendaraan)
    .where(and(eq(kendaraan.nasabahId, terpilih.id), eq(kendaraan.status, "aktif")))
    .orderBy(asc(kendaraan.dibuat));

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Pengajuan", href: "/pengajuan" }, { label: "Baru" }]}
        judul="Pengajuan untuk"
        sorot={terpilih.nama}
        sub={
          <Link href="/pengajuan/baru" className="font-semibold text-brand">
            Ganti nasabah
          </Link>
        }
      />
      {daftarKendaraan.length === 0 ? (
        <Kosong>
          Nasabah ini belum punya kendaraan aktif.{" "}
          <Link href={`/nasabah/${terpilih.id}`} className="font-semibold text-brand">
            Tambah kendaraan
          </Link>
          .
        </Kosong>
      ) : (
        <Kartu className="max-w-3xl">
          <FormAksi aksi={buatPengajuan} tombol="Buat pengajuan" className="flex flex-col gap-5">
            <input type="hidden" name="nasabahId" value={terpilih.id} />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[13px] font-semibold text-ink-2">Kendaraan</legend>
              {daftarKendaraan.map((k, i) => (
                <label key={k.id} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line p-3 has-[:checked]:border-ink has-[:checked]:ring-1 has-[:checked]:ring-ink">
                  <input type="radio" name="kendaraanId" value={k.id} defaultChecked={i === 0} className="accent-ink" />
                  <span className="font-bold">{k.noPolisi}</span>
                  <span className="text-sm text-ink-2">
                    {k.merek} {k.model} · {k.tahun}
                  </span>
                </label>
              ))}
            </fieldset>
            <Isian
              label="Nilai pertanggungan (Rp)"
              name="nilaiPertanggungan"
              inputMode="numeric"
              placeholder="415.000.000"
              hint="Asuransi akan diminta penawaran untuk semua paketnya (mis. Biasa, Plus, Complete)."
              required
              className="max-w-sm"
            />
            <p className="text-[13px] text-ink-3">
              Setelah dibuat, pastikan KTP, STNK, dan foto kendaraan 4 sisi sudah diupload, lalu tekan <b>Ajukan ke admin</b>.
            </p>
          </FormAksi>
        </Kartu>
      )}
    </>
  );
}
