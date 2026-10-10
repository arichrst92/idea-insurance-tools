import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dimuat apa adanya dari node_modules (worker PDF & antrian), tidak dibundel.
  serverExternalPackages: ["playwright-core", "bullmq", "ioredis", "echarts"],
  // Image Docker kecil: hanya server mandiri + file yang dipakai.
  output: "standalone",
  poweredByHeader: false,
  // Upload KTP/STNK/foto/PDF lewat server action: maks 10 MB per file, beberapa file
  // sekaligus. Foto dikecilkan di browser dulu (lib/kompres-gambar.ts), jadi batas ini
  // hanya jaring pengaman. Middleware ikut membaca body, jadi batasnya disamakan.
  experimental: {
    serverActions: { bodySizeLimit: "50mb" },
    middlewareClientMaxBodySize: "50mb",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
