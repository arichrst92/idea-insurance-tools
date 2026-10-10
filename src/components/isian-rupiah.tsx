"use client";

import clsx from "clsx";
import type { ComponentProps, FormEvent } from "react";
import { formatRibuan, posisiKursor } from "@/lib/format";
import { kelasInput } from "./ui";

/**
 * Input nominal rupiah: titik ribuan muncul otomatis saat mengetik (1.500.000) dan kursor
 * tetap di posisinya. Nilai terkirim berformat titik; server membacanya dengan parseRupiah().
 */
export function InputRupiah({ defaultValue, className, ...p }: Omit<ComponentProps<"input">, "type" | "onInput">) {
  const rapikan = (e: FormEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const kursor = el.selectionStart ?? el.value.length;
    const digit = el.value.slice(0, kursor).replace(/\D/g, "").length;
    const baru = formatRibuan(el.value);
    if (baru !== el.value) {
      el.value = baru;
      const pos = posisiKursor(baru, digit);
      if (document.activeElement === el) el.setSelectionRange(pos, pos);
    }
  };
  return (
    <div className="relative">
      <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] font-normal text-ink-3">
        Rp
      </span>
      <input
        {...p}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        defaultValue={defaultValue == null || defaultValue === "" ? "" : formatRibuan(String(defaultValue))}
        onInput={rapikan}
        className={clsx(kelasInput, "pl-10 tabular-nums", className)}
      />
    </div>
  );
}

/** Seperti <Isian> tetapi untuk nominal rupiah. */
export function IsianRupiah({ label, hint, className, ...p }: Omit<ComponentProps<"input">, "type" | "onInput"> & { label: string; hint?: string }) {
  return (
    <label className={clsx("flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2", className)}>
      {label}
      <InputRupiah {...p} />
      {hint && <span className="text-xs font-normal text-ink-3">{hint}</span>}
    </label>
  );
}
