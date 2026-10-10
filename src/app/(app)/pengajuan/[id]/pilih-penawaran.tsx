"use client";

import { useState } from "react";
import { FormAksi, type StateForm } from "@/components/form-aksi";
import { RincianKomisi } from "@/components/rincian-komisi";
import { rupiah, persen } from "@/lib/format";
import { LANGKAH_CB, type OpsiPenawaran } from "./opsi-penawaran";

const snap = (v: number, batas: number) => Math.min(batas, Math.max(0, Math.round(v / LANGKAH_CB) * LANGKAH_CB));

/**
 * Pilih paket dari penawaran asuransi + atur cashback ke nasabah, dengan simulasi komisi langsung.
 * Untuk sales, browser hanya menerima tabel komisi per cashback nasabah (kelipatan 0,5%) — tanpa
 * cashback dari asuransi maupun bagian kantor.
 */
export function PilihPenawaran({
  aksi,
  opsi,
  admin,
  kantor,
  namaEvent,
  tambahanEvent,
  pilihanNasabahId,
}: {
  aksi: (s: StateForm, f: FormData) => Promise<StateForm>;
  opsi: OpsiPenawaran[];
  admin: boolean;
  /** Hanya untuk admin: % kantor berlaku & normal */
  kantor?: { berlaku: number; normal: number };
  namaEvent: string | null;
  tambahanEvent: number;
  pilihanNasabahId: string | null;
}) {
  const [pilih, setPilih] = useState(opsi.find((x) => x.id === pilihanNasabahId)?.id ?? opsi[0]?.id);
  const o = opsi.find((x) => x.id === pilih);
  const batas = o?.batas ?? 0;
  const [cbMentah, setCb] = useState(15);
  const cb = snap(cbMentah, batas);
  const t = o?.tabel.find((x) => x.cb === cb) ?? null;
  const perAsuransi = [...new Set(opsi.map((x) => x.asuransi))];

  return (
    <FormAksi aksi={aksi} tombol="Nasabah setuju" className="flex flex-col gap-4">
      {perAsuransi.map((a) => (
        <fieldset key={a} className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-semibold text-ink-2">
            {a}
            {admin && ` · cashback total ${persen(opsi.find((x) => x.asuransi === a)?.cashbackTotalPersen)}`}
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {opsi
              .filter((x) => x.asuransi === a)
              .map((x) => (
                <label
                  key={x.id}
                  className="flex cursor-pointer flex-col gap-1 rounded-2xl border border-line p-3 has-[:checked]:border-ink has-[:checked]:ring-1 has-[:checked]:ring-ink"
                >
                  <span className="flex items-center gap-2">
                    <input type="radio" name="penawaranId" value={x.id} checked={pilih === x.id} onChange={() => setPilih(x.id)} className="accent-ink" />
                    <b>{x.paket ?? "Penawaran"}</b>
                  </span>
                  {x.id === pilihanNasabahId && (
                    <span className="self-start rounded-full bg-ok-soft px-2 py-0.5 text-[10px] font-bold tracking-wide text-ok">DIPILIH NASABAH</span>
                  )}
                  <span className="text-base font-extrabold">{rupiah(x.premi)}</span>
                </label>
              ))}
          </div>
        </fieldset>
      ))}

      {o && o.cakupan.length > 0 && (
        <div className="rounded-2xl bg-canvas p-3.5 text-[13px] text-ink-2">
          <b className="text-ink">Paket {o.paket} menjamin:</b>
          <ul className="mt-1 list-disc pl-5">
            {o.cakupan.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
        Cashback untuk nasabah (% premi) — maks {persen(batas)} untuk penawaran ini
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={batas}
            step={LANGKAH_CB}
            value={cb}
            onChange={(e) => setCb(Number(e.target.value))}
            className="flex-1 accent-brand"
            aria-label="Cashback untuk nasabah"
          />
          <input
            type="number"
            min={0}
            max={batas}
            step={LANGKAH_CB}
            inputMode="decimal"
            value={cb}
            onChange={(e) => setCb(Number(e.target.value) || 0)}
            className="h-10 w-20 rounded-xl border border-line-2 px-3 text-right text-[15px] text-ink"
            aria-label="Persen cashback untuk nasabah"
          />
          <span className="text-ink-3">%</span>
        </div>
        <input type="hidden" name="cashbackNasabahPersen" value={String(cb)} />
        <span className="text-[12px] font-normal text-ink-3">Makin besar cashback untuk nasabah, makin kecil komisi Anda.</span>
      </label>

      {t && o && (
        <div className="rounded-2xl bg-ink p-4 text-white">
          <p className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-[#A9B0C2]">
            RINGKASAN
            {admin && kantor && ` · KANTOR ${persen(kantor.berlaku)} / SALES ${persen(100 - kantor.berlaku)}`}
            {namaEvent && ` · EVENT ${namaEvent.toUpperCase()} +${persen(tambahanEvent)}`}
          </p>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-[#A9B0C2]">Dibayar nasabah ({o.paket})</dt>
            <dd className="text-right font-semibold">{rupiah(o.premi)}</dd>
            {admin && t.totalRp != null && (
              <>
                <dt className="text-[#A9B0C2]">Cashback total</dt>
                <dd className="text-right">{rupiah(t.totalRp)}</dd>
              </>
            )}
            <dt className="text-[#A9B0C2]">Cashback untuk nasabah</dt>
            <dd className="text-right">{rupiah(t.nasabahRp)}</dd>
            {admin && t.kantorRp != null && (
              <>
                <dt className="text-[#A9B0C2]">Bagian kantor</dt>
                <dd className="text-right">{rupiah(t.kantorRp)}</dd>
              </>
            )}
          </dl>
          <div className="mt-3 border-t border-[#232A3B] pt-3">
            <RincianKomisi
              gelap
              untukSales={!admin}
              total={t.komisi}
              event={t.event}
              namaEvent={namaEvent}
              tambahanPersen={tambahanEvent}
              porsiSalesNormal={admin && kantor ? 100 - kantor.normal : null}
            />
          </div>
        </div>
      )}
    </FormAksi>
  );
}
