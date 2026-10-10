"use client";

import { useState } from "react";
import { FormAksi, type StateForm } from "@/components/form-aksi";
import { hitungKomisi } from "@/lib/domain/komisi";
import { rupiah, persen } from "@/lib/format";

type Opsi = {
  id: string;
  asuransi: string;
  paket: string | null;
  cakupan: string[];
  premi: number;
  cashbackTotalPersen: number;
};

/** Pilih paket dari penawaran asuransi + atur cashback ke nasabah, dengan simulasi komisi langsung. */
export function PilihPenawaran({
  aksi,
  opsi,
  maksCashback,
  bagiHasilKantor,
  namaEvent,
  tambahanEvent,
}: {
  aksi: (s: StateForm, f: FormData) => Promise<StateForm>;
  opsi: Opsi[];
  maksCashback: number;
  bagiHasilKantor: number;
  namaEvent: string | null;
  tambahanEvent: number;
}) {
  const [pilih, setPilih] = useState(opsi[0]?.id);
  const [cb, setCb] = useState(Math.min(15, maksCashback));
  const o = opsi.find((x) => x.id === pilih);
  const batas = o ? Math.min(maksCashback, o.cashbackTotalPersen) : maksCashback;
  const perAsuransi = [...new Set(opsi.map((x) => x.asuransi))];

  let hasil: ReturnType<typeof hitungKomisi> | null = null;
  let galat: string | null = null;
  if (o) {
    try {
      hasil = hitungKomisi({
        premiBruto: o.premi,
        cashbackTotalPersen: o.cashbackTotalPersen,
        cashbackNasabahPersen: cb,
        maksCashbackNasabahPersen: maksCashback,
        bagiHasilKantorPersen: bagiHasilKantor,
      });
    } catch (e) {
      galat = (e as Error).message;
    }
  }

  return (
    <FormAksi aksi={aksi} tombol="Nasabah setuju" className="flex flex-col gap-4">
      {perAsuransi.map((a) => (
        <fieldset key={a} className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-semibold text-ink-2">
            {a} · cashback total {persen(opsi.find((x) => x.asuransi === a)?.cashbackTotalPersen)}
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
        Cashback ke nasabah (% premi) — maks {persen(batas)}
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={batas}
            step={0.5}
            value={Math.min(cb, batas)}
            onChange={(e) => setCb(Number(e.target.value))}
            className="flex-1 accent-brand"
            aria-label="Cashback ke nasabah"
          />
          <input
            name="cashbackNasabahPersen"
            inputMode="decimal"
            value={String(cb)}
            onChange={(e) => setCb(Number(e.target.value.replace(",", ".")) || 0)}
            className="h-10 w-20 rounded-xl border border-line-2 px-3 text-right text-[15px] text-ink"
          />
          <span className="text-ink-3">%</span>
        </div>
      </label>

      {galat && <p className="text-sm text-bad">{galat}</p>}
      {hasil && o && (
        <div className="rounded-2xl bg-ink p-4 text-white">
          <p className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-[#A9B0C2]">
            RINGKASAN · KANTOR {persen(bagiHasilKantor)} / SALES {persen(100 - bagiHasilKantor)}
            {namaEvent && ` · EVENT ${namaEvent.toUpperCase()} +${persen(tambahanEvent)}`}
          </p>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-[#A9B0C2]">Dibayar nasabah ({o.paket})</dt>
            <dd className="text-right font-semibold">{rupiah(o.premi)}</dd>
            <dt className="text-[#A9B0C2]">Cashback total</dt>
            <dd className="text-right">{rupiah(hasil.cashbackTotalRp)}</dd>
            <dt className="text-[#A9B0C2]">Cashback ke nasabah</dt>
            <dd className="text-right">{rupiah(hasil.cashbackNasabahRp)}</dd>
            <dt className="text-[#A9B0C2]">Bagian kantor</dt>
            <dd className="text-right">{rupiah(hasil.bagianKantorRp)}</dd>
            <dt className="text-[#C9D5FF]">Komisi sales</dt>
            <dd className="text-right text-lg font-extrabold text-[#8FA8FF]">{rupiah(hasil.komisiSalesRp)}</dd>
          </dl>
        </div>
      )}
    </FormAksi>
  );
}
