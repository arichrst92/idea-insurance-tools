import Link from "next/link";
import clsx from "clsx";
import { wajibLogin } from "@/lib/auth/session";
import { Kartu, KepalaHalaman, Kosong, Lencana } from "@/components/ui";
import { Angka } from "@/components/laporan";
import { LABEL_TAHAP, dataPencairan, rekapKomisiSiapBayar, type BarisCair, type Tahap } from "@/lib/pencairan";
import { waktuWib } from "@/lib/domain/perpanjangan";
import { rupiah } from "@/lib/format";

export const metadata = { title: "Pencairan" };

const TAB_ADMIN: (Tahap | "selesai")[] = ["setor", "cair", "nasabah", "komisi", "selesai"];
const TAB_SALES: (Tahap | "selesai")[] = ["nasabah", "komisi", "selesai"];

export default async function HalamanPencairan({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { user } = await wajibLogin();
  const admin = user.role === "admin";
  const { tab: tabQ } = await searchParams;
  const tabs = admin ? TAB_ADMIN : TAB_SALES;
  const tab = (tabs.includes(tabQ as Tahap) ? tabQ : tabs[0]) as Tahap | "selesai";
  const hariIni = waktuWib().tanggal;
  const [{ tahap, selesai }, rekap] = await Promise.all([dataPencairan(user, hariIni), admin && tab === "komisi" ? rekapKomisiSiapBayar() : Promise.resolve([])]);

  const label = (t: Tahap | "selesai") =>
    t === "selesai" ? "Selesai" : !admin && t === "komisi" ? "Komisi Anda" : !admin && t === "cair" ? "Dana asuransi" : LABEL_TAHAP[t];
  const jumlah = (t: Tahap | "selesai") => (t === "selesai" ? selesai.length : tahap[t].length);
  const nominal = (t: Tahap, r: BarisCair) =>
    t === "setor" ? r.premi : t === "cair" ? (r.cashbackTotal ?? 0) : t === "nasabah" ? r.cashbackNasabah : r.komisi;
  const daftar = tab === "selesai" ? selesai : tahap[tab];
  const komisiMenunggu = [...tahap.setor, ...tahap.cair].filter((r) => !r.tglTransferSales);

  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Pencairan" }]}
        judul="Pencairan"
        sorot={admin ? "& tertunggak" : "saya"}
        sub={
          admin
            ? "Urutan: setor premi ke asuransi → dana asuransi cair → transfer cashback nasabah & komisi sales. Catat setiap tahap di halaman pengajuan."
            : "Status cashback untuk nasabah Anda dan komisi Anda."
        }
      />

      <div className={clsx("grid gap-3", admin ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 lg:grid-cols-3")} data-uji="ringkasan-tertunggak">
        {admin ? (
          (["setor", "cair", "nasabah", "komisi"] as Tahap[]).map((t) => {
            const d = tahap[t];
            const lewat = t === "cair" ? d.filter((r) => r.lewatTermin).length : 0;
            return (
              <Angka
                key={t}
                label={LABEL_TAHAP[t]}
                nilai={d.length}
                sub={d.length ? `${rupiah(d.reduce((a, r) => a + nominal(t, r), 0))} · terlama ${d[0].umur} hari${lewat ? ` · ${lewat} lewat termin` : ""}` : "Tidak ada"}
                href={`/pencairan?tab=${t}`}
                nada={lewat ? "bad" : d.some((r) => r.umur > 7) ? "warn" : undefined}
              />
            );
          })
        ) : (
          <>
            <Angka label="Cashback nasabah belum ditransfer" nilai={tahap.nasabah.length} sub={rupiah(tahap.nasabah.reduce((a, r) => a + r.cashbackNasabah, 0))} />
            <Angka label="Komisi siap ditransfer" nilai={rupiah(tahap.komisi.reduce((a, r) => a + r.komisi, 0))} sub={`${tahap.komisi.length} polis, dana asuransi sudah cair`} nada="ok" />
            <Angka label="Komisi menunggu dana asuransi" nilai={rupiah(komisiMenunggu.reduce((a, r) => a + r.komisi, 0))} sub={`${komisiMenunggu.length} polis`} />
          </>
        )}
      </div>

      <nav aria-label="Tahap" className="overflow-x-auto">
        <ul className="inline-flex gap-1 rounded-full border border-line bg-white p-1 text-[13px] font-semibold">
          {tabs.map((t) => (
            <li key={t}>
              <Link
                href={`/pencairan?tab=${t}`}
                aria-current={t === tab ? "page" : undefined}
                className={clsx("flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5", t === tab ? "bg-ink text-white" : "text-ink-2")}
              >
                {label(t)}
                <span className={clsx("rounded-full px-1.5 text-[11px]", t === tab ? "bg-white/20" : "bg-canvas text-ink-3")}>{jumlah(t)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {admin && tab === "komisi" && (
        <Kartu className="flex flex-col gap-3" data-uji="rekap-komisi">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold">Rekap komisi siap bayar</h2>
            {rekap.length > 0 && (
              <a href="/api/pencairan/rekap-komisi" download className="inline-flex h-9 items-center rounded-full border border-line-2 bg-white px-4 text-sm font-semibold">
                Unduh CSV transfer
              </a>
            )}
          </div>
          {rekap.length === 0 ? (
            <p className="text-sm text-ink-3">Belum ada komisi yang siap dibayar.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line text-sm">
              {rekap.map((r) => (
                <li key={r.salesId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <b>{r.sales}</b> · {r.polis} polis
                    <span className="block text-xs text-ink-3">
                      {r.noRekening ? `${r.bank} ${r.noRekening} a.n. ${r.atasNama}` : <span className="text-bad">Rekening utama belum diisi</span>}
                    </span>
                  </span>
                  <span className="font-bold tabular-nums">{rupiah(r.total)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[12px] text-ink-3">CSV berisi rekening & nominal per sales. Format unggah BCA (sesama/antarbank) dan jadwal bayar menyusul di Sprint 6.</p>
        </Kartu>
      )}

      {daftar.length === 0 ? (
        <Kosong>Tidak ada polis di tahap ini.</Kosong>
      ) : (
        <Kartu className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm" data-uji="tabel-pencairan">
            <thead className="text-left text-[11px] uppercase tracking-wider text-ink-3">
              <tr className="border-b border-line">
                <th className="px-5 py-3 font-semibold">Polis</th>
                <th className="px-3 py-3 font-semibold">Nasabah</th>
                <th className="px-3 py-3 font-semibold">{tab === "selesai" ? "Selesai" : "Sejak"}</th>
                {tab !== "selesai" && <th className="px-3 py-3 text-right font-semibold">Umur</th>}
                <th className="px-3 py-3 text-right font-semibold">
                  {tab === "setor" ? "Premi" : tab === "cair" ? "Estimasi dana" : tab === "nasabah" ? "Cashback nasabah" : admin ? "Komisi" : "Komisi Anda"}
                </th>
                {!admin && tab !== "nasabah" && <th className="px-5 py-3 font-semibold">Status</th>}
              </tr>
            </thead>
            <tbody>
              {daftar.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0 hover:bg-canvas">
                  <td className="px-5 py-3">
                    <Link href={`/pengajuan/${r.id}`} className="font-semibold hover:text-brand">
                      {r.noPolis ?? r.kode}
                    </Link>
                    <div className="text-xs text-ink-3">
                      {r.asuransi}
                      {admin && ` · ${r.sales}`}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {r.nasabah}
                    <div className="text-xs text-ink-3">{r.plat}</div>
                  </td>
                  <td className="px-3 py-3 tabular-nums text-ink-2">{r.sejak ?? "–"}</td>
                  {tab !== "selesai" && (
                    <td className="px-3 py-3 text-right">
                      <span className={clsx("tabular-nums", r.lewatTermin ? "font-bold text-bad" : r.umur > 7 ? "font-semibold text-warn" : "text-ink-2")}>{r.umur} hari</span>
                      {r.lewatTermin && (
                        <div>
                          <Lencana nada="bad">LEWAT TERMIN {r.terminHari} HARI</Lencana>
                        </div>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-3 text-right tabular-nums">
                    {tab === "selesai" ? rupiah(r.komisi) : rupiah(nominal(tab, r))}
                  </td>
                  {!admin && tab !== "nasabah" && (
                    <td className="px-5 py-3">{r.tglTransferSales ? <Lencana nada="ok">DITRANSFER {r.tglTransferSales}</Lencana> : <Lencana nada="brand">SIAP DITRANSFER</Lencana>}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Kartu>
      )}
    </>
  );
}
