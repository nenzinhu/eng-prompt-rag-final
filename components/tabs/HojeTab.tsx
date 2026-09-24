'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Lightbulb, Search, Target } from 'lucide-react'
import { lerProgresso, nomeDaApostila, resumoPorApostila, PROGRESSO_VAZIO, type Progresso } from '@/lib/progresso'

const EXEMPLOS = [
  'O que é proposta de valor?',
  'Como funciona few-shot prompting?',
  'Quais são as etapas de um plano de negócios?',
]

/**
 * Primeira tela: responde "o que eu estudo agora?" com o que já foi estudado
 * (lib/progresso.ts). Sem histórico, sugere por onde começar.
 */
export default function HojeTab({
  ativo,
  onPerguntar,
  onIr,
}: {
  /** Relê o progresso sempre que a tela volta a ficar visível. */
  ativo: boolean
  onPerguntar: (texto: string) => void
  onIr: (aba: string) => void
}) {
  const [progresso, setProgresso] = useState<Progresso>(PROGRESSO_VAZIO)
  const [pergunta, setPergunta] = useState('')

  useEffect(() => {
    if (ativo) setProgresso(lerProgresso())
  }, [ativo])

  const ultimo = progresso.estudos[0]
  const apostilas = resumoPorApostila(progresso).slice(0, 5)
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (pergunta.trim()) onPerguntar(pergunta.trim())
  }

  const cartao = 'glass rounded-2xl p-5'
  const atalho =
    'glass flex min-h-[64px] items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:border-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime'

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="font-mono text-[0.7rem] uppercase tracking-wider text-muted">{hoje}</p>
        <h1 className="mt-1 font-display text-[1.9rem] italic leading-tight text-text">O que eu estudo agora?</h1>
      </div>

      {ultimo ? (
        <section className={cartao} aria-labelledby="continuar-titulo">
          <p id="continuar-titulo" className="font-mono text-[0.68rem] font-semibold uppercase tracking-wider text-lime">
            Continuar de onde parou
          </p>
          <p className="mt-2 text-[1.05rem] font-semibold leading-snug text-text">{ultimo.pergunta}</p>
          {ultimo.fonte && (
            <p className="mt-1 text-[0.85rem] text-muted">
              {nomeDaApostila(ultimo.fonte)}
              {ultimo.pagina ? ` · pág. ${ultimo.pagina}` : ''}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onPerguntar(`Continue a explicação, indo um passo além: ${ultimo.pergunta}`)}
              className="flex min-h-11 items-center gap-2 rounded-lg bg-lime px-4 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90"
            >
              Continuar <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() =>
                onPerguntar(
                  `Faça 3 perguntas de múltipla escolha, com gabarito no fim, para eu testar o que aprendi sobre: ${ultimo.pergunta}`,
                )
              }
              className="min-h-11 rounded-lg border border-white/15 px-4 text-sm text-text transition-colors hover:bg-white/[0.05]"
            >
              Me testa
            </button>
          </div>
        </section>
      ) : (
        <section className={cartao} aria-labelledby="comecar-titulo">
          <p id="comecar-titulo" className="font-mono text-[0.68rem] font-semibold uppercase tracking-wider text-lime">
            Por onde começar
          </p>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-muted">
            Faça uma pergunta sobre a apostila. As páginas que a resposta citar entram no seu progresso.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {EXEMPLOS.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => onPerguntar(ex)}
                className="min-h-10 rounded-full border border-white/15 px-3 text-[0.85rem] text-text transition-colors hover:bg-white/[0.05]"
              >
                {ex}
              </button>
            ))}
          </div>
        </section>
      )}

      <form onSubmit={enviar} className="glass flex items-center gap-2 rounded-xl p-1.5 pl-4">
        <label htmlFor="hoje-pergunta" className="sr-only">
          Pergunte sobre o material
        </label>
        <input
          id="hoje-pergunta"
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          placeholder="Pergunte qualquer coisa da apostila…"
          className="min-w-0 flex-1 bg-transparent text-[0.95rem] text-text outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          aria-label="Perguntar"
          disabled={!pergunta.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-lime text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </form>

      {apostilas.length > 0 && (
        <section aria-labelledby="apostilas-titulo">
          <h2 id="apostilas-titulo" className="mb-2 text-[0.95rem] font-semibold text-text">
            Suas apostilas
          </h2>
          <ul className="glass flex flex-col divide-y divide-white/[0.06] rounded-2xl">
            {apostilas.map((a) => (
              <li key={a.fonte} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 truncate text-[0.9rem] text-text">{nomeDaApostila(a.fonte)}</span>
                <span className="shrink-0 text-[0.8rem] text-muted">
                  {a.paginas} {a.paginas === 1 ? 'página estudada' : 'páginas estudadas'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="praticar-titulo">
        <h2 id="praticar-titulo" className="mb-2 text-[0.95rem] font-semibold text-text">
          Outros caminhos
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button type="button" onClick={() => onIr('resolver')} className={atalho}>
            <Target className="h-5 w-5 shrink-0 text-violet" aria-hidden="true" />
            <span className="text-[0.9rem] text-text">Resolver uma questão</span>
          </button>
          <button type="button" onClick={() => onIr('feynman')} className={atalho}>
            <Lightbulb className="h-5 w-5 shrink-0 text-violet" aria-hidden="true" />
            <span className="text-[0.9rem] text-text">Explicar com minhas palavras</span>
          </button>
          <button type="button" onClick={() => onIr('buscar')} className={atalho}>
            <Search className="h-5 w-5 shrink-0 text-violet" aria-hidden="true" />
            <span className="text-[0.9rem] text-text">Buscar no material</span>
          </button>
        </div>
      </section>
    </div>
  )
}
