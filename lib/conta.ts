/**
 * Conta do aluno (opcional), pelo Supabase Auth com e-mail e senha.
 *
 * O navegador fala direto com o Supabase Auth: assim o limite de tentativas do
 * Supabase conta por aluno, e não pelo IP do servidor. O backend só informa o
 * endereço e a chave pública em /api/config. A conta por enquanto só identifica
 * o aluno; nenhuma rota do app exige login.
 */

const KEY = 'conta_sessao_v1'

export interface AuthConfig {
  url: string
  chave: string
}

export interface Sessao {
  access_token: string
  refresh_token: string
  /** Segundos desde a época (Unix). */
  expira_em: number
  email: string
}

export class ContaErro extends Error {
  codigo: string

  constructor(mensagem: string, codigo = '') {
    super(mensagem)
    this.name = 'ContaErro'
    this.codigo = codigo
  }
}

const MENSAGENS: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  invalid_grant: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar. Procure o link na caixa de entrada (e no spam).',
  user_already_exists: 'Já existe uma conta com este e-mail. Tente entrar.',
  email_exists: 'Já existe uma conta com este e-mail. Tente entrar.',
  weak_password: 'Senha fraca. Use pelo menos 6 caracteres.',
  email_address_invalid: 'E-mail inválido.',
  validation_failed: 'Confira o e-mail e a senha.',
  over_email_send_rate_limit: 'Muitos e-mails enviados agora. Espere alguns minutos e tente de novo.',
  over_request_rate_limit: 'Muitas tentativas. Espere alguns minutos e tente de novo.',
  signup_disabled: 'A criação de contas está desativada.',
  same_password: 'A nova senha precisa ser diferente da atual.',
  otp_expired: 'O link expirou ou já foi usado. Peça um novo.',
  session_not_found: 'Sua sessão terminou. Entre de novo.',
  refresh_token_not_found: 'Sua sessão terminou. Entre de novo.',
}

/** Traduz o corpo de erro do Supabase Auth (formato novo e antigo). */
export function mensagemErroAuth(corpo: unknown, status: number): ContaErro {
  const c = (corpo ?? {}) as Record<string, unknown>
  const codigo = String(c.error_code ?? c.error ?? '')
  const bruta = String(c.msg ?? c.error_description ?? c.message ?? '')
  if (MENSAGENS[codigo]) return new ContaErro(MENSAGENS[codigo], codigo)
  if (status === 429) return new ContaErro(MENSAGENS.over_request_rate_limit, 'over_request_rate_limit')
  return new ContaErro(bruta || `Erro ${status} no serviço de contas.`, codigo)
}

/** Lê o payload de um JWT sem validar a assinatura (quem valida é o servidor). */
export function payloadJwt(token: string): Record<string, unknown> {
  const parte = token.split('.')[1]
  if (!parte) return {}
  try {
    const b64 = parte.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parte.length / 4) * 4, '=')
    const bin = atob(b64)
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return {}
  }
}

function sessaoDe(d: Record<string, unknown>): Sessao {
  const access = String(d.access_token ?? '')
  const refresh = String(d.refresh_token ?? '')
  if (!access || !refresh) throw new ContaErro('Resposta sem sessão do serviço de contas.')
  const jwt = payloadJwt(access)
  const agora = Math.floor(Date.now() / 1000)
  const expira =
    Number(d.expires_at) || Number(jwt.exp) || agora + (Number(d.expires_in) || 3600)
  const user = d.user as { email?: string } | undefined
  return {
    access_token: access,
    refresh_token: refresh,
    expira_em: expira,
    email: String(user?.email ?? jwt.email ?? ''),
  }
}

export type RetornoLink =
  | { tipo: 'sessao'; sessao: Sessao; evento: string }
  | { tipo: 'erro'; erro: ContaErro }
  | null

/**
 * Interpreta o `#...` com que o Supabase devolve o aluno depois de clicar no
 * link do e-mail (confirmação de conta ou recuperação de senha).
 */
export function lerRetornoDoLink(hash: string): RetornoLink {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  if (p.get('error') || p.get('error_code')) {
    const codigo = p.get('error_code') || p.get('error') || ''
    const texto = (p.get('error_description') || '').replace(/\+/g, ' ')
    return { tipo: 'erro', erro: new ContaErro(MENSAGENS[codigo] ?? (texto || 'Link inválido.'), codigo) }
  }
  if (!p.get('access_token') || !p.get('refresh_token')) return null
  try {
    return { tipo: 'sessao', sessao: sessaoDe(Object.fromEntries(p)), evento: p.get('type') || '' }
  } catch (e) {
    return { tipo: 'erro', erro: e as ContaErro }
  }
}

async function chamar(
  cfg: AuthConfig,
  caminho: string,
  init: { method?: string; corpo?: unknown; token?: string } = {},
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { apikey: cfg.chave, 'Content-Type': 'application/json' }
  if (init.token) headers.Authorization = `Bearer ${init.token}`
  let r: Response
  try {
    r = await fetch(`${cfg.url}${caminho}`, {
      method: init.method ?? 'POST',
      headers,
      body: init.corpo === undefined ? undefined : JSON.stringify(init.corpo),
    })
  } catch {
    throw new ContaErro('Sem conexão com o serviço de contas.')
  }
  const texto = await r.text()
  let dados: Record<string, unknown> = {}
  try {
    dados = texto ? JSON.parse(texto) : {}
  } catch {
    dados = {}
  }
  if (!r.ok) throw mensagemErroAuth(dados, r.status)
  return dados
}

/** Endereço para onde o link do e-mail devolve o aluno: a página atual, sem `#`. */
function destinoDoLink(): string {
  return window.location.origin + window.location.pathname
}

/**
 * Cria a conta. Com confirmação de e-mail ligada (padrão do projeto), devolve
 * `null`: o aluno precisa clicar no link antes de entrar.
 */
export async function criarConta(cfg: AuthConfig, email: string, senha: string): Promise<Sessao | null> {
  const d = await chamar(cfg, `/signup?redirect_to=${encodeURIComponent(destinoDoLink())}`, {
    corpo: { email, password: senha },
  })
  return d.access_token ? sessaoDe(d) : null
}

export async function entrar(cfg: AuthConfig, email: string, senha: string): Promise<Sessao> {
  return sessaoDe(await chamar(cfg, '/token?grant_type=password', { corpo: { email, password: senha } }))
}

export async function renovar(cfg: AuthConfig, s: Sessao): Promise<Sessao> {
  const nova = sessaoDe(
    await chamar(cfg, '/token?grant_type=refresh_token', { corpo: { refresh_token: s.refresh_token } }),
  )
  return { ...nova, email: nova.email || s.email }
}

export async function sair(cfg: AuthConfig, s: Sessao): Promise<void> {
  // Encerrar no servidor é cortesia: se falhar, a sessão local some do mesmo jeito.
  await chamar(cfg, '/logout', { token: s.access_token }).catch(() => undefined)
}

export async function reenviarConfirmacao(cfg: AuthConfig, email: string): Promise<void> {
  await chamar(cfg, `/resend?redirect_to=${encodeURIComponent(destinoDoLink())}`, {
    corpo: { type: 'signup', email },
  })
}

export async function recuperarSenha(cfg: AuthConfig, email: string): Promise<void> {
  await chamar(cfg, `/recover?redirect_to=${encodeURIComponent(destinoDoLink())}`, { corpo: { email } })
}

export async function definirSenha(cfg: AuthConfig, s: Sessao, senha: string): Promise<void> {
  await chamar(cfg, '/user', { method: 'PUT', token: s.access_token, corpo: { password: senha } })
}

/** Sessão guardada no navegador (pode estar vencida; ver `precisaRenovar`). */
export function lerSessao(): Sessao | null {
  if (typeof window === 'undefined') return null
  try {
    const s = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Sessao | null
    return s?.access_token && s.refresh_token ? s : null
  } catch {
    return null
  }
}

export function salvarSessao(s: Sessao): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // localStorage indisponível — a sessão vale só enquanto a página estiver aberta
  }
}

export function limparSessao(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

/** Renova com 1 minuto de folga, para não usar um token que vence no caminho. */
export function precisaRenovar(s: Sessao, agora = Date.now() / 1000): boolean {
  return s.expira_em - agora < 60
}

export const SENHA_MINIMA = 6
