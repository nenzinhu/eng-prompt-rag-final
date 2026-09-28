/**
 * Agenda de repetição espaçada dos flashcards (1, 3, 7, 14 dias).
 *
 * "Sabia" de primeira empurra o cartão para o próximo intervalo; "Não sabia"
 * volta ao começo (amanhã). Fica no navegador, como o caderno de erros
 * (lib/caderno.ts); as funções puras não tocam no localStorage, para os testes.
 */

export const INTERVALOS_DIAS = [1, 3, 7, 14] as const
const DIA_MS = 24 * 60 * 60 * 1000
const CHAVE = 'epi:revisao:v1'

export interface EstadoCartao {
  /** Quantas vezes seguidas acertou; indexa INTERVALOS_DIAS. */
  nivel: number
  proxima: number
}

export type Agenda = Record<string, EstadoCartao>

export function idDoTermo(termo: string): string {
  return termo.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function registrar(agenda: Agenda, termo: string, sabia: boolean, agora: number): Agenda {
  const id = idDoTermo(termo)
  const nivelAtual = agenda[id]?.nivel ?? 0
  const nivel = sabia ? Math.min(nivelAtual, INTERVALOS_DIAS.length - 1) : 0
  const estado: EstadoCartao = { nivel: sabia ? nivelAtual + 1 : 0, proxima: agora + INTERVALOS_DIAS[nivel] * DIA_MS }
  return { ...agenda, [id]: estado }
}

/** Cartões para hoje: os vencidos (mais atrasados primeiro) e depois os nunca vistos. */
export function paraHoje<T extends { termo: string }>(termos: readonly T[], agenda: Agenda, agora: number): T[] {
  const vencidos = termos
    .filter((t) => {
      const e = agenda[idDoTermo(t.termo)]
      return e && e.proxima <= agora
    })
    .sort((a, b) => agenda[idDoTermo(a.termo)].proxima - agenda[idDoTermo(b.termo)].proxima)
  const novos = termos.filter((t) => !agenda[idDoTermo(t.termo)])
  return [...vencidos, ...novos]
}

/** Data da próxima revisão agendada, ou null se nada estiver agendado. */
export function proximaRevisao(agenda: Agenda): number | null {
  const datas = Object.values(agenda).map((e) => e.proxima)
  return datas.length ? Math.min(...datas) : null
}

function valida(v: unknown): v is Agenda {
  return (
    typeof v === 'object' &&
    v !== null &&
    Object.values(v).every(
      (e) => typeof e === 'object' && e !== null && Number.isFinite((e as EstadoCartao).nivel) && Number.isFinite((e as EstadoCartao).proxima)
    )
  )
}

export function lerAgenda(): Agenda {
  try {
    const bruto: unknown = JSON.parse(localStorage.getItem(CHAVE) ?? '{}')
    return valida(bruto) ? bruto : {}
  } catch {
    // Sem acesso ao storage ou JSON corrompido: começa uma agenda nova.
    return {}
  }
}

export function salvarAgenda(agenda: Agenda): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(agenda))
  } catch {
    // Storage cheio ou bloqueado: a revisão continua, só não fica lembrada.
  }
}
