import { Kartu, KepalaHalaman } from "@/components/ui";
import { wajibLogin } from "@/lib/auth/session";
import { adalahOwner } from "@/lib/peran";
import { FormSales } from "../form-sales";
import { FORM_KOSONG } from "../data-form";
import { simpanSales } from "../actions";

export const metadata = { title: "Tambah pengguna" };

export default async function SalesBaru() {
  const { user } = await wajibLogin("admin");
  const owner = adalahOwner(user);
  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Tim", href: "/sales" }, { label: "Baru" }]}
        judul="Tambah"
        sorot={owner ? "pengguna" : "sales"}
        sub={owner ? "Sales, admin, atau owner. Bagi hasil kantor dan batas cashback berlaku untuk semua polis penjual ini." : "Bagi hasil kantor, batas cashback, target & gaji diatur owner setelah sales disimpan."}
      />
      <Kartu className="max-w-4xl">
        <FormSales aksi={simpanSales.bind(null, null)} awal={owner ? FORM_KOSONG : { ...FORM_KOSONG, tipeSales: "freelance" }} tombol="Simpan sales" editorOwner={owner} />
      </Kartu>
    </>
  );
}
