"use client";

import { useState } from "react";
import { FormAksi, type StateForm } from "@/components/form-aksi";
import { Isian, Pilihan } from "@/components/ui";
import { hitungKomisi } from "@/lib/domain/komisi";
import { rupiah } from "@/lib/format";

export type DataFormSales = {
  nama: string;
  noWa: string;
  email: string;
  role: "admin" | "sales";
  tipeSales: "fulltime" | "freelance" | "";
  bagiHasilKantorPersen: number;
  maksCashbackNasabahPersen: number;
  gajiPokok: string;
  targetCase: string;
  targetRevenue: string;
  targetUtama: "case" | "revenue";
  namaBank: string;
  kodeBank: string;
  noRekening: string;
  atasNama: string;
};

export const FORM_KOSONG: DataFormSales = {
  nama: "",
  noWa: "",
  email: "",
  role: "sales",
  tipeSales: "fulltime",
  bagiHasilKantorPersen: 30,
  maksCashbackNasabahPersen: 20,
  gajiPokok: "",
  targetCase: "",
  targetRevenue: "",
  targetUtama: "revenue",
  namaBank: "BCA",
  kodeBank: "014",
  noRekening: "",
  atasNama: "",
};

export function FormSales({
  aksi,
  awal,
  tombol,
}: {
  aksi: (prev: StateForm, f: FormData) => Promise<StateForm>;
  awal: DataFormSales;
  tombol: string;
}) {
  const [role, setRole] = useState(awal.role);
  const [tipe, setTipe] = useState(awal.tipeSales);
  const [bagiHasil, setBagiHasil] = useState(awal.bagiHasilKantorPersen);
  const [maksCb, setMaksCb] = useState(awal.maksCashbackNasabahPersen);
  const fulltime = role === "sales" && tipe === "fulltime";

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

  return (
    <FormAksi aksi={aksi} tombol={tombol} className="flex flex-col gap-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-base font-bold">Data diri</legend>
        <Isian label="Nama lengkap" name="nama" defaultValue={awal.nama} required />
        <Isian label="No. WhatsApp (untuk login OTP)" name="noWa" defaultValue={awal.noWa} inputMode="tel" required />
        <Isian label="Email" name="email" type="email" defaultValue={awal.email} />
        <Pilihan label="Peran" name="role" value={role} onChange={(e) => setRole(e.target.value as "admin" | "sales")}>
          <option value="sales">Sales</option>
          <option value="admin">Admin / owner</option>
        </Pilihan>
      </fieldset>

      {role === "sales" && (
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

      {fulltime && (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-base font-bold">Target bulan ini & gaji</legend>
          <Isian label="Target case / bulan" name="targetCase" type="number" min={1} defaultValue={awal.targetCase} required />
          <Isian label="Target revenue premi / bulan (Rp)" name="targetRevenue" inputMode="numeric" defaultValue={awal.targetRevenue} required />
          <Pilihan label="Target utama (penentu achieve & gaji)" name="targetUtama" defaultValue={awal.targetUtama}>
            <option value="revenue">Revenue</option>
            <option value="case">Case</option>
          </Pilihan>
          <Isian
            label="Gaji pokok / bulan (Rp)"
            name="gajiPokok"
            inputMode="numeric"
            defaultValue={awal.gajiPokok}
            hint="Dibayar = gaji × min(100%, pencapaian × 2)"
            required
          />
        </fieldset>
      )}

      {role === "sales" && (
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
            </div>
          )}
        </fieldset>
      )}

      {role === "sales" && (
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
