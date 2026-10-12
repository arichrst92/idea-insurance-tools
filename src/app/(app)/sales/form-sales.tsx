"use client";

import { useState } from "react";
import type { DataFormSales } from "./data-form";
import { IsianRupiah } from "@/components/isian-rupiah";
import { FormAksi, type StateForm } from "@/components/form-aksi";
import { Isian, Pilihan } from "@/components/ui";
import { hitungKomisi, porsiKantorDenganEvent } from "@/lib/domain/komisi";
import { RincianKomisi } from "@/components/rincian-komisi";
import { rupiah } from "@/lib/format";

export function FormSales({
  aksi,
  awal,
  tombol,
  editorOwner,
}: {
  aksi: (prev: StateForm, f: FormData) => Promise<StateForm>;
  awal: DataFormSales;
  tombol: string;
  /** Hanya owner yang boleh mengatur peran staf & kebijakan (bagi hasil, maks cashback, gaji, target). */
  editorOwner: boolean;
}) {
  const [role, setRole] = useState(awal.role);
  const [jugaSales, setJugaSales] = useState(awal.jugaSales);
  const penjual = role === "sales" || (role === "owner" && jugaSales);
  const [tipe, setTipe] = useState(awal.tipeSales);
  const [bagiHasil, setBagiHasil] = useState(awal.bagiHasilKantorPersen);
  const [maksCb, setMaksCb] = useState(awal.maksCashbackNasabahPersen);
  const fulltime = penjual && tipe === "fulltime";

  // Simulasi komisi memakai contoh polis di dokumen (premi 6 jt, cashback total 35%).
  let simulasi: ReturnType<typeof hitungKomisi> | null = null;
  try {
    simulasi = hitungKomisi({
      premiBruto: 6_000_000,
      cashbackTotalPersen: 35,
      cashbackNasabahPersen: Math.min(15, maksCb, 35),
      maksCashbackNasabahPersen: maksCb,
      bagiHasilKantorPersen: bagiHasil,
    });
  } catch {
    simulasi = null;
  }
  // Contoh bila ada event +15% komisi sales.
  let simEvent: ReturnType<typeof hitungKomisi> | null = null;
  try {
    simEvent = hitungKomisi({
      premiBruto: 6_000_000,
      cashbackTotalPersen: 35,
      cashbackNasabahPersen: Math.min(15, maksCb, 35),
      maksCashbackNasabahPersen: maksCb,
      bagiHasilKantorPersen: porsiKantorDenganEvent(bagiHasil, 15),
      bagiHasilKantorNormalPersen: bagiHasil,
    });
  } catch {
    simEvent = null;
  }

  return (
    <FormAksi aksi={aksi} tombol={tombol} className="flex flex-col gap-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-base font-bold">Data diri</legend>
        <Isian label="Nama lengkap" name="nama" defaultValue={awal.nama} required />
        <Isian label="No. WhatsApp (untuk login OTP)" name="noWa" defaultValue={awal.noWa} inputMode="tel" required />
        <Isian label="Email" name="email" type="email" defaultValue={awal.email} />
        {editorOwner ? (
          <Pilihan label="Peran" name="role" value={role} onChange={(e) => setRole(e.target.value as DataFormSales["role"])}>
            <option value="sales">Sales</option>
            <option value="admin">Admin (operasional)</option>
            <option value="owner">Owner</option>
          </Pilihan>
        ) : (
          <input type="hidden" name="role" value="sales" />
        )}
        {role === "owner" && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="jugaSales" checked={jugaSales} onChange={(e) => setJugaSales(e.target.checked)} className="size-4 accent-ink" />
            Juga berjualan — punya nasabah & pengajuan sendiri, komisi dihitung seperti sales
          </label>
        )}
      </fieldset>

      {penjual && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-base font-bold">Tipe sales</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["fulltime", "freelance"] as const).map((t) => (
              <label
                key={t}
                className={`flex cursor-pointer flex-col gap-1 rounded-2xl border p-4 ${tipe === t ? "border-ink bg-white ring-1 ring-ink" : "border-line bg-white"}`}
              >
                <span className="flex items-center gap-2 font-bold">
                  <input type="radio" name="tipeSales" value={t} checked={tipe === t} onChange={() => setTipe(t)} className="accent-ink" />
                  {t === "fulltime" ? "Fulltime" : "Freelance"}
                </span>
                <span className="text-[13px] text-ink-2">
                  {t === "fulltime" ? "Target bulanan + gaji pokok (prorata bila pencapaian < 50%)" : "Tanpa target & gaji, komisi saja"}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {fulltime && !editorOwner && (
        <p className="rounded-xl bg-canvas px-3.5 py-2.5 text-sm text-ink-2">Target bulanan & gaji pokok sales fulltime diatur oleh owner.</p>
      )}

      {fulltime && editorOwner && (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-base font-bold">Target bulan ini & gaji</legend>
          <Isian label="Target case / bulan" name="targetCase" type="number" min={1} defaultValue={awal.targetCase} required />
          <IsianRupiah label="Target revenue premi / bulan" name="targetRevenue" defaultValue={awal.targetRevenue} required />
          <Pilihan label="Target utama (penentu achieve & gaji)" name="targetUtama" defaultValue={awal.targetUtama}>
            <option value="revenue">Revenue</option>
            <option value="case">Case</option>
          </Pilihan>
          <IsianRupiah
            label="Gaji pokok / bulan"
            name="gajiPokok"
            defaultValue={awal.gajiPokok}
            hint="Dibayar = gaji × min(100%, pencapaian × 2)"
            required
          />
        </fieldset>
      )}

      {penjual && !editorOwner && (
        <p className="rounded-xl bg-canvas px-3.5 py-2.5 text-sm text-ink-2">
          Bagi hasil kantor & batas cashback nasabah diatur oleh owner (sekarang maks cashback nasabah {awal.maksCashbackNasabahPersen}%).
        </p>
      )}

      {penjual && editorOwner && (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-base font-bold">Bagi hasil & batas cashback</legend>
          <Isian
            label="Bagi hasil kantor (% dari cashback sales)"
            name="bagiHasilKantorPersen"
            inputMode="decimal"
            value={String(bagiHasil)}
            onChange={(e) => setBagiHasil(Number(e.target.value.replace(",", ".")) || 0)}
          />
          <Isian
            label="Maks cashback ke nasabah (% premi)"
            name="maksCashbackNasabahPersen"
            inputMode="decimal"
            value={String(maksCb)}
            onChange={(e) => setMaksCb(Number(e.target.value.replace(",", ".")) || 0)}
          />
          {simulasi && (
            <div className="rounded-2xl bg-ink p-4 text-white sm:col-span-2">
              <p className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-[#A9B0C2]">
                SIMULASI · PREMI RP 6 JT, CASHBACK TOTAL 35%, KE NASABAH {Math.min(15, maksCb)}%
              </p>
              <dl className="grid grid-cols-2 gap-y-1 text-sm sm:grid-cols-4">
                <dt className="text-[#A9B0C2]">Cashback sales</dt>
                <dd className="font-semibold">{rupiah(simulasi.cashbackSalesRp)}</dd>
                <dt className="text-[#A9B0C2]">Bagian kantor</dt>
                <dd className="font-semibold">{rupiah(simulasi.bagianKantorRp)}</dd>
                <dt className="text-[#A9B0C2]">Komisi sales</dt>
                <dd className="font-extrabold text-[#8FA8FF]">{rupiah(simulasi.komisiSalesRp)}</dd>
              </dl>
              {simEvent && simEvent.komisiEventRp > 0 && (
                <div className="mt-3 border-t border-[#232A3B] pt-3">
                  <p className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-[#A9B0C2]">BILA ADA EVENT +15%</p>
                  <RincianKomisi gelap besar={false} total={simEvent.komisiSalesRp} event={simEvent.komisiEventRp} tambahanPersen={15} porsiSalesNormal={100 - bagiHasil} />
                </div>
              )}
            </div>
          )}
        </fieldset>
      )}

      {penjual && (
        <fieldset className="grid gap-4 sm:grid-cols-[1fr_96px_1fr_1fr]">
          <legend className="mb-3 text-base font-bold">Rekening komisi</legend>
          <Isian label="Bank" name="namaBank" defaultValue={awal.namaBank} />
          <Isian label="Kode" name="kodeBank" defaultValue={awal.kodeBank} maxLength={3} inputMode="numeric" />
          <Isian label="No. rekening" name="noRekening" defaultValue={awal.noRekening} inputMode="numeric" />
          <Isian label="Atas nama" name="atasNama" defaultValue={awal.atasNama} />
        </fieldset>
      )}
    </FormAksi>
  );
}
