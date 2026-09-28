/**
 * Busca da paleta de comandos (Ctrl+K).
 *
 * Pura e fora do componente para ser testável sem navegador. Ignora acentos e
 * maiúsculas ("glossario" acha "Glossário") e aceita as letras em sequência
 * com saltos ("cdn" acha "Caderno"), pontuando mais o que casa no começo.
 */

export interface ItemPaleta {
  id: string
  titulo: string
  /** Texto extra que também conta na busca (grupo, apelidos). */
  extra?: string
}

export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Pontua `alvo` para a `consulta`; `null` quando não casa. Maior é melhor. */
export function pontuar(consulta: string, alvo: string): number | null {
  const q = normalizar(consulta)
  const t = normalizar(alvo)
  if (!q) return 0
  if (t.startsWith(q)) return 100
  const palavra = t.split(/\s+/).findIndex((p) => p.startsWith(q))
  if (palavra !== -1) return 80 - palavra
  if (t.includes(q)) return 60
  // Subsequência: cada letra da consulta aparece em ordem.
  let i = 0
  let saltos = 0
  for (const c of t) {
    if (c === q[i]) i++
    else if (i > 0) saltos++
    if (i === q.length) return Math.max(1, 40 - saltos)
  }
  return null
}

/** Itens que casam, do melhor para o pior; empate mantém a ordem original. */
export function filtrar<T extends ItemPaleta>(consulta: string, itens: readonly T[]): T[] {
  return itens
    .map((item, ordem) => {
      const titulo = pontuar(consulta, item.titulo)
      const extra = item.extra ? pontuar(consulta, item.extra) : null
      const nota = Math.max(titulo ?? -1, extra === null ? -1 : extra / 2)
      return { item, ordem, nota }
    })
    .filter((r) => r.nota >= 0)
    .sort((a, b) => b.nota - a.nota || a.ordem - b.ordem)
    .map((r) => r.item)
}
