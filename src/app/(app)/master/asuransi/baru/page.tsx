import { TabMaster } from "@/app/(app)/master/tab-master";
import { Kartu, KepalaHalaman } from "@/components/ui";
import { FormAsuransi } from "../form-asuransi";

export const metadata = { title: "Tambah asuransi" };

export default function AsuransiBaru() {
  return (
    <>
      <KepalaHalaman
        jejak={[{ label: "Master data", href: "/master" }, { label: "Asuransi", href: "/master/asuransi" }, { label: "Baru" }]}
        judul="Tambah"
        sorot="asuransi"
        sub="Setelah disimpan, tambahkan kontak PIC (email underwriting & WhatsApp)."
      />
      <TabMaster />
      <Kartu className="max-w-2xl">
        <FormAsuransi />
      </Kartu>
    </>
  );
}
