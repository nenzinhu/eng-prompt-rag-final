'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, BookOpen, ClipboardCheck, Layers, Lightbulb, NotebookPen, Search, Sparkles } from 'lucide-react'
import { lerCaderno } from '@/lib/caderno'
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
  onTestar,
  onIr,
}: {
  /** Relê o progresso sempre que a tela volta a ficar visível. */
  ativo: boolean
  onPerguntar: (texto: string) => void
  /** Abre o Me testa já com este assunto. */
  onTestar: (tema: string) => void
  onIr: (aba: string) => void
}) {
  const [progresso, setProgresso] = useState<Progresso>(PROGRESSO_VAZIO)
  const [pergunta, setPergunta] = useState('')
  const [erros, setErros] = useState(0)

  useEffect(() => {
    if (!ativo) return
    setProgresso(lerProgresso())
    setErros(lerCaderno().length)
  }, [ativo])

  const ultimo = progresso.estudos[0]
  const apostilas = resumoPorApostila(progresso).slice(0, 5)
  const totalPaginas = Object.values(progresso.paginas).reduce((total, paginas) => total + paginas.length, 0)
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (pergunta.trim()) onPerguntar(pergunta.trim())
  }

  const cartao = 'glass rounded-2xl p-6 sm:p-7'
  const atalho =
    'action-card group flex min-h-[100px] items-center gap-4 rounded-2xl px-5 py-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime'

  return (
    <div className="flex flex-col gap-7 sm:gap-9">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.75rem] capitalize tracking-wide text-muted">{hoje}</p>
        <span className="flex items-center gap-1.5 text-[0.72rem] text-cyan"><BookOpen className="h-3.5 w-3.5" aria-hidden="true" /> Um passo de cada vez.</span>
      </div>

      <section className="study-hero rounded-[24px] p-6 sm:p-10" aria-labelledby="hoje-titulo">
        <div className="relative z-10 max-w-[720px]">
          <p className="mb-4 flex items-center gap-2 text-[0.7rem] font-medium uppercase tracking-[0.18em] text-lime"><Sparkles className="h-4 w-4" aria-hidden="true" /> Apostilas. IA. Seu próximo passo.</p>
          <h1 id="hoje-titulo" className="font-display text-[2.4rem] font-medium leading-[1.12] tracking-tight text-text sm:text-[3.5rem]">
            Menos dúvidas.<br /><span className="text-lime">Mais entendimento.</span>
          </h1>
          <p className="mt-5 max-w-[510px] text-[0.95rem] leading-relaxed text-[#bdceca]">Converse com o material, teste o que aprendeu e volte aos pontos que precisam de atenção.</p>
          <form onSubmit={enviar} className="mt-7 flex items-center gap-2 rounded-2xl border border-white/15 bg-bg/65 p-2 pl-4 shadow-lg focus-within:border-cyan/50">
            <Search className="hidden h-5 w-5 shrink-0 text-cyan sm:block" aria-hidden="true" />
            <label htmlFor="hoje-pergunta" className="sr-only">Pergunte sobre o material</label>
            <input id="hoje-pergunta" value={pergunta} onChange={(e) => setPergunta(e.target.value)} placeholder="O que você quer entender hoje?" className="min-h-11 min-w-0 flex-1 bg-transparent text-[0.95rem] text-text outline-none placeholder:text-muted" />
            <button type="submit" aria-label="Perguntar" disabled={!pergunta.trim()} className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-lime px-3 font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-40 sm:px-4">
              <span className="hidden text-sm sm:inline">Perguntar</span><ArrowRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </form>
          <p className="mt-3 text-[0.72rem] text-[#a5bbb4]">As fontes citadas ajudam você a conferir a resposta na apostila.</p>
        </div>
      </section>

      <div className="grid grid-cols-3 gap-3 sm:gap-4" aria-label="Seu progresso neste navegador">
        {[{ numero: Object.keys(progresso.paginas).length, label: 'apostilas estudadas', icon: BookOpen }, { numero: totalPaginas, label: 'páginas citadas', icon: Layers }, { numero: erros, label: 'pontos para revisar', icon: NotebookPen }].map(({ numero, label, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-white/[0.07] bg-surface/60 px-3 py-4 sm:px-5">
            <Icon className="mb-3 h-4 w-4 text-cyan" aria-hidden="true" />
            <div className="text-[1.6rem] font-semibold tracking-tight text-text sm:text-[1.9rem]">{numero.toLocaleString('pt-BR')}</div>
            <p className="mt-1 text-[0.7rem] leading-snug text-muted sm:text-[0.78rem]">{label}</p>
          </div>
        ))}
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
              onClick={() => onTestar(ultimo.pergunta)}
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

      {erros > 0 && (
        <button type="button" onClick={() => onIr('erros')} className={`${atalho} min-h-[72px]`}>
          <NotebookPen className="h-5 w-5 shrink-0 text-violet" aria-hidden="true" />
          <span className="flex flex-col">
            <span className="text-[0.95rem] font-semibold text-text">
              Revisar {erros === 1 ? '1 ponto que você errou' : `${erros} pontos que você errou`}
            </span>
            <span className="text-[0.8rem] text-muted">caderno de erros</span>
          </span>
        </button>
      )}

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
          Escolha seu próximo passo
        </h2>
        <p className="mb-4 text-[0.8rem] text-muted">Entenda, pratique e revise do jeito que funciona para você.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => onIr('flashcards')} className={atalho}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan/10 text-cyan"><Layers className="h-5 w-5" aria-hidden="true" /></span>
            <span className="flex-1"><span className="block text-[0.95rem] font-medium text-text">Fixar os conceitos</span><span className="mt-1 block text-[0.78rem] text-muted">Revise com flashcards do glossário</span></span><ArrowRight className="h-4 w-4 text-muted group-hover:text-cyan" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => onIr('resolver')} className={atalho}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lime/10 text-lime"><ClipboardCheck className="h-5 w-5" aria-hidden="true" /></span>
            <span className="flex-1"><span className="block text-[0.95rem] font-medium text-text">Conferir minha resposta</span><span className="mt-1 block text-[0.78rem] text-muted">Analise uma questão com apostila + IA</span></span><ArrowRight className="h-4 w-4 text-muted group-hover:text-cyan" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => onIr('feynman')} className={atalho}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet/10 text-violet"><Lightbulb className="h-5 w-5" aria-hidden="true" /></span>
            <span className="flex-1"><span className="block text-[0.95rem] font-medium text-text">Testar meu entendimento</span><span className="mt-1 block text-[0.78rem] text-muted">Explique com suas palavras no Feynman</span></span><ArrowRight className="h-4 w-4 text-muted group-hover:text-cyan" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => onIr('buscar')} className={atalho}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan/10 text-cyan"><Search className="h-5 w-5" aria-hidden="true" /></span>
            <span className="flex-1"><span className="block text-[0.95rem] font-medium text-text">Explorar as apostilas</span><span className="mt-1 block text-[0.78rem] text-muted">Encontre os trechos sobre um assunto</span></span><ArrowRight className="h-4 w-4 text-muted group-hover:text-cyan" aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  )
}
