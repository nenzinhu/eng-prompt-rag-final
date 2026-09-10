const KEY = 'admin_token_v1'

/** Token de admin do navegador. Só é enviado nas rotas de escrita. */
export function lerTokenAdmin(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function salvarTokenAdmin(token: string): void {
  try {
    window.localStorage.setItem(KEY, token)
  } catch {
    // localStorage indisponível — o token vale só para esta aba
  }
}

export function limparTokenAdmin(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
