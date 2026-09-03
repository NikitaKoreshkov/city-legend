import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  async redirects() {
    return [
      { source: '/auctions', destination: '/collection', permanent: true },
      { source: '/auctions/compare', destination: '/collection/compare', permanent: true },
      { source: '/auctions/:id', destination: '/collection/:id', permanent: true },
      { source: '/admin/edit/auctions', destination: '/admin/edit/catalog', permanent: true },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'citylegend.art',
        pathname: '/**',
      },
    ],
    localPatterns: [
      { pathname: '/uploads/**' },
      { pathname: '/**' },
    ],
    // Next.js 16 по умолчанию разрешает только [75]; в компонентах используем 72/82
    qualities: [72, 75, 82],
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
