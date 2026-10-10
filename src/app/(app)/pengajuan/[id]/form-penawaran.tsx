"use client";

import { useState } from "react";
import Link from "next/link";
import { FormAksi, type StateForm } from "@/components/form-aksi";
import { Isian } from "@/components/ui";

type Asuransi = { id: string; nama: string; paket: { id: string; nama: string }[] };

const kelasInput =
  "h-11 rounded-xl border border-line-2 bg-white px-3.5 text-[15px] text-ink outline-none placeholder:text-ink-4 focus:border-brand focus:ring-4 focus:ring-brand-soft";

/** Input penawaran: pilih asuransi → isi premi tiap paket milik asuransi itu. */
export function FormPenawaran({ aksi, asuransi }: { aksi: (s: StateForm, f: FormData) => Promise<StateForm>; asuransi: Asuransi[] }) {
  const [pilih, setPilih] = useState("");
  const a = asuransi.find((x) => x.id === pilih);

  return (
    <FormAksi aksi={aksi} tombol="Simpan penawaran" resetSetelahOk>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
          Asuransi
          <select name="perusahaanId" required value={pilih} onChange={(e) => setPilih(e.target.value)} className={kelasInput}>
            <option value="" disabled>
              Pilih…
            </option>
            {asuransi.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nama}
              </option>
            ))}
          </select>
        </label>
        <Isian label="Cashback total dari asuransi (%)" name="cashbackTotalPersen" inputMode="decimal" required />
      </div>

      {a &&
        (a.paket.length === 0 ? (
          <p className="rounded-xl bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
            {a.nama} belum punya paket coverage.{" "}
            <Link href={`/master/asuransi/${a.id}`} className="font-bold underline">
              Tambahkan paketnya
            </Link>{" "}
            dulu.
          </p>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[13px] font-semibold text-ink-2">Premi tahun pertama per paket {a.nama}</legend>
            {a.paket.map((k) => (
              <label key={k.id} className="grid grid-cols-[110px_1fr] items-center gap-3 text-sm">
                <span className="font-semibold">{k.nama}</span>
                <input name={`premi_${k.id}`} inputMode="numeric" placeholder="Kosongkan bila tidak ditawarkan" className={kelasInput} />
              </label>
            ))}
          </fieldset>
        ))}

      <Isian label="Catatan internal (tidak terlihat sales)" name="catatan" placeholder="Mis. used car, TSI Rp 415.000.000, sudah termasuk biaya polis" />
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
        File penawaran dari asuransi (opsional, hanya admin yang bisa membuka)
        <input
          type="file"
          name="file"
          accept="image/*,application/pdf"
          className="w-full text-sm text-ink-2 file:mr-3 file:h-9 file:rounded-full file:border-0 file:bg-brand-soft file:px-4 file:text-sm file:font-semibold file:text-brand-ink"
        />
      </label>
    </FormAksi>
  );
}
