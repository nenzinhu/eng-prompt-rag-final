'use client'

import { useEffect, useState } from 'react'
import type { ProvidersResp } from '@/lib/types'
import PerguntarTab from './PerguntarTab'
import AprenderTab from './AprenderTab'

/** Modos principais: um toque troca o jeito de explicar sem perder a conversa. */
const MODOS = [
  { id: 'direto', rotulo: 'Direto', persona: 'padrao', dica: 'Resposta objetiva, com as páginas da apostila' },
  { id: 'simples', rotulo: 'Simples', persona: 'nivel_inicial', dica: 'Do zero, com analogias do dia a dia' },
  { id: 'socratico', rotulo: 'Socrático', persona: 'socratico', dica: 'Perguntas que levam você à resposta' },
  { id: 'feynman', rotulo: 'Feynman', persona: '', dica: 'A IA explica, depois você explica e ela avalia' },
] as const

/** As outras personalidades do antigo "Professor Sabe Tudo" (ver PERSONA_PROMPTS no backend). */
const OUTRAS = [
  { persona: 'professor', rotulo: 'Didático, com analogias' },
  { persona: 'pratico', rotulo: 'Prático: exemplo primeiro' },
  { persona: 'visual', rotulo: 'Visual: diagramas e tabelas' },
  { persona: 'preparatorio', rotulo: 'Preparatório: foco em prova' },
  { persona: 'reforco', rotulo: 'Reforço: devagar, sem pular etapas' },
  { persona: 'desafio', rotulo: 'Desafio: nível alto' },
  { persona: 'nivel_intermediario', rotulo: 'Nível intermediário' },
  { persona: 'nivel_avancado', rotulo: 'Nível avançado' },
  { persona: 'academico', rotulo: 'Acadêmico detalhista' },
  { persona: 'ironista', rotulo: 'Intelectual debochado' },
  { persona: 'showman', rotulo: 'Orador magnético' },
  { persona: 'dogmatico', rotulo: 'Mestre incontestável' },
  { persona: 'enciclopedico', rotulo: 'Enciclopédico generalista' },
]

type Modo = (typeof MODOS)[number]['id'] | 'outro'

export default function EstudarTab({
  providers,
  seed,
  modoSeed,
}: {
  providers: ProvidersResp
  /** Pergunta vinda da tela Hoje: volta para um modo de conversa e envia. */
  seed?: { texto: string; tick: number }
  /** Modo pedido por outra tela (ex.: Hoje abre direto no Feynman). */
  modoSeed?: { modo: Modo; tick: number }
}) {
  const [modo, setModo] = useState<Modo>('direto')
  const [outra, setOutra] = useState(OUTRAS[0].persona)

  useEffect(() => {
    if (seed?.texto.trim()) setModo((m) => (m === 'feynman' ? 'direto' : m))
  }, [seed?.tick, seed?.texto])
  useEffect(() => {
    if (modoSeed?.tick) setModo(modoSeed.modo)
  }, [modoSeed?.tick, modoSeed?.modo])

  const principal = MODOS.find((m) => m.id === modo)
  const persona = modo === 'outro' ? outra : principal?.persona || 'padrao'
  // No modo "outro" o próprio seletor já mostra o nome do jeito escolhido.
  const dica = modo === 'outro' ? 'Mesma conversa, com outro jeito de explicar.' : principal?.dica ?? ''

  const chip = (ativo: boolean) =>
    `min-h-10 rounded-full border px-4 text-[0.85rem] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime ${
      ativo ? 'border-text bg-text font-semibold text-[#08070c]' : 'border-white/15 text-muted hover:text-text'
    }`

  return (
    <div>
      <div role="group" aria-label="Jeito de explicar" className="mb-3 flex flex-wrap items-center gap-2">
        {MODOS.map((m) => (
          <button key={m.id} type="button" aria-pressed={modo === m.id} onClick={() => setModo(m.id)} className={chip(modo === m.id)}>
            {m.rotulo}
          </button>
        ))}
        <label className="sr-only" htmlFor="estudar-outras">
          Mais jeitos de explicar
        </label>
        <select
          id="estudar-outras"
          value={modo === 'outro' ? outra : ''}
          onChange={(e) => {
            if (!e.target.value) return
            setOutra(e.target.value)
            setModo('outro')
          }}
          className={`min-h-10 max-w-full rounded-full border bg-bg px-3 text-[0.85rem] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime ${
            modo === 'outro' ? 'border-lime font-semibold text-lime' : 'border-white/15 text-muted hover:text-text'
          }`}
        >
          <option value="">Mais jeitos…</option>
          {OUTRAS.map((o) => (
            <option key={o.persona} value={o.persona}>
              {o.rotulo}
            </option>
          ))}
        </select>
      </div>
      <p className="mb-5 text-[0.85rem] text-muted">{dica}</p>

      {/* As duas ficam montadas: trocar de modo não apaga a conversa nem a explicação em curso. */}
      <div hidden={modo === 'feynman'}>
        <PerguntarTab
          providers={providers}
          persona={persona}
          seed={seed}
          titulo="Converse com a apostila — as respostas citam a página"
          placeholder="Pergunte, cole um trecho ou anexe um print…"
        />
      </div>
      <div hidden={modo !== 'feynman'}>
        <AprenderTab providers={providers} />
      </div>
    </div>
  )
}
