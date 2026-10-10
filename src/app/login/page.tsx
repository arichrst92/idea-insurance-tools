import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sesiSekarang } from "@/lib/auth/session";
import { otpDibypass } from "@/lib/auth/bypass";
import { FormLogin } from "./form-login";

export const metadata: Metadata = { title: "Masuk" };

export default async function HalamanLogin() {
  if (await sesiSekarang()) redirect("/");
  return (
    <main className="relative min-h-dvh flex flex-col items-center px-4 pt-10 pb-12">
      <div aria-hidden className="bg-dots pointer-events-none absolute inset-x-0 top-0 h-72" />
      <div className="relative w-full max-w-sm flex flex-col gap-8">
        <div className="inline-flex items-center gap-2.5 self-start rounded-full border border-line bg-white py-1 pl-1 pr-3.5">
          <span className="flex size-8 items-center justify-center rounded-full bg-ink text-[11px] font-extrabold text-white">
            RA
          </span>
          <span className="text-sm font-bold">Rekap Asuransi</span>
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-[32px] font-extrabold leading-[1.08] tracking-tight">
            Masuk dengan <span className="text-brand">WhatsApp</span>
          </h1>
          <p className="text-[15px] text-ink-2">Tanpa password. Kode login dikirim ke nomor WhatsApp yang terdaftar.</p>
        </div>
        {otpDibypass() && (
          <p className="rounded-xl bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
            <b>Mode development:</b> OTP dilewati (OTP_BYPASS=1). Cukup masukkan nomor yang terdaftar.
          </p>
        )}
        <FormLogin bypass={otpDibypass()} />
      </div>
    </main>
  );
}
