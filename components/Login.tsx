'use client'

import { useState } from 'react'
import { Lock, TriangleAlert } from 'lucide-react'
import { api } from '@/lib/api'
import { salvarTokenAdmin } from '@/lib/admin'

/**
 * Tela de entrada do app privado (APP_PRIVADO=1). Usa as mesmas credenciais da
 * área restrita: o servidor grava a sessão do app num cookie e devolve o token
 * de admin, que já deixa a aba PDFs liberada sem um segundo login.
 */
export default function Login({ onEntrou }: { onEntrou: () => void }) {
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [erro, setErro] = useState('')

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    if (!usuario.trim() || !senha) return
    setEntrando(true)
    setErro('')
    try {
      const d = await api.adminLogin(usuario.trim(), senha)
      salvarTokenAdmin(d.token)
      onEntrou()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível entrar.')
      setEntrando(false)
    }
  }

  const campo =
    'glass w-full rounded-lg px-3 py-2.5 text-[0.9rem] text-text outline-none placeholder:text-muted focus:border-violet/40'

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={entrar} className="glass w-full max-w-sm rounded-2xl p-6" aria-labelledby="titulo-login">
        <div className="mb-5 flex items-center gap-2">
          <Lock className="h-4 w-4 text-violet" aria-hidden="true" />
          <h1 id="titulo-login" className="font-display text-xl italic text-text">
            Entrar
          </h1>
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-[0.8rem] text-muted">
            Usuário
            <input
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              className={campo}
            />
          </label>
          <label className="flex flex-col gap-1 text-[0.8rem] text-muted">
            Senha
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              required
              className={campo}
            />
          </label>
          <button
            type="submit"
            disabled={entrando || !usuario.trim() || !senha}
            className="mt-1 rounded-lg bg-gradient-to-r from-violet to-cyan px-4 py-2.5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>
        </div>
        {erro && (
          <p role="alert" className="mt-3 flex items-start gap-1.5 text-[0.8rem] text-rose-300">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {erro}
          </p>
        )}
      </form>
    </main>
  )
}
