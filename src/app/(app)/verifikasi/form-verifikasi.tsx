"use client";

import { useActionState } from "react";
import { Isian, Pesan, Tombol } from "@/components/ui";
import { kirimTanpaReset } from "@/components/form-aksi";
import { aksiVerifikasi, type StateVerifikasi } from "./actions";

export function FormVerifikasi({ lanjut, noWa }: { lanjut: string; noWa: string }) {
  const [state, aksi, pending] = useActionState<StateVerifikasi, FormData>(aksiVerifikasi.bind(null, lanjut), {});
  return (
    <form action={aksi} onSubmit={kirimTanpaReset(aksi)} className="flex flex-col gap-4">
      {!state.terkirim ? (
        <>
          <p className="text-sm text-ink-2">
            Kode akan dikirim ke WhatsApp <b className="text-ink">{noWa}</b>.
          </p>
          <div>
            <Tombol name="aksi" value="kirim" disabled={pending}>
              {pending ? "Mengirim…" : "Kirim kode"}
            </Tombol>
          </div>
        </>
      ) : (
        <>
          <Isian label="Kode 6 digit" name="kode" inputMode="numeric" maxLength={6} autoComplete="one-time-code" autoFocus required />
          <div>
            <Tombol name="aksi" value="cek" disabled={pending}>
              {pending ? "Memeriksa…" : "Verifikasi"}
            </Tombol>
          </div>
        </>
      )}
      <Pesan error={state.error} />
    </form>
  );
}
