import type { Metadata, Viewport } from 'next'
import { Barlow } from 'next/font/google'
import './globals.css'

const barlow = Barlow({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-barlow',
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Engenharia de Prompt — Ensino Virtual',
  description: 'RAG cloud para o curso de Engenharia de Prompt',
  applicationName: 'Eng. Prompt',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180' },
  },
  // Nome e barra de status quando aberto pela tela de início do iPhone.
  appleWebApp: { capable: true, title: 'Eng. Prompt', statusBarStyle: 'black' },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={barlow.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
