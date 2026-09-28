'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { Command, MessageCircle, Target } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { TabDef } from '@/components/TabNav'
import { filtrar } from '@/lib/paleta'
import { prefersReducedMotion } from '@/lib/reducedMotion'

interface Acao {
  id: string
  titulo: string
  extra?: string
  dica: string
  icon: LucideIcon
  executar: () => void
}

/**
 * Ctrl+K (ou "/" fora de campos de texto) abre uma busca por todas as abas.
 * O texto digitado também vira ação: perguntar à apostila ou pedir um teste
 * sobre o tema, sem precisar trocar de aba antes.
 */
export default function PaletaComandos({
  tabs,
  onIr,
  onPerguntar,
  onTestar,
}: {
  tabs: TabDef[]
  onIr: (id: string) => void
  onPerguntar: (texto: string) => void
  onTestar: (tema: string) => void
}) {
  const [aberta, setAberta] = useState(false)
  const [consulta, setConsulta] = useState('')
  const [indice, setIndice] = useState(0)
  const caixaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const focoAnterior = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement
      const digitando = alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)
      if ((e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !digitando)) {
        e.preventDefault()
        setAberta((a) => !a)
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])

  useEffect(() => {
    if (!aberta) return
    focoAnterior.current = document.activeElement as HTMLElement | null
    setConsulta('')
    setIndice(0)
    inputRef.current?.focus()
    if (!prefersReducedMotion() && caixaRef.current) {
      gsap.fromTo(caixaRef.current, { autoAlpha: 0, y: -12, scale: 0.98 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.22, ease: 'power2.out' })
    }
    return () => focoAnterior.current?.focus()
  }, [aberta])

  const texto = consulta.trim()
  const acoes = useMemo<Acao[]>(() => {
    const abas: Acao[] = filtrar(
      consulta,
      tabs.map((t) => ({ ...t, titulo: t.label, extra: `${t.grupo} ${t.labelShort}` }))
    ).map((t) => ({
      id: t.id,
      titulo: t.label,
      dica: t.grupo,
      icon: t.icon,
      executar: () => onIr(t.id),
    }))
    if (texto.length < 3) return abas
    // Texto livre: as ações com o tema vêm depois das abas que casaram.
    return [
      ...abas,
      { id: 'perguntar-livre', titulo: `Perguntar à apostila: “${texto}”`, dica: 'Conversa', icon: MessageCircle, executar: () => onPerguntar(texto) },
      { id: 'testar-livre', titulo: `Me testar sobre “${texto}”`, dica: 'Praticar', icon: Target, executar: () => onTestar(texto) },
    ]
  }, [consulta, texto, tabs, onIr, onPerguntar, onTestar])

  const atual = Math.min(indice, Math.max(0, acoes.length - 1))

  function executar(acao: Acao | undefined) {
    if (!acao) return
    setAberta(false)
    acao.executar()
  }

  function aoTeclarNaBusca(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!acoes.length) return
      const passo = e.key === 'ArrowDown' ? 1 : -1
      setIndice((atual + passo + acoes.length) % acoes.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      executar(acoes[atual])
    } else if (e.key === 'Escape') {
      setAberta(false)
    }
  }

  useEffect(() => {
    document.getElementById(`paleta-op-${atual}`)?.scrollIntoView({ block: 'nearest' })
  }, [atual])

  return (
    <>
      <button
        onClick={() => setAberta(true)}
        aria-label="Abrir paleta de comandos (Ctrl+K)"
        title="Ir para qualquer ferramenta (Ctrl+K)"
        className="fixed bottom-4 right-4 z-40 flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-bg/90 px-4 font-mono text-[0.75rem] text-muted shadow-xl backdrop-blur-xl transition-colors hover:text-lime focus-visible:text-lime"
      >
        <Command className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Ctrl K</span>
      </button>

      {aberta && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && setAberta(false)}
        >
          <div
            ref={caixaRef}
            role="dialog"
            aria-modal="true"
            aria-label="Paleta de comandos"
            className="w-full max-w-lg overflow-hidden rounded-xl border border-white/10 bg-bg shadow-2xl"
          >
            <input
              ref={inputRef}
              value={consulta}
              onChange={(e) => {
                setConsulta(e.target.value)
                setIndice(0)
              }}
              onKeyDown={aoTeclarNaBusca}
              placeholder="Ir para… ou digite um tema para perguntar/testar"
              role="combobox"
              aria-expanded="true"
              aria-controls="paleta-lista"
              aria-activedescendant={acoes.length ? `paleta-op-${atual}` : undefined}
              aria-autocomplete="list"
              className="w-full border-b border-white/10 bg-transparent px-4 py-3.5 text-base text-text outline-none placeholder:text-muted"
            />
            <ul id="paleta-lista" role="listbox" aria-label="Resultados" className="max-h-[50vh] overflow-y-auto p-1">
              {acoes.map((a, i) => {
                const Icon = a.icon
                return (
                  <li
                    key={a.id}
                    id={`paleta-op-${i}`}
                    role="option"
                    aria-selected={i === atual}
                    onMouseMove={() => i !== atual && setIndice(i)}
                    onClick={() => executar(a)}
                    className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[0.9375rem] ${
                      i === atual ? 'bg-white/[0.07] text-white' : 'text-muted'
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${i === atual ? 'text-lime' : ''}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{a.titulo}</span>
                    <span className="font-mono text-[0.7rem] uppercase tracking-wider text-muted">{a.dica}</span>
                  </li>
                )
              })}
              {!acoes.length && <li className="px-3 py-4 text-sm text-muted">Nada encontrado. Digite 3+ letras para perguntar.</li>}
            </ul>
            <p className="border-t border-white/10 px-4 py-2 font-mono text-[0.7rem] text-muted">↑↓ navegar · Enter abrir · Esc fechar</p>
          </div>
        </div>
      )}
    </>
  )
}
