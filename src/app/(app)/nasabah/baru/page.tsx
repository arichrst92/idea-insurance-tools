import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { FormAksi } from "@/components/form-aksi";
import { Kartu, KepalaHalaman, Pilihan } from "@/components/ui";
import { IsianKendaraan, IsianNasabah } from "../isian";
import { buatNasabah } from "../actions";
import { adalahStaf, bisaJual, penjualSql } from "@/lib/peran";

export const metadata = { title: "Tambah nasabah" };

export default async function NasabahBaru() {
  const { user } = await wajibLogin();
  const sales =
    adalahStaf(user)
      ? await db
          .select({ id: users.id, nama: users.nama })
          .from(users)
          .where(and(penjualSql(), eq(users.aktif, true)))
          .orderBy(asc(users.nama))
      : [];

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Nasabah", href: "/nasabah" }, { label: "Baru" }]}
        judul="Tambah"
        sorot="nasabah"
        sub="KTP, STNK, foto kendaraan, dan rekening bisa diupload setelah disimpan."
      />
      <Kartu className="max-w-4xl">
        <FormAksi aksi={buatNasabah} tombol="Simpan nasabah" className="flex flex-col gap-6">
          {adalahStaf(user) && (
            <Pilihan label="Sales pemilik" name="salesId" required defaultValue={bisaJual(user) ? user.id : ""} className="max-w-sm">
              <option value="" disabled>
                Pilih sales…
              </option>
              {sales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id === user.id ? `${s.nama} (saya)` : s.nama}
                </option>
              ))}
            </Pilihan>
          )}
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 text-base font-bold">Data nasabah</legend>
            <IsianNasabah />
          </fieldset>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-base font-bold">Kendaraan pertama</legend>
            <p className="mb-2 text-[13px] text-ink-3">Opsional — kosongkan no. polisi bila belum ada.</p>
            <IsianKendaraan wajib={false} />
          </fieldset>
        </FormAksi>
      </Kartu>
    </>
  );
}
