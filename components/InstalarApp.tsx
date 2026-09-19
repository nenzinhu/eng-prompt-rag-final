'use client'

import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'

/** Evento do Chrome/Edge que permite abrir a instalação quando o usuário pedir. */
interface EventoInstalacao extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function jaInstalado(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** iPhone/iPad — o iPad com iPadOS se apresenta como Mac, mas tem toque. */
function ehIos(): boolean {
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/**
 * Botão "Instalar app" do cabeçalho.
 *
 * - Chrome/Edge (Android e computador): aparece só quando o navegador oferece a
 *   instalação e abre a janela dele.
 * - iPhone/iPad: o Safari não deixa o site abrir a instalação, então o botão
 *   mostra o caminho Compartilhar → Adicionar à Tela de Início.
 * - Já instalado, ou navegador sem suporte (Firefox no computador): não aparece.
 */
export default function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalacao | null>(null)
  const [ios, setIos] = useState(false)
  const [ajudaIos, setAjudaIos] = useState(false)

  useEffect(() => {
    if (jaInstalado()) return
    setIos(ehIos())

    const aoOferecer = (e: Event) => {
      e.preventDefault() // guarda para abrir no clique, em vez do aviso do navegador
      setEvento(e as EventoInstalacao)
    }
    const aoInstalar = () => setEvento(null)
    window.addEventListener('beforeinstallprompt', aoOferecer)
    window.addEventListener('appinstalled', aoInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', aoOferecer)
      window.removeEventListener('appinstalled', aoInstalar)
    }
  }, [])

  async function instalar() {
    if (!evento) return
    await evento.prompt()
    await evento.userChoice
    setEvento(null) // o evento só vale uma vez
  }

  if (!evento && !ios) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (evento ? instalar() : setAjudaIos((v) => !v))}
        className="flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[0.68rem] font-medium text-texto transition-colors hover:border-borda-forte hover:text-texto"
        aria-expanded={ios ? ajudaIos : undefined}
        title="Instalar o app neste aparelho"
      >
        <Download className="h-3 w-3" aria-hidden="true" />
        <span className="hidden sm:inline">Instalar app</span>
        <span className="sm:hidden">Instalar</span>
      </button>

      {ios && ajudaIos && (
        <div
          role="dialog"
          aria-label="Como instalar no iPhone"
          className="cartao absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border p-3 text-[0.8rem] text-texto shadow-xl"
        >
          <button
            type="button"
            onClick={() => setAjudaIos(false)}
            className="absolute right-2 top-2 text-texto-suave hover:text-texto"
            aria-label="Fechar"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <p className="mb-2 font-medium">Instalar no iPhone ou iPad</p>
          <ol className="list-decimal space-y-1 pl-4 text-texto-suave">
            <li>
              Abra este site no <strong className="text-texto">Safari</strong>.
            </li>
            <li>
              Toque em <Share className="inline h-3.5 w-3.5 align-[-2px] text-texto" aria-label="Compartilhar" />{' '}
              <strong className="text-texto">Compartilhar</strong>.
            </li>
            <li>
              Escolha <strong className="text-texto">Adicionar à Tela de Início</strong>.
            </li>
          </ol>
        </div>
      )}
    </div>
  )
}
