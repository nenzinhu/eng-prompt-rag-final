/**
 * Progresso de estudo: o que a tela Hoje usa para responder "o que eu estudo agora?".
 *
 * Cada pergunta respondida vira um registro com a fonte mais relevante, e as
 * páginas citadas contam como estudadas. Fica no navegador (uso pessoal, um
 * aparelho); as funções puras abaixo não tocam no localStorage, para os testes.
 */

export interface Estudo {
  pergunta: string
  fonte: string | null
  pagina: number | null
  em: number
}

export interface Progresso {
  estudos: Estudo[]
  /** Páginas citadas por apostila, sem repetição. */
  paginas: Record<string, number[]>
}

export interface ResumoApostila {
  fonte: string
  paginas: number
  ultimaVez: number
}

/** Só o que o progresso precisa de cada trecho citado (compatível com `Evidencia`). */
interface Citacao {
  fonte: string
  pagina?: number
  relevancia?: number
}

const CHAVE = 'epi:progresso:v1'
const MAX_ESTUDOS = 30

export const PROGRESSO_VAZIO: Progresso = { estudos: [], paginas: {} }

/** Soma uma pergunta respondida ao progresso, sem alterar o objeto recebido. */
export function aplicarEstudo(
  atual: Progresso,
  pergunta: string,
  contexto: Citacao[],
  agora: number,
): Progresso {
  const texto = pergunta.trim()
  if (!texto) return atual
  const principal = [...contexto].sort((a, b) => (b.relevancia ?? 0) - (a.relevancia ?? 0))[0]
  const estudo: Estudo = {
    pergunta: texto.slice(0, 200),
    fonte: principal?.fonte ?? null,
    pagina: principal?.pagina ?? null,
    em: agora,
  }
  const paginas: Record<string, number[]> = { ...atual.paginas }
  for (const c of contexto) {
    if (!c.fonte || typeof c.pagina !== 'number') continue
    const lista = paginas[c.fonte] ?? []
    if (!lista.includes(c.pagina)) paginas[c.fonte] = [...lista, c.pagina].sort((a, b) => a - b)
  }
  return { estudos: [estudo, ...atual.estudos].slice(0, MAX_ESTUDOS), paginas }
}

/** Apostilas já estudadas, da usada mais recentemente para a mais antiga. */
export function resumoPorApostila(p: Progresso): ResumoApostila[] {
  const ultimaVez: Record<string, number> = {}
  for (const e of p.estudos) {
    if (e.fonte && !(e.fonte in ultimaVez)) ultimaVez[e.fonte] = e.em
  }
  return Object.entries(p.paginas)
    .map(([fonte, paginas]) => ({ fonte, paginas: paginas.length, ultimaVez: ultimaVez[fonte] ?? 0 }))
    .sort((a, b) => b.ultimaVez - a.ultimaVez || b.paginas - a.paginas)
}

/** Nome legível de um arquivo do acervo: sem extensão e sem sublinhados. */
export function nomeDaApostila(fonte: string): string {
  return fonte.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim()
}

function valido(dado: unknown): dado is Progresso {
  const p = dado as Progresso | null
  return !!p && Array.isArray(p.estudos) && typeof p.paginas === 'object' && p.paginas !== null
}

export function lerProgresso(): Progresso {
  try {
    const bruto = localStorage.getItem(CHAVE)
    const dado: unknown = bruto ? JSON.parse(bruto) : null
    return valido(dado) ? dado : PROGRESSO_VAZIO
  } catch {
    // localStorage indisponível ou dado corrompido: começa do zero.
    return PROGRESSO_VAZIO
  }
}

export function registrarEstudo(pergunta: string, contexto: Citacao[]): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(aplicarEstudo(lerProgresso(), pergunta, contexto, Date.now())))
  } catch {
    // Sem localStorage (modo privado): o progresso só não é guardado.
  }
}
