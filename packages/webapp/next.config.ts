import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // 在生产构建时忽略 ESLint 错误
    ignoreDuringBuilds: true,
  },
  typescript: {
    // 在生产构建时忽略 TypeScript 类型错误
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
    // 开发环境启用 cross-origin isolation（SharedArrayBuffer 需要）
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
