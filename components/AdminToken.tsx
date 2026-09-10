'use client'

import { useState } from 'react'

/** Portão das rotas de escrita: valida o token de admin antes de liberar os botões. */
export default function AdminToken({
  token,
  onEntrar,
  onSair,
  valido,
  verificando,
  erro,
}: {
  token: string
  onEntrar: (token: string) => void
  onSair: () => void
  valido: boolean
  verificando: boolean
  erro: string
}) {
  const [entrada, setEntrada] = useState('')

  if (valido) {
    return (
      <div className="mb-4 flex items-center justify-between rounded-xl border border-cyan/20 bg-cyan/[0.05] px-4 py-2.5">
        <span className="font-mono text-[0.72rem] text-cyan">🔓 Modo admin ativo</span>
        <button
          onClick={onSair}
          className="font-mono text-[0.68rem] text-muted underline-offset-2 hover:text-text hover:underline"
        >
          sair
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (entrada.trim()) onEntrar(entrada.trim())
      }}
      className="glass mb-4 rounded-xl p-4"
    >
      <div className="mb-2 font-mono text-[0.68rem] uppercase tracking-wider text-amber-300">
        🔒 Área restrita — envio e indexação de materiais
      </div>
      <p className="mb-3 text-[0.8rem] leading-relaxed text-muted">
        Estas rotas alteram o acervo do curso, então exigem o token de administrador
        (variável <code className="font-mono text-cyan">ADMIN_TOKEN</code> no servidor).
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          type="password"
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          placeholder="Cole o token de admin"
          autoComplete="off"
          className="glass min-w-0 flex-1 rounded-lg px-3 py-2 font-mono text-[0.8rem] text-text outline-none placeholder:text-muted focus:border-violet/40"
        />
        <button
          type="submit"
          disabled={verificando || !entrada.trim()}
          className="rounded-lg bg-gradient-to-r from-violet to-cyan px-4 py-2 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {verificando ? 'Verificando…' : 'Entrar'}
        </button>
      </div>
      {token !== '' && erro && <div className="mt-2 text-[0.78rem] text-rose-300">⚠️ {erro}</div>}
    </form>
  )
}
