"use client";

import { useActionState } from "react";
import { unduhPolis, type StateUnduh } from "./actions";

export function FormUnduh({ token }: { token: string }) {
  const [state, aksi, pending] = useActionState<StateUnduh, FormData>(unduhPolis.bind(null, token), {});
  return (
    <form action={aksi} className="flex flex-col gap-1.5 text-[12px] font-semibold text-ink-2">
      <label htmlFor="digit">Masukkan 4 digit terakhir nomor WhatsApp Anda untuk mengunduh</label>
      <div className="flex gap-2">
        <input
          id="digit"
          name="digit"
          inputMode="numeric"
          maxLength={4}
          placeholder="••••"
          required
          className="h-[46px] min-w-0 flex-1 rounded-xl border border-line-2 px-3.5 text-base tracking-[0.3em] text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
        />
        <button disabled={pending} className="h-[46px] rounded-full bg-ink px-5 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "…" : "Unduh"}
        </button>
      </div>
      {state.error && (
        <p role="alert" className="text-[13px] font-normal text-bad">
          {state.error}
        </p>
      )}
    </form>
  );
}
