import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Rekap Asuransi", template: "%s · Rekap Asuransi" },
  description: "Rekap nasabah, polis, dan komisi asuransi mobil",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#F8F9FC", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
