'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CircleCheck, LogOut, TriangleAlert, UserRound, X } from 'lucide-react'
import { api } from '@/lib/api'
import {
  ContaErro,
  SENHA_MINIMA,
  criarConta,
  definirSenha,
  entrar,
  lerRetornoDoLink,
  lerSessao,
  limparSessao,
  precisaRenovar,
  recuperarSenha,
  reenviarConfirmacao,
  renovar,
  sair,
  salvarSessao,
  type AuthConfig,
  type Sessao,
} from '@/lib/conta'

type Modo = 'entrar' | 'criar' | 'recuperar' | 'nova-senha'

const TITULOS: Record<Modo, string> = {
  entrar: 'Entrar',
  criar: 'Criar conta',
  recuperar: 'Recuperar senha',
  'nova-senha': 'Definir nova senha',
}

const campo =
  'glass w-full rounded-lg px-3 py-2 text-[0.85rem] text-text outline-none placeholder:text-muted focus:border-violet/40'

/**
 * Conta do aluno no cabeçalho: botão "Entrar" e janela de entrar / criar conta /
 * recuperar senha. É opcional — o app funciona igual sem login.
 */
export default function Conta() {
  const [cfg, setCfg] = useState<AuthConfig | null>(null)
  const [sessao, setSessao] = useState<Sessao | null>(null)
  const [aberto, setAberto] = useState(false)
  const [menu, setMenu] = useState(false)
  const [modo, setModo] = useState<Modo>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<ContaErro | null>(null)
  const [aviso, setAviso] = useState('')
  const primeiroCampo = useRef<HTMLInputElement>(null)

  const guardar = useCallback((s: Sessao | null) => {
    if (s) salvarSessao(s)
    else limparSessao()
    setSessao(s)
  }, [])

  function abrir(m: Modo, mensagem = '') {
    setModo(m)
    setErro(null)
    setAviso(mensagem)
    setSenha('')
    setSenha2('')
    setMenu(false)
    setAberto(true)
  }

  // Configuração, retorno do link do e-mail e sessão guardada.
  useEffect(() => {
    let vivo = true
    api
      .config()
      .then(async (c) => {
        if (!vivo || !c.auth_url || !c.auth_chave) return
        const conf = { url: c.auth_url, chave: c.auth_chave }
        setCfg(conf)

        const retorno = lerRetornoDoLink(window.location.hash)
        if (retorno) {
          // Tira os tokens da barra de endereço (e do histórico).
          window.history.replaceState(null, '', window.location.pathname + window.location.search)
          if (retorno.tipo === 'erro') {
            setModo('entrar')
            setErro(retorno.erro)
            setAberto(true)
            return
          }
          guardar(retorno.sessao)
          if (retorno.evento === 'recovery') abrir('nova-senha')
          else if (retorno.evento === 'signup') {
            setAviso('E-mail confirmado. Você já está conectado.')
            setModo('entrar')
            setAberto(true)
          }
          return
        }

        const salva = lerSessao()
        if (!salva) return
        if (!precisaRenovar(salva)) {
          setSessao(salva)
          return
        }
        try {
          const nova = await renovar(conf, salva)
          if (vivo) guardar(nova)
        } catch (e) {
          // Token de renovação recusado: a sessão acabou. Sem rede: mantém e tenta depois.
          if (vivo && (e as ContaErro).codigo) guardar(null)
          else if (vivo) setSessao(salva)
        }
      })
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [guardar])

  // Renova a sessão um pouco antes de vencer, enquanto a página estiver aberta.
  useEffect(() => {
    if (!cfg || !sessao) return
    const ms = Math.max((sessao.expira_em - 60) * 1000 - Date.now(), 5000)
    const id = setTimeout(() => {
      renovar(cfg, sessao)
        .then(guardar)
        .catch((e: ContaErro) => {
          if (e.codigo) guardar(null)
        })
    }, ms)
    return () => clearTimeout(id)
  }, [cfg, sessao, guardar])

  useEffect(() => {
    if (!aberto) return
    primeiroCampo.current?.focus()
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false)
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aberto, modo])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!cfg || carregando) return
    setErro(null)
    setAviso('')
    const mail = email.trim()

    if ((modo === 'criar' || modo === 'nova-senha') && senha !== senha2) {
      setErro(new ContaErro('As senhas não conferem.'))
      return
    }
    if ((modo === 'criar' || modo === 'nova-senha') && senha.length < SENHA_MINIMA) {
      setErro(new ContaErro(`A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`))
      return
    }

    setCarregando(true)
    try {
      if (modo === 'entrar') {
        guardar(await entrar(cfg, mail, senha))
        setAberto(false)
      } else if (modo === 'criar') {
        const s = await criarConta(cfg, mail, senha)
        if (s) {
          guardar(s)
          setAberto(false)
        } else {
          setModo('entrar')
          setSenha('')
          setSenha2('')
          setAviso(`Enviamos um link de confirmação para ${mail}. Clique nele para ativar a conta.`)
        }
      } else if (modo === 'recuperar') {
        await recuperarSenha(cfg, mail)
        setAviso(`Se existir uma conta com ${mail}, enviamos um link para criar uma nova senha.`)
      } else if (modo === 'nova-senha' && sessao) {
        await definirSenha(cfg, sessao, senha)
        setAberto(false)
      }
    } catch (err) {
      setErro(err instanceof ContaErro ? err : new ContaErro('Falha inesperada. Tente de novo.'))
    } finally {
      setCarregando(false)
    }
  }

  async function reenviar() {
    if (!cfg) return
    setCarregando(true)
    try {
      await reenviarConfirmacao(cfg, email.trim())
      setErro(null)
      setAviso(`Link de confirmação reenviado para ${email.trim()}.`)
    } catch (err) {
      setErro(err as ContaErro)
    } finally {
      setCarregando(false)
    }
  }

  async function desconectar() {
    setMenu(false)
    if (cfg && sessao) await sair(cfg, sessao)
    guardar(null)
  }

  if (!cfg) return null

  return (
    <div className="relative">
      {sessao ? (
        <button
          type="button"
          onClick={() => setMenu((v) => !v)}
          aria-expanded={menu}
          title={sessao.email}
          className="flex items-center gap-1.5 rounded-md border border-cyan/30 bg-cyan/10 px-2.5 py-1 font-mono text-[0.68rem] font-medium text-cyan transition-colors hover:border-cyan/60"
        >
          <UserRound className="h-3 w-3" aria-hidden="true" />
          <span className="hidden max-w-[14ch] truncate sm:inline">{sessao.email || 'Conectado'}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => abrir('entrar')}
          className="flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.04] px-2.5 py-1 font-mono text-[0.68rem] font-medium text-text transition-colors hover:border-violet/50 hover:text-violet"
        >
          <UserRound className="h-3 w-3" aria-hidden="true" />
          Entrar
        </button>
      )}

      {sessao && menu && (
        <div className="glass absolute right-0 top-full z-50 mt-2 w-60 rounded-lg border border-white/15 p-3 text-[0.8rem] text-text shadow-xl">
          <p className="text-muted">Conectado como</p>
          <p className="mb-3 truncate font-medium">{sessao.email}</p>
          <button
            type="button"
            onClick={() => abrir('nova-senha')}
            className="mb-1 block w-full rounded-md px-2 py-1.5 text-left hover:bg-white/[0.06]"
          >
            Trocar senha
          </button>
          <button
            type="button"
            onClick={desconectar}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-rose-300 hover:bg-white/[0.06]"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Sair
          </button>
        </div>
      )}

      {aberto && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 px-4 pt-[12vh] backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAberto(false)
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="conta-titulo"
            onSubmit={enviar}
            className="glass relative w-full max-w-sm rounded-xl border border-white/15 bg-surface/95 p-5 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="absolute right-3 top-3 text-muted hover:text-text"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>

            <h2 id="conta-titulo" className="mb-1 font-display text-xl italic text-text">
              {TITULOS[modo]}
            </h2>
            <p className="mb-4 text-[0.78rem] text-muted">
              {modo === 'nova-senha'
                ? 'Escolha a senha que vai usar daqui em diante.'
                : 'A conta é opcional: o app continua funcionando sem login.'}
            </p>

            {(modo === 'entrar' || modo === 'criar') && (
              <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-white/[0.04] p-1 text-[0.8rem]">
                {(['entrar', 'criar'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => abrir(m)}
                    aria-pressed={modo === m}
                    className={`rounded-md py-1.5 transition-colors ${
                      modo === m ? 'bg-white/10 text-text' : 'text-muted hover:text-text'
                    }`}
                  >
                    {TITULOS[m]}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2">
              {modo !== 'nova-senha' && (
                <input
                  ref={primeiroCampo}
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="E-mail"
                  autoComplete="email"
                  className={campo}
                />
              )}
              {modo !== 'recuperar' && (
                <input
                  ref={modo === 'nova-senha' ? primeiroCampo : undefined}
                  type="password"
                  required
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder={modo === 'entrar' ? 'Senha' : `Senha (mínimo ${SENHA_MINIMA} caracteres)`}
                  autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
                  className={campo}
                />
              )}
              {(modo === 'criar' || modo === 'nova-senha') && (
                <input
                  type="password"
                  required
                  value={senha2}
                  onChange={(e) => setSenha2(e.target.value)}
                  placeholder="Repita a senha"
                  autoComplete="new-password"
                  className={campo}
                />
              )}
            </div>

            {erro && (
              <div role="alert" className="mt-3 flex items-start gap-1.5 text-[0.78rem] text-rose-300">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {erro.message}
                  {erro.codigo === 'email_not_confirmed' && email.trim() && (
                    <>
                      {' '}
                      <button type="button" onClick={reenviar} className="underline hover:text-text">
                        Reenviar link
                      </button>
                    </>
                  )}
                </span>
              </div>
            )}
            {aviso && (
              <div role="status" className="mt-3 flex items-start gap-1.5 text-[0.78rem] text-cyan">
                <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{aviso}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={carregando}
              className="mt-4 w-full rounded-lg bg-gradient-to-r from-violet to-cyan px-4 py-2 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {carregando
                ? 'Aguarde…'
                : modo === 'entrar'
                  ? 'Entrar'
                  : modo === 'criar'
                    ? 'Criar conta'
                    : modo === 'recuperar'
                      ? 'Enviar link'
                      : 'Salvar senha'}
            </button>

            {modo === 'entrar' && (
              <button
                type="button"
                onClick={() => abrir('recuperar')}
                className="mt-3 w-full text-center text-[0.75rem] text-muted underline-offset-2 hover:text-text hover:underline"
              >
                Esqueci minha senha
              </button>
            )}
            {modo === 'recuperar' && (
              <button
                type="button"
                onClick={() => abrir('entrar')}
                className="mt-3 w-full text-center text-[0.75rem] text-muted underline-offset-2 hover:text-text hover:underline"
              >
                Voltar para entrar
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  )
}
