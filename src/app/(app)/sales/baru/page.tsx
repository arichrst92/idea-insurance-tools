import { Kartu, KepalaHalaman } from "@/components/ui";
import { wajibLogin } from "@/lib/auth/session";
import { FORM_KOSONG, FormSales } from "../form-sales";
import { simpanSales } from "../actions";

export const metadata = { title: "Tambah pengguna" };

export default async function SalesBaru() {
  await wajibLogin("admin");
  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Sales", href: "/sales" }, { label: "Baru" }]}
        judul="Tambah"
        sorot="sales"
        sub="Bagi hasil kantor dan batas cashback ke nasabah berlaku untuk semua polis sales ini."
      />
      <Kartu className="max-w-4xl">
        <FormSales aksi={simpanSales.bind(null, null)} awal={FORM_KOSONG} tombol="Simpan sales" />
      </Kartu>
    </>
  );
}
