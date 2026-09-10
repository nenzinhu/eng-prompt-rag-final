/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (process.env.NODE_ENV !== 'development') return []
    // Em desenvolvimento, encaminha /api para o backend escolhido.
    // Padrão: backend local (uvicorn). Para usar o de produção, defina
    // BACKEND_URL=https://eng-prompt-rag-final-nenzinhus-projects.vercel.app
    const backend =
      process.env.BACKEND_URL || 'http://127.0.0.1:8000'
    return [
      {
        source: '/api/:path*',
        destination: `${backend}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
