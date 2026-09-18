import type { MetadataRoute } from 'next'

// Torna o site instalável: atalho na tela de início do celular e app no computador.
// Os ícones saem de scripts/gerar-icones.mjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Engenharia de Prompt — Ensino Virtual',
    short_name: 'Eng. Prompt',
    description: 'Estude o material do curso conversando com uma IA que cita fonte e página.',
    lang: 'pt-BR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#08070c',
    theme_color: '#08070c',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
