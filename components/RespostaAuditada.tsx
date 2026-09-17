'use client'

import { Loader2, CircleCheck } from 'lucide-react'
import type { FraseAuditada } from '@/lib/types'

/** Estilo por nível de apoio da frase no material. */
const NIVEIS: Record<
  FraseAuditada['nivel'],
  { borda: string; fundo: string; texto: string; titulo: string }
> = {
  apoiada: { borda: '', fundo: '', texto: '', titulo: 'Frase apoiada no material' },
  parcial: {
    borda: 'border-amber-300/30 bg-amber-300/[0.06]',
    fundo: 'bg-amber-300/[0.06]',
    texto: 'text-amber-100',
    titulo: 'Apoio parcial — confira na apostila',
  },
  nao_apoiada: {
    borda: 'border-rose-400/30',
    fundo: 'bg-rose-400/[0.07]',
    texto: 'text-rose-100',
    titulo: 'Não encontrada na apostila — a IA pode ter inventado',
  },
}

/**
 * Renderiza a resposta da IA com a auditoria de fidelidade aplicada: as frases
 * sem apoio no material ficam destacadas em âmbar/vermelho, com tooltip
 * explicando o nível e a fonte mais próxima encontrada.
 */
export default function RespostaAuditada({
  auditadas,
  auditando,
}: {
  texto: string
  auditadas: FraseAuditada[] | null
  auditando: boolean
}) {
  if (!auditadas || auditadas.length === 0) {
    // Sem auditoria (não pedida, ainda carregando ou resposta sem frases).
    if (auditando) {
      return (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-dashed border-white/10 p-4 text-[0.8rem] text-muted">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
          Verificando cada frase contra o material…
        </div>
      )
    }
    return null
  }

  // A auditoria veio: remonta a resposta pintando as frases não apoiadas.
  // (Texto e frases vêm do mesmo place; apenas os trechos não apoiados viram blocos.)
  const naoApoiadas = auditadas.filter((a) => a.nivel !== 'apoiada')
  if (naoApoiadas.length === 0) {
    return (
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3.5 py-2.5 text-[0.8rem] text-emerald-300">
        <CircleCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
        Todas as frases desta resposta têm apoio no material.
      </div>
    )
  }

  // Mostra a resposta com destaque nos trechos problemáticos. Simples e direto:
  // um card por frase não apoiada (mais legível do que tentar re-pintar o
  // markdown original no meio do texto renderizado).
  return (
    <div className="mb-4 flex flex-col gap-1.5">
      <div className="font-mono text-[0.68rem] uppercase tracking-wider text-muted">
        Auditoria de fidelidade
      </div>
      <div className="mb-1 text-[0.78rem] text-muted">
        <span className="text-emerald-300">verde</span> = na apostila ·{' '}
        <span className="text-amber-300">âmbar</span> = apoio parcial ·{' '}
        <span className="text-rose-300">vermelho</span> = provável invenção
      </div>
      {naoApoiadas.map((a, i) => (
        <div key={i} className={`rounded-lg border ${NIVEIS[a.nivel].borda} ${NIVEIS[a.nivel].fundo} p-3`}>
          <div className={`mb-1 font-mono text-[0.66rem] uppercase tracking-wider ${NIVEIS[a.nivel].texto}`}>
            {NIVEIS[a.nivel].titulo}
            <span className="ml-2 opacity-70">({Math.round(a.similaridade * 100)}%)</span>
          </div>
          <div className="text-[0.85rem] leading-relaxed text-text">{a.frase}</div>
          {a.fonte && (
            <div className="mt-1.5 font-mono text-[0.68rem] text-muted">
              mais próximo: {a.fonte}
              {a.pagina ? ` · pág. ${a.pagina}` : ''}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
