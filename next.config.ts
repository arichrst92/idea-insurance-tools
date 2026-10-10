import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Image Docker kecil: hanya server mandiri + file yang dipakai.
  output: "standalone",
  poweredByHeader: false,
  // Upload KTP/STNK/foto/PDF lewat server action (maks 10 MB per file).
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
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
