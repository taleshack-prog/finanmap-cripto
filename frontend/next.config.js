/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // necessário para deploy em containers/Vercel
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3020',
    NEXT_PUBLIC_GA_URL:  process.env.NEXT_PUBLIC_GA_URL  || 'http://localhost:8110',
  },
  async rewrites() {
    return [
      // Proxy /api/* → backend em produção (evita CORS no browser)
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL}/api/:path*`,
      },
    ]
  },
  // Permite WebSocket em produção
  webpack(config) {
    config.externals.push({ bufferutil: 'bufferutil', 'utf-8-validate': 'utf-8-validate' })
    return config
  },
}

module.exports = nextConfig
