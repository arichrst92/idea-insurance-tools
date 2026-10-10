import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bengkel, dokumen, kendaraan, nasabah, perusahaanAsuransi, polis, users } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { FormAksi } from "@/components/form-aksi";
import { IsianPanjang, Kartu, KepalaHalaman, Lencana, Pilihan } from "@/components/ui";
import { klaimMilik, tambahFotoKlaim, ubahKlaim } from "../actions";
import { Galeri, LABEL_KLAIM, kelasFile } from "../galeri";

export const metadata = { title: "Detail klaim" };

export default async function DetailKlaim({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await wajibLogin();
  const { id } = await params;
  const k = await klaimMilik(user, id);
  if (!k) notFound();
  const [[b], foto, daftarBengkel] = await Promise.all([
    db
      .select({ p: polis, n: nasabah, kd: kendaraan, asuransi: perusahaanAsuransi.nama, bengkel: bengkel.nama, pencatat: users.nama })
      .from(polis)
      .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
      .innerJoin(kendaraan, eq(kendaraan.id, polis.kendaraanId))
      .leftJoin(perusahaanAsuransi, eq(perusahaanAsuransi.id, polis.perusahaanId))
      .leftJoin(bengkel, eq(bengkel.id, k.bengkelId ?? ""))
      .leftJoin(users, eq(users.id, k.dicatatOleh ?? ""))
      .where(eq(polis.id, k.polisId)),
    db
      .select()
      .from(dokumen)
      .where(and(eq(dokumen.pemilikTipe, "klaim"), eq(dokumen.pemilikId, id)))
      .orderBy(asc(dokumen.dibuat)),
    db.select().from(bengkel).where(eq(bengkel.aktif, true)).orderBy(asc(bengkel.nama)),
  ]);
  const st = LABEL_KLAIM[k.status];

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Klaim", href: "/klaim" }, { label: b.kd.noPolisi }]}
        judul="Klaim"
        sorot={b.kd.noPolisi}
        sub={
          <>
            {b.n.nama} · {b.kd.merek} {b.kd.model} · polis{" "}
            <Link href={`/pengajuan/${b.p.id}`} className="font-semibold text-brand">
              {b.p.noPolis}
            </Link>{" "}
            ({b.asuransi})
          </>
        }
        aksi={<Lencana nada={st[1]}>{st[0]}</Lencana>}
      />
      <div className="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Kartu className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-ink-3">Tanggal kejadian</dt>
            <dd className="font-semibold">{k.tglKlaim}</dd>
            <dt className="text-ink-3">Bengkel</dt>
            <dd>{b.bengkel ?? "Belum ditentukan"}</dd>
            <dt className="text-ink-3">Masa polis</dt>
            <dd>
              {b.p.tglMulai} s/d {b.p.tglAkhir}
            </dd>
            <dt className="text-ink-3">Dicatat</dt>
            <dd>
              {b.pencatat ?? "-"} · {k.dibuat.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}
            </dd>
          </dl>
          {k.catatan && <p className="whitespace-pre-line rounded-2xl bg-canvas p-3 text-sm text-ink-2">{k.catatan}</p>}
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-bold">Foto ({foto.length})</h2>
            <Galeri daftar={foto} label="Foto klaim" />
          </div>
          <FormAksi aksi={tambahFotoKlaim.bind(null, id)} tombol="Tambah foto" varian="kedua" resetSetelahOk className="flex flex-col gap-3 border-t border-line pt-4">
            <input type="file" name="foto" multiple required accept="image/*,application/pdf" aria-label="Tambah foto klaim" className={kelasFile} />
          </FormAksi>
        </Kartu>
        <Kartu className="flex flex-col gap-3">
          <h2 className="text-base font-bold">Perbarui klaim</h2>
          <FormAksi aksi={ubahKlaim.bind(null, id)} tombol="Simpan">
            <Pilihan label="Status" name="status" defaultValue={k.status}>
              <option value="diproses">Diproses</option>
              <option value="selesai">Selesai</option>
              <option value="ditolak">Ditolak asuransi</option>
            </Pilihan>
            <Pilihan label="Bengkel" name="bengkelId" defaultValue={k.bengkelId ?? ""}>
              <option value="">— belum ditentukan —</option>
              {daftarBengkel.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nama}
                </option>
              ))}
            </Pilihan>
            <IsianPanjang label="Catatan" name="catatan" defaultValue={k.catatan ?? ""} />
          </FormAksi>
        </Kartu>
      </div>
    </>
  );
}
