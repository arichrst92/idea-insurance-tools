import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bengkel, kendaraan, nasabah, perusahaanAsuransi } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { FormAksi } from "@/components/form-aksi";
import { Isian, IsianPanjang, Kartu, KepalaHalaman, Pilihan } from "@/components/ui";
import { waktuWib } from "@/lib/domain/perpanjangan";
import { catatKlaim, polisUntukKlaim } from "../actions";
import { kelasFile } from "../galeri";

export const metadata = { title: "Catat klaim" };

export default async function KlaimBaru({ searchParams }: { searchParams: Promise<{ polis?: string }> }) {
  const { user } = await wajibLogin();
  const { polis: polisId } = await searchParams;
  const p = polisId ? await polisUntukKlaim(user, polisId) : null;
  if (!p) notFound();
  const [[info], daftarBengkel] = await Promise.all([
    db
      .select({ n: nasabah.nama, plat: kendaraan.noPolisi, mobil: kendaraan.merek, model: kendaraan.model, asuransi: perusahaanAsuransi.nama })
      .from(nasabah)
      .innerJoin(kendaraan, eq(kendaraan.id, p.kendaraanId))
      .leftJoin(perusahaanAsuransi, eq(perusahaanAsuransi.id, p.perusahaanId ?? ""))
      .where(eq(nasabah.id, p.nasabahId)),
    db.select().from(bengkel).where(eq(bengkel.aktif, true)).orderBy(asc(bengkel.nama)),
  ]);
  const hariIni = waktuWib().tanggal;
  const maks = p.tglAkhir && p.tglAkhir < hariIni ? p.tglAkhir : hariIni;

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Klaim", href: "/klaim" }, { label: "Catat" }]}
        judul="Catat"
        sorot="klaim"
        sub={`${info.n} · ${info.plat} ${info.mobil} ${info.model} · ${p.noPolis} (${info.asuransi ?? "-"}, ${p.tglMulai} s/d ${p.tglAkhir})`}
      />
      <Kartu className="max-w-2xl">
        <FormAksi aksi={catatKlaim.bind(null, p.id)} tombol="Simpan klaim">
          <Isian label="Tanggal kejadian" name="tglKlaim" type="date" required defaultValue={maks} min={p.tglMulai ?? undefined} max={maks} className="max-w-[220px]" />
          <Pilihan label="Bengkel (opsional)" name="bengkelId" defaultValue="">
            <option value="">— belum ditentukan —</option>
            {daftarBengkel.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nama}
                {b.kota ? ` · ${b.kota}` : ""}
              </option>
            ))}
          </Pilihan>
          <IsianPanjang label="Catatan kejadian" name="catatan" placeholder="Mis. bumper depan penyok, tabrakan ringan di tol" />
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
            Foto kerusakan (boleh beberapa, bisa ditambah nanti)
            <input type="file" name="foto" multiple accept="image/*,application/pdf" className={kelasFile} />
          </label>
        </FormAksi>
      </Kartu>
    </>
  );
}
