const KEY = 'resolver_acuracia_v1'

export interface AcuraciaStats {
  acertos: number
  total: number
}

export function lerAcuracia(): AcuraciaStats {
  if (typeof window === 'undefined') return { acertos: 0, total: 0 }
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return { acertos: 0, total: 0 }
    const parsed = JSON.parse(raw)
    return { acertos: parsed.acertos ?? 0, total: parsed.total ?? 0 }
  } catch {
    return { acertos: 0, total: 0 }
  }
}

export function registrarResultado(acertou: boolean): AcuraciaStats {
  const atual = lerAcuracia()
  const novo = { acertos: atual.acertos + (acertou ? 1 : 0), total: atual.total + 1 }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(novo))
  } catch {
    // localStorage indisponível — segue só em memória
  }
  return novo
}

export function resetarAcuracia(): AcuraciaStats {
  const zerado = { acertos: 0, total: 0 }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(zerado))
  } catch {
    // ignore
  }
  return zerado
}
