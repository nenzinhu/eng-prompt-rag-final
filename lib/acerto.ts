import type { CompararResp } from './types'

/** Estimativa de acerto a partir da concordância entre modelos. */
export interface Acerto {
  /** 0–100. É uma estimativa, não uma garantia. */
  percentual: number
  faixa: 'alta' | 'media' | 'baixa'
  motivo: string
  /** Alternativa escolhida por cada modelo (questão de múltipla escolha), se detectada. */
  alternativas: (string | null)[]
}

// "Letra B", "alternativa (c)", "opção D" ou uma conclusão que começa com "B)", "C." ou "D -".
const ALTERNATIVA = /(?:\b(?:letra|alternativa|op[çc][ãa]o)\s*\(?([a-e])\)?(?![a-z])|^\s*\(?([a-e])\s*[).:-](?:\s|$))/i

export function extrairAlternativa(texto: string): string | null {
  const m = ALTERNATIVA.exec(texto)
  const letra = m?.[1] ?? m?.[2]
  return letra ? letra.toUpperCase() : null
}

const PESO_NIVEL = { alta: 0.85, media: 0.6, baixa: 0.3, indefinida: 0.4 } as const

/**
 * Duas IAs independentes chegando à mesma resposta, com o mesmo trecho da apostila,
 * é o melhor sinal que temos de acerto; divergência é sinal de que vale conferir.
 * Devolve null quando menos de dois modelos responderam.
 */
export function estimarAcerto(r: CompararResp): Acerto | null {
  const ok = r.respostas.filter((x) => !x.erro)
  if (ok.length < 2) return null

  const alternativas = r.respostas.map((x) => (x.erro ? null : extrairAlternativa(x.resposta_direta || '')))
  const letras = alternativas.filter((l): l is string => !!l)
  let concordancia: number
  let motivo: string

  if (letras.length >= 2 && letras.length === ok.length) {
    const iguais = letras.every((l) => l === letras[0])
    concordancia = iguais ? 1 : 0
    motivo = iguais
      ? `As duas IAs marcaram a alternativa ${letras[0]}.`
      : `As IAs marcaram alternativas diferentes (${letras.join(' × ')}).`
  } else if (r.divergencia_numerica) {
    concordancia = 0.15
    motivo = 'As IAs citam números diferentes para a mesma pergunta.'
  } else {
    concordancia = (PESO_NIVEL[r.nivel_concordancia] + r.similaridade_conclusoes) / 2
    motivo =
      concordancia >= 0.7
        ? 'As conclusões das IAs são parecidas.'
        : concordancia >= 0.45
          ? 'As conclusões concordam só em parte.'
          : 'As conclusões das IAs divergem.'
  }

  // Concordância pesa mais; o embasamento no material ajusta o resultado.
  const bruto = 0.2 + 0.6 * concordancia + 0.2 * Math.max(0, Math.min(1, r.confianca_media))
  const percentual = Math.round(Math.max(0.05, Math.min(0.95, bruto)) * 100)
  const faixa = percentual >= 75 ? 'alta' : percentual >= 50 ? 'media' : 'baixa'
  return { percentual, faixa, motivo, alternativas }
}
