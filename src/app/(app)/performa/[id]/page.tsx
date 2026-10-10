import { notFound, redirect } from "next/navigation";
import clsx from "clsx";
import { wajibLogin } from "@/lib/auth/session";
import { Kartu, KepalaHalaman, Lencana } from "@/components/ui";
import { Angka } from "@/components/laporan";
import { detailPerforma } from "@/lib/performa";
import { waktuWib } from "@/lib/domain/perpanjangan";
import { namaBulanId } from "@/lib/domain/periode";
import { angka, persen, rupiah } from "@/lib/format";

export const metadata = { title: "Detail performa" };

function Progres({ label, nilai, target, p, format }: { label: string; nilai: number; target: number; p: number; format: (n: number) => string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums text-ink-2">
          {format(nilai)} / {format(target)}
        </span>
      </div>
      <div className="h-3 rounded-full bg-canvas">
        <div className={clsx("h-3 rounded-full", p >= 100 ? "bg-ok" : "bg-brand")} style={{ width: `${Math.min(100, p)}%` }} />
      </div>
      <span className={clsx("text-[13px] font-bold", p >= 100 ? "text-ok" : "text-ink-2")}>{persen(p)}</span>
    </div>
  );
}

export default async function DetailPerforma({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await wajibLogin();
  const { id } = await params;
  if (user.role !== "admin" && id !== user.id) redirect(`/performa/${user.id}`);
  const d = await detailPerforma(id, waktuWib().tanggal);
  if (!d || d.sales.role !== "sales") notFound();
  const { sales: s, sekarang: k } = d;
  const fulltime = s.tipeSales === "fulltime";

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Performa", href: "/performa" }, { label: s.nama }]}
        judul={user.id === id ? "Performa" : s.nama}
        sorot={user.id === id ? "saya" : undefined}
        sub={`${fulltime ? "Fulltime" : "Freelance"} · ${namaBulanId(k.bulan)} berjalan`}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Angka label="Polis lunas bulan ini" nilai={angka(k.polis)} />
        <Angka label="Premi bulan ini" nilai={rupiah(k.premi)} />
        <Angka label={user.id === id ? "Komisi Anda" : "Komisi"} nilai={rupiah(k.komisi)} />
        <Angka label="Bulan achieve" nilai={`${d.achieve} / ${d.achieve + d.tidakAchieve}`} sub={d.achieve + d.tidakAchieve ? `${d.rasioAchieve}% bulan tercapai (12 bln)` : "Belum ada bulan ditutup"} />
      </div>

      {k.target && k.capaian ? (
        <Kartu className="flex flex-col gap-4" data-uji="progres-target">
          <h2 className="text-base font-bold">Target {namaBulanId(k.bulan)}</h2>
          <Progres label="Case (polis)" nilai={k.polis} target={k.target.targetCase} p={k.capaian.pCase} format={angka} />
          <Progres label="Revenue (premi)" nilai={k.premi} target={k.target.targetRevenue} p={k.capaian.pRev} format={rupiah} />
          <p className="text-[13px] text-ink-3">
            Target utama: <b>{k.capaian.utama}</b>. Polis dihitung pada bulan tanggal lunasnya. Bulan dihitung achieve bila target utama tercapai (≥ 100%).
          </p>
          {d.estimasiGaji && (
            <div className="rounded-2xl bg-canvas p-4 text-sm" data-uji="estimasi-gaji">
              <div className="flex items-baseline justify-between">
                <span className="font-semibold">Estimasi gaji bulan ini</span>
                <span className="text-lg font-extrabold">{rupiah(d.estimasiGaji.gajiDibayar)}</span>
              </div>
              <p className="mt-1 text-[13px] text-ink-3">
                {persen(d.estimasiGaji.persenGaji)} dari gaji pokok {rupiah(d.gajiPokok)}. Pencapaian ≥ 50% = gaji penuh; di bawahnya prorata. Angka final dihitung
                saat tutup buku tanggal 1.
              </p>
            </div>
          )}
        </Kartu>
      ) : (
        <Kartu>
          <p className="text-sm text-ink-3">{fulltime ? "Target bulan ini belum diisi admin." : "Sales freelance tidak memiliki target bulanan."}</p>
        </Kartu>
      )}

      <Kartu className="overflow-x-auto p-0" data-uji="riwayat-bulanan">
        <h2 className="px-5 pt-4 text-base font-bold">Riwayat 12 bulan</h2>
        <table className="mt-2 w-full min-w-[720px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-ink-3">
            <tr className="border-b border-line">
              <th className="px-5 py-2 font-semibold">Bulan</th>
              <th className="px-3 py-2 text-right font-semibold">Polis</th>
              <th className="px-3 py-2 text-right font-semibold">Premi</th>
              <th className="px-3 py-2 text-right font-semibold">Target utama</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              {fulltime && <th className="px-5 py-2 text-right font-semibold">Gaji dibayar</th>}
            </tr>
          </thead>
          <tbody>
            {d.riwayat.map((r) => (
              <tr key={r.bulan} className="border-b border-line last:border-0">
                <td className="px-5 py-2.5 font-semibold">{namaBulanId(r.bulan)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.polis}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{rupiah(r.premi)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.capaian ? persen(r.capaian.pUtama) : "–"}</td>
                <td className="px-3 py-2.5">
                  {r.ditutup ? (
                    r.tercapai ? <Lencana nada="ok">ACHIEVE</Lencana> : <Lencana nada="bad">TIDAK ACHIEVE</Lencana>
                  ) : r.target ? (
                    <Lencana nada="brand">BERJALAN</Lencana>
                  ) : (
                    <span className="text-ink-3">–</span>
                  )}
                </td>
                {fulltime && <td className="px-5 py-2.5 text-right tabular-nums">{r.target?.gajiDibayar != null ? rupiah(r.target.gajiDibayar) : "–"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </Kartu>
    </>
  );
}
