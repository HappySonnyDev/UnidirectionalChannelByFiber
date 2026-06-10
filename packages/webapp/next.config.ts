import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Ignore ESLint errors during production build
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Ignore TypeScript type errors during production build
    ignoreBuildErrors: true,
  },
  transpilePackages: ['@fiber-pay/sdk', '@nervosnetwork/fiber-js'],
  webpack(config) {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    }
    return config
  },
  async headers() {
    // Enable cross-origin isolation in dev (required for SharedArrayBuffer)
    if (process.env.NODE_ENV !== 'development') return []
    return [{
      source: '/:path*',
      headers: [
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
      ],
    }]
  },
};

export default nextConfig;
