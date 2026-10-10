import { redirect } from "next/navigation";

// Paket coverage kini dikelola per asuransi di halaman detail asuransi.
export default function Paket() {
  redirect("/master/asuransi");
}
