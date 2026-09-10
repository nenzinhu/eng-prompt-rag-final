'use client'

import { useState } from 'react'

/**
 * Portão da área restrita: pede usuário e senha, autentica no servidor e
 * recebe um token de sessão, que é enviado nas rotas de escrita.
 */
export default function AdminToken({
  token,
  onEntrar,
  onSair,
  valido,
  verificando,
  erro,
}: {
  token: string
  onEntrar: (usuario: string, senha: string) => void
  onSair: () => void
  valido: boolean
  verificando: boolean
  erro: string
}) {
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')

  if (valido) {
    return (
      <div className="mb-4 flex items-center justify-between rounded-xl border border-cyan/20 bg-cyan/[0.05] px-4 py-2.5">
        <span className="font-mono text-[0.72rem] text-cyan">🔓 Área restrita ativa</span>
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
        if (usuario.trim() && senha) onEntrar(usuario.trim(), senha)
      }}
      className="glass mb-4 rounded-xl p-4"
    >
      <div className="mb-2 font-mono text-[0.68rem] uppercase tracking-wider text-amber-300">
        🔒 Área restrita — envio e indexação de materiais
      </div>
      <p className="mb-3 text-[0.8rem] leading-relaxed text-muted">
        Estas rotas alteram o acervo do curso. Entre com as credenciais de administrador.
      </p>
      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          placeholder="Usuário"
          autoComplete="username"
          className="glass w-full rounded-lg px-3 py-2 font-mono text-[0.8rem] text-text outline-none placeholder:text-muted focus:border-violet/40"
        />
        <div className="flex gap-2">
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Senha"
            autoComplete="current-password"
            className="glass min-w-0 flex-1 rounded-lg px-3 py-2 font-mono text-[0.8rem] text-text outline-none placeholder:text-muted focus:border-violet/40"
          />
          <button
            type="submit"
            disabled={verificando || !usuario.trim() || !senha}
            className="rounded-lg bg-gradient-to-r from-violet to-cyan px-4 py-2 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {verificando ? 'Entrando…' : 'Entrar'}
          </button>
        </div>
      </div>
      {erro && <div className="mt-2 text-[0.78rem] text-rose-300">⚠️ {erro}</div>}
    </form>
  )
}
