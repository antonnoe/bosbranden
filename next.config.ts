import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // De tool wordt via een iframe ge-embed op NING en Infofrankrijk.
  // Geen X-Frame-Options zetten; framing expliciet toestaan via CSP.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
};

export default nextConfig;
