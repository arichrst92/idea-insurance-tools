"use client";

import { useActionState, useEffect, useRef, useState, startTransition, type FormEvent, type ReactNode } from "react";
import { siapkanUpload } from "@/lib/kompres-gambar";
import { Pesan, Tombol } from "./ui";

export type StateForm = {
  error?: string;
  ok?: string;
  /** URL yang dibuka di tab baru setelah aksi (mis. wa.me cadangan bila Fonnte gagal). */
  bukaUrl?: string;
};

/**
 * Jalankan server action lewat onSubmit (bukan hanya prop `action`) supaya React
 * tidak mengosongkan isian ketika server menolak data — pengguna cukup
 * memperbaiki satu isian lalu kirim ulang. Foto dikecilkan dulu di browser
 * sehingga upload dari HP tetap cepat dan tidak melewati batas ukuran request.
 */
export function kirimTanpaReset(jalankan: (f: FormData) => void, opsi?: { onGalat?: (pesan: string | null) => void; onProses?: (b: boolean) => void }) {
  return async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const data = new FormData(e.currentTarget, submitter);
    const adaFile = [...data.values()].some((v) => v instanceof File && v.size > 0);
    if (adaFile) {
      opsi?.onProses?.(true);
      const galat = await siapkanUpload(data);
      opsi?.onProses?.(false);
      opsi?.onGalat?.(galat);
      if (galat) return;
    } else {
      opsi?.onGalat?.(null);
    }
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
  const [galatLokal, setGalatLokal] = useState<string | null>(null);
  const [menyiapkan, setMenyiapkan] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetSetelahOk && state.ok) ref.current?.reset();
    if (state.bukaUrl) window.open(state.bukaUrl, "_blank", "noopener");
  }, [state, resetSetelahOk]);

  return (
    <form
      ref={ref}
      action={jalankan}
      onSubmit={kirimTanpaReset(jalankan, { onGalat: setGalatLokal, onProses: setMenyiapkan })}
      className={className ?? "flex flex-col gap-4"}
    >
      {children}
      <Pesan error={galatLokal ?? state.error} ok={galatLokal ? undefined : state.ok} />
      <div>
        <Tombol varian={varian} disabled={pending || menyiapkan}>
          {menyiapkan ? "Menyiapkan file…" : pending ? "Menyimpan…" : tombol}
        </Tombol>
      </div>
    </form>
  );
}
