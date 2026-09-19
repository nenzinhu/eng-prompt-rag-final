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
    borda: 'aviso-atencao text-texto',
    fundo: 'bg-atencao/[0.06]',
    texto: 'text-texto',
    titulo: 'Apoio parcial — confira na apostila',
  },
  nao_apoiada: {
    borda: 'border-erro/30',
    fundo: 'bg-erro/[0.07]',
    texto: 'text-texto',
    titulo: 'Não encontrada no material — pode ser conhecimento geral ou invenção',
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
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-dashed border-white/10 p-4 text-[0.8rem] text-texto-suave">
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
      <div className="aviso-ok text-texto mb-3 flex items-center gap-2 px-3.5 py-2.5 text-[0.8rem]">
        <CircleCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Todas as frases desta resposta usam o vocabulário do material.{' '}
          <span className="text-ok/70">
            A auditoria confere palavras, não sentido: uma frase que diz o contrário da apostila passa.
          </span>
        </span>
      </div>
    )
  }

  // Mostra a resposta com destaque nos trechos problemáticos. Simples e direto:
  // um card por frase não apoiada (mais legível do que tentar re-pintar o
  // markdown original no meio do texto renderizado).
  return (
    <div className="mb-4 flex flex-col gap-1.5">
      <div className="rotulo">
        Auditoria de fidelidade
      </div>
      <div className="mb-1 text-[0.78rem] text-texto-suave">
        <span className="text-ok">verde</span> = na apostila ·{' '}
        <span className="text-atencao">âmbar</span> = apoio parcial ·{' '}
        <span className="text-erro">vermelho</span> = não encontrada no material. A auditoria confere
        palavras, não sentido: uma frase que diz o contrário da apostila pode aparecer como apoiada.
      </div>
      {naoApoiadas.map((a, i) => (
        <div key={i} className={`rounded-lg border ${NIVEIS[a.nivel].borda} ${NIVEIS[a.nivel].fundo} p-3`}>
          <div className={`rotulo mb-1 ${NIVEIS[a.nivel].texto}`}>
            {NIVEIS[a.nivel].titulo}
            <span className="ml-2 opacity-70">({Math.round(a.similaridade * 100)}%)</span>
          </div>
          <div className="text-[0.85rem] leading-relaxed text-texto">{a.frase}</div>
          {a.fonte && (
            <div className="mt-1.5 text-[0.68rem] text-texto-suave">
              mais próximo: {a.fonte}
              {a.pagina ? ` · pág. ${a.pagina}` : ''}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
