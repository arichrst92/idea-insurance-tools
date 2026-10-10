"use client";

import { useActionState, useEffect, useRef, startTransition, type FormEvent, type ReactNode } from "react";
import { Pesan, Tombol } from "./ui";

export type StateForm = { error?: string; ok?: string };

/**
 * Jalankan server action lewat onSubmit (bukan prop `action`) supaya React
 * tidak mengosongkan isian ketika server menolak data — pengguna cukup
 * memperbaiki satu isian lalu kirim ulang.
 */
export function kirimTanpaReset(jalankan: (f: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const data = new FormData(e.currentTarget, submitter);
    startTransition(() => jalankan(data));
  };
}

/** Form generik untuk server action yang mengembalikan {error, ok}. */
export function FormAksi({
  aksi,
  children,
  tombol = "Simpan",
  className,
  resetSetelahOk = false,
  varian = "utama",
}: {
  aksi: (prev: StateForm, form: FormData) => Promise<StateForm>;
  children: ReactNode;
  tombol?: string;
  className?: string;
  resetSetelahOk?: boolean;
  varian?: "utama" | "kedua" | "bahaya";
}) {
  const [state, jalankan, pending] = useActionState(aksi, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetSetelahOk && state.ok) ref.current?.reset();
  }, [state, resetSetelahOk]);

  return (
    <form ref={ref} action={jalankan} onSubmit={kirimTanpaReset(jalankan)} className={className ?? "flex flex-col gap-4"}>
      {children}
      <Pesan error={state.error} ok={state.ok} />
      <div>
        <Tombol varian={varian} disabled={pending}>
          {pending ? "Menyimpan…" : tombol}
        </Tombol>
      </div>
    </form>
  );
}
