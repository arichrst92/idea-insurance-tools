import { Kartu, KepalaHalaman } from "@/components/ui";
import { wajibLogin } from "@/lib/auth/session";
import { formatNoWa } from "@/lib/wa";
import { FormVerifikasi } from "./form-verifikasi";

export const metadata = { title: "Verifikasi ulang" };

export default async function Verifikasi({ searchParams }: { searchParams: Promise<{ lanjut?: string }> }) {
  const { user } = await wajibLogin();
  const { lanjut = "/" } = await searchParams;
  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Verifikasi ulang" }]}
        judul="Verifikasi"
        sorot="ulang"
        sub="Tindakan ini menyangkut uang atau data rekening, jadi kami minta kode OTP sekali lagi."
      />
      <Kartu className="max-w-md">
        <FormVerifikasi lanjut={lanjut} noWa={formatNoWa(user.noWa)} />
      </Kartu>
    </>
  );
}
