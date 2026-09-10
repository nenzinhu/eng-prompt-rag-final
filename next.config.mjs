/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (process.env.NODE_ENV !== 'development') return []
    return [
      {
        source: '/api/:path*',
        destination: 'https://eng-prompt-rag-final-nenzinhus-projects.vercel.app/api/:path*',
      },
    ]
  },
}

export default nextConfig
