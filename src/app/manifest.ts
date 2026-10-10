import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rekap Asuransi",
    short_name: "Rekap Asuransi",
    start_url: "/",
    display: "standalone",
    background_color: "#F8F9FC",
    theme_color: "#0B0F1A",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/ikon-512.png", type: "image/png", sizes: "512x512" },
    ],
  };
}
