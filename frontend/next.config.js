/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Permite build mesmo com erros de tipo (páginas com deps opcionais)
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Expõe URL do GA Engine para o browser (pode ser sobrescrita por NEXT_PUBLIC_GA_URL no Vercel)
  env: {
    NEXT_PUBLIC_GA_URL: process.env.NEXT_PUBLIC_GA_URL || 'https://delightful-communication-production-d389.up.railway.app',
  },
}

module.exports = nextConfig
