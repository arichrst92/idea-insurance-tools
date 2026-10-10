import { notFound } from "next/navigation";
import { Kartu, KepalaHalaman } from "@/components/ui";

// Halaman sementara untuk menu dock yang dibangun di sprint berikutnya.
const SEGERA: Record<string, { judul: string; sprint: number }> = {
  panduan: { judul: "Panduan", sprint: 7 },
  otomasi: { judul: "Otomasi", sprint: 6 },
  whatsapp: { judul: "WhatsApp", sprint: 6 },
};

export default async function SegeraHadir({ params }: { params: Promise<{ menu: string }> }) {
  const { menu } = await params;
  const h = SEGERA[menu];
  if (!h) notFound();
  return (
    <>
      <KepalaHalaman jejak={[{ label: h.judul }]} judul={h.judul} sorot="segera hadir" />
      <Kartu>
        <p className="text-sm text-ink-2">Halaman ini dibangun di Sprint {h.sprint}.</p>
      </Kartu>
    </>
  );
}
