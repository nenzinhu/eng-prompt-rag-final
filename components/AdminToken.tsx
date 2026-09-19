'use client'

import { useState } from 'react'
import { LockOpen, Lock, TriangleAlert } from 'lucide-react'

/**
 * Portão da área restrita: pede usuário e senha, autentica no servidor e
 * recebe um token de sessão, que é enviado nas rotas de escrita.
 */
export default function AdminToken({
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
      <div className="mb-4 flex items-center justify-between rounded-xl border border-borda-forte bg-cartao-hover px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-[0.72rem] text-texto">
          <LockOpen className="h-3.5 w-3.5" aria-hidden="true" />
          Área restrita ativa
        </span>
        <button
          onClick={onSair}
          className="text-[0.68rem] text-texto-suave underline-offset-2 hover:text-texto hover:underline"
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
      className="cartao mb-4 p-4"
    >
      <div className="rotulo mb-2 flex items-center gap-1.5 text-atencao">
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        Área restrita — envio e indexação de materiais
      </div>
      <p className="mb-3 text-[0.8rem] leading-relaxed text-texto-suave">
        Estas rotas alteram o acervo do curso. Entre com as credenciais de administrador.
      </p>
      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          placeholder="Usuário"
          autoComplete="username"
          className="campo text-[0.92rem] w-full px-3 py-2"
        />
        <div className="flex gap-2">
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Senha"
            autoComplete="current-password"
            className="campo text-[0.92rem] min-w-0 flex-1 px-3 py-2"
          />
          <button
            type="submit"
            disabled={verificando || !usuario.trim() || !senha}
            className="btn-primario px-4 py-2"
          >
            {verificando ? 'Entrando…' : 'Entrar'}
          </button>
        </div>
      </div>
      {erro && (
        <div className="mt-2 flex items-center gap-1.5 text-[0.78rem] text-erro">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {erro}
        </div>
      )}
    </form>
  )
}
