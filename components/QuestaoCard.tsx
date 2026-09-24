'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import type { Questao } from '@/lib/types'
import { nomeDaApostila } from '@/lib/progresso'
import TrechoNoContexto from './TrechoNoContexto'

const LETRAS = 'ABCDE'

/**
 * Uma questão de múltipla escolha. Depois da resposta, mostra a certa, a
 * marcada e a explicação com a página da apostila. Usada no "Me testa" e na
 * revisão do caderno de erros.
 */
export default function QuestaoCard({
  questao,
  onResponder,
  children,
}: {
  questao: Questao
  /** Chamado uma vez, com o índice da alternativa marcada. */
  onResponder: (marcada: number) => void
  /** Ações depois da resposta (ex.: "Próxima"). */
  children?: React.ReactNode
}) {
  const [marcada, setMarcada] = useState<number | null>(null)
  const respondeu = marcada !== null
  const acertou = marcada === questao.correta

  function escolher(i: number) {
    if (respondeu) return
    setMarcada(i)
    onResponder(i)
  }

  return (
    <div className="glass flex flex-col gap-4 rounded-2xl p-5">
      <p className="text-[1rem] font-semibold leading-snug text-text">{questao.pergunta}</p>
      <div role="group" aria-label="Alternativas" className="flex flex-col gap-2">
        {questao.alternativas.map((alt, i) => {
          const certa = respondeu && i === questao.correta
          const errada = respondeu && i === marcada && !acertou
          return (
            <button
              key={i}
              type="button"
              onClick={() => escolher(i)}
              disabled={respondeu}
              aria-pressed={marcada === i}
              className={`flex min-h-11 items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-[0.9rem] leading-snug transition-colors disabled:cursor-default ${
                certa
                  ? 'border-2 border-cyan bg-cyan/10 text-text'
                  : errada
                    ? 'border-2 border-dashed border-rose-300 bg-rose-300/10 text-text'
                    : respondeu
                      ? 'border-white/10 text-muted'
                      : 'border-white/15 text-text hover:bg-white/[0.05]'
              }`}
            >
              <span className={`font-semibold ${certa ? 'text-cyan' : errada ? 'text-rose-300' : 'text-muted'}`}>
                {LETRAS[i]}
              </span>
              <span className="flex-1">{alt}</span>
              {certa && <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan" aria-label="alternativa certa" />}
              {errada && <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-label="sua resposta" />}
            </button>
          )
        })}
      </div>

      {respondeu && (
        <div role="status" className="flex flex-col gap-2 border-t border-white/[0.08] pt-4">
          <p className={`text-[0.95rem] font-semibold ${acertou ? 'text-cyan' : 'text-rose-300'}`}>
            {acertou ? 'Certo.' : `Não foi dessa vez — a certa é a ${LETRAS[questao.correta]}.`}
          </p>
          {questao.explicacao && <p className="text-[0.88rem] leading-relaxed text-muted">{questao.explicacao}</p>}
          {questao.fonte && (
            <div className="flex flex-col gap-1">
              <p className="text-[0.8rem] text-muted">
                {nomeDaApostila(questao.fonte)}
                {questao.pagina ? ` · pág. ${questao.pagina}` : ''}
              </p>
              <TrechoNoContexto fonte={questao.fonte} pagina={questao.pagina} />
            </div>
          )}
          {children && <div className="mt-1 flex flex-wrap gap-2">{children}</div>}
        </div>
      )}
    </div>
  )
}
