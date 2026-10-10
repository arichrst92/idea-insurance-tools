"use client";

import { useActionState } from "react";
import { aksiLogin, type StateLogin } from "./actions";
import { formatNoWa } from "@/lib/wa";
import { Tombol } from "@/components/ui";
import { kirimTanpaReset } from "@/components/form-aksi";

const awal: StateLogin = { langkah: "nomor" };

export function FormLogin() {
  const [state, aksi, pending] = useActionState(aksiLogin, awal);

  return (
    <form action={aksi} onSubmit={kirimTanpaReset(aksi)} className="flex flex-col gap-4 rounded-3xl border border-line bg-white p-5">
      {state.langkah === "nomor" ? (
        <>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
            Nomor WhatsApp
            <input
              name="noWa"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0812 3456 7890"
              required
              className="h-12 rounded-xl border border-line-2 px-4 text-base text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
            />
          </label>
          <Tombol name="aksi" value="minta" disabled={pending} className="h-12">
            {pending ? "Mengirim…" : "Kirim kode"}
          </Tombol>
        </>
      ) : (
        <>
          <p className="text-[13px] text-ink-2">
            Kode dikirim ke <b className="text-ink">{formatNoWa(state.noWa ?? "")}</b>.{" "}
            <button name="aksi" value="ganti-nomor" formNoValidate className="font-semibold text-brand">
              Ganti nomor
            </button>
          </p>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
            Kode 6 digit
            <input
              name="kode"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              required
              autoFocus
              className="h-14 rounded-xl border border-line-2 px-4 text-center text-2xl font-bold tracking-[0.5em] text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
            />
          </label>
          <label className="flex items-center gap-2.5 text-sm text-ink-2">
            <input type="checkbox" name="ingat" defaultChecked className="size-4 accent-brand" />
            Ingat perangkat ini (tetap masuk 30 hari)
          </label>
          <Tombol name="aksi" value="verifikasi" disabled={pending} className="h-12">
            {pending ? "Memeriksa…" : "Masuk"}
          </Tombol>
          <button
            name="aksi"
            value="kirim-ulang"
            formNoValidate
            disabled={pending}
            className="text-sm font-semibold text-brand disabled:opacity-50"
          >
            Kirim ulang kode
          </button>
        </>
      )}
      {state.error && <p role="alert" className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm text-bad">{state.error}</p>}
      {state.pesan && !state.error && <p className="rounded-xl bg-ok-soft px-3.5 py-2.5 text-sm text-ok">{state.pesan}</p>}
    </form>
  );
}
