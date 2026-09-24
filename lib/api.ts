import type {
  AprenderAvaliarResp,
  AprenderExplicarResp,
  NivelAprender,
  StatusResp,
  ConfigResp,
  ProvidersResp,
  BuscarResp,
  TrechoResp,
  TurnoConversa,
  PerguntarResp,
  ResolverResp,
  QuestoesResp,
  PdfsResp,
  IngerirResp,
  PreviaIngestaoResp,
  UploadResp,
  EnvioUrlResp,
  CompararAlvo,
  CompararResp,
  Evidencia,
  SimplificarResp,
  VerificarResp,
  GlossarioResp,
  TermoGlossario,
  AuditarResp,
  ResumoApostilaResp,
  LaboratorioResp,
  PerfisComportamentaisResp,
  PerfilComportamentalResp,
  ElencoPersonasResp,
  ElencoConversaResp,
  FalePersonasResp,
  FaleOQuePensaResp,
  SuportePersonasResp,
  SuporteAtendimentoResp,
} from './types'
import { semRaciocinio } from './texto'

/** Erro de API que preserva o corpo devolvido pelo backend. */
export class ApiError extends Error {
  status: number
  detalhe: unknown

  constructor(mensagem: string, status: number, detalhe: unknown) {
    super(mensagem)
    this.name = 'ApiError'
    this.status = status
    this.detalhe = detalhe
  }
}

/**
 * Extrai uma mensagem legível de um `detail` que pode ser string ou objeto.
 *
 * Quando o corpo NÃO é JSON (erro da plataforma, HTML de proxy), mostrar o texto
 * cru é melhor do que engolir tudo em "Erro N na requisição": era essa mensagem
 * genérica que deixava um upload falho sem explicação nenhuma.
 */
function mensagemDe(data: unknown, status: number, texto: string): string {
  const detalhe = (data as { detail?: unknown } | null)?.detail
  if (typeof detalhe === 'string') return detalhe
  // Erro de validação do FastAPI (422): `detail` é uma LISTA de problemas por
  // campo. Sem tratar, caía no texto cru e a tela mostrava o JSON inteiro
  // ('Erro 422: {"detail":[{"type":"missing"...').
  if (Array.isArray(detalhe)) {
    const problemas = detalhe
      .map((item) => {
        const p = item as { loc?: unknown[]; msg?: string }
        const campo = Array.isArray(p.loc) ? p.loc.filter((x) => x !== 'body').join('.') : ''
        return campo ? `${campo}: ${p.msg ?? 'inválido'}` : (p.msg ?? '')
      })
      .filter(Boolean)
    if (problemas.length) return `Dados inválidos — ${problemas.join('; ')}`
  }
  if (detalhe && typeof detalhe === 'object') {
    const obj = detalhe as { mensagem?: string; avisos?: string[] }
    if (obj.mensagem) return [obj.mensagem, ...(obj.avisos ?? [])].join(' ')
  }

  const cru = (texto || '').replace(/\s+/g, ' ').trim().slice(0, 200)
  const pistas: Record<number, string> = {
    413: 'O arquivo passou do limite da plataforma (4,5 MB por requisição na Vercel) — envie um arquivo menor ou rode o app localmente.',
    504: 'A operação passou do tempo máximo do servidor. Tente de novo, com menos itens de uma vez.',
    502: 'O provedor externo falhou ao responder.',
  }
  const pista = pistas[status]
  if (pista) return cru ? `${pista} (detalhe: ${cru})` : pista
  return cru ? `Erro ${status}: ${cru}` : `Erro ${status} na requisição`
}

/** Disparado quando o app privado recusa a chamada: a sessão acabou e é preciso entrar de novo. */
export const EVENTO_SESSAO_EXPIRADA = 'sessao-expirada'

/**
 * `fetch` das rotas do app. O 401 com `X-Sessao` vem do modo privado (e não da
 * área de admin, que tem o próprio login): avisa a página para voltar ao login.
 */
async function buscar(url: string, init?: RequestInit): Promise<Response> {
  const r = await fetch(url, init)
  if (r.status === 401 && r.headers.get('X-Sessao') && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA))
  }
  return r
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await buscar(url, init)
  const texto = await r.text()
  let data: unknown = null
  try {
    data = texto ? JSON.parse(texto) : null
  } catch {
    data = null
  }
  if (!r.ok) throw new ApiError(mensagemDe(data, r.status, texto), r.status, (data as { detail?: unknown })?.detail)
  return data as T
}

function postJson<T>(url: string, body: unknown, token?: string): Promise<T> {
  return pedir<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Admin-Token': token } : {}) },
    body: JSON.stringify(body),
  })
}

/**
 * Dispara o download de um blob.
 *
 * O `revokeObjectURL` ia logo depois do `click()`: alguns navegadores ainda não
 * tinham começado a baixar e cancelavam o arquivo. Revogar no próximo ciclo
 * (e depois de um tempo folgado) resolve sem vazar a URL. O link também entra
 * no documento — sem isso, o clique é ignorado em parte dos navegadores.
 */
export function baixarBlob(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    a.remove()
    URL.revokeObjectURL(url)
  }, 60_000)
}

/** Extrai o nome do arquivo do header Content-Disposition, com um padrão de fallback. */
function nomeDoContentDisposition(header: string | null, padrao: string): string {
  const m = header?.match(/filename="?([^"]+)"?/)
  return m ? m[1] : padrao
}

/** Baixa um arquivo binário (POST com corpo JSON, resposta é o arquivo, não JSON). */
async function baixarArquivo(url: string, body: unknown, nomePadrao: string): Promise<void> {
  const r = await buscar(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const texto = await r.text()
    let data: unknown = null
    try {
      data = texto ? JSON.parse(texto) : null
    } catch {
      data = null
    }
    throw new ApiError(mensagemDe(data, r.status, texto), r.status, (data as { detail?: unknown })?.detail)
  }
  const blob = await r.blob()
  const nome = nomeDoContentDisposition(r.headers.get('Content-Disposition'), nomePadrao)
  baixarBlob(blob, nome)
}

/** Eventos do /api/perguntar/stream (uma linha JSON cada). */
type EventoPergunta =
  | ({ tipo: 'meta' } & Omit<PerguntarResp, 'resposta'>)
  | { tipo: 'texto'; t: string }
  | { tipo: 'fim' }
  | { tipo: 'erro'; mensagem: string }

/**
 * Pergunta com a resposta chegando aos pedaços. `onMeta` recebe fontes e
 * confiança antes do texto; `onTexto`, a resposta acumulada até o momento, já
 * sem o bloco `<think>` de raciocínio.
 *
 * Se a resposta parar no meio (erro do provedor, conexão caída, linha cortada)
 * e algum texto já tiver chegado, resolve com esse texto e `interrompida` com o
 * motivo — apagar o que o aluno já estava lendo era pior (análise de 17/09/2026,
 * A1-05). Sem texto nenhum, rejeita com ApiError.
 */
async function perguntarStream(
  pergunta: string,
  provider: string,
  modelo: string,
  persona: string,
  onMeta: (meta: Omit<PerguntarResp, 'resposta'>) => void,
  onTexto: (acumulado: string) => void,
  /** Cancela o stream (nova pergunta ou "Limpar"): a conexão fecha e a promessa rejeita com AbortError. */
  signal?: AbortSignal,
  /** Turnos anteriores da conversa, do mais antigo ao mais recente. O servidor corta o excesso. */
  historico: TurnoConversa[] = [],
): Promise<PerguntarResp> {
  const r = await buscar('/api/perguntar/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pergunta, provider, modelo, persona, historico }),
    signal,
  })
  if (!r.ok || !r.body) {
    const texto = await r.text()
    let data: unknown = null
    try {
      data = texto ? JSON.parse(texto) : null
    } catch {
      data = null
    }
    throw new ApiError(mensagemDe(data, r.status, texto), r.status, (data as { detail?: unknown })?.detail)
  }

  const leitor = r.body.pipeThrough(new TextDecoderStream()).getReader()
  let meta: Omit<PerguntarResp, 'resposta'> | null = null
  let bruto = ''
  let pendente = ''
  let terminou = false
  let erro = ''

  const tratar = (linha: string) => {
    if (!linha.trim()) return
    let e: EventoPergunta
    try {
      e = JSON.parse(linha) as EventoPergunta
    } catch {
      // Linha cortada ao meio: a conexão caiu no meio de um evento.
      erro = erro || 'A conexão caiu antes de a resposta terminar.'
      return
    }
    if (e.tipo === 'meta') {
      const { tipo: _tipo, ...resto } = e
      meta = resto
      onMeta(resto)
    } else if (e.tipo === 'texto') {
      bruto += e.t
      onTexto(semRaciocinio(bruto))
    } else if (e.tipo === 'erro') {
      erro = e.mensagem
    } else {
      terminou = true
    }
  }

  try {
    while (!erro) {
      const { value, done } = await leitor.read()
      if (done) break
      pendente += value
      const linhas = pendente.split('\n')
      pendente = linhas.pop() ?? ''
      linhas.forEach(tratar)
    }
  } catch {
    erro = erro || 'A conexão caiu antes de a resposta terminar.'
  }
  // Cancelado por quem chamou: não é "resposta interrompida", é resposta descartada.
  if (signal?.aborted) throw new DOMException('Pergunta cancelada.', 'AbortError')
  // Parou por erro antes do fim do corpo: fecha a conexão em vez de deixá-la pendurada.
  if (erro) void leitor.cancel().catch(() => undefined)
  if (!erro) tratar(pendente)
  if (!erro && !terminou) erro = 'A conexão caiu antes de a resposta terminar.'

  const resposta = semRaciocinio(bruto)
  if (!meta) throw new ApiError(erro || 'Resposta vazia do servidor.', 502, null)
  if (erro && !resposta.trim()) throw new ApiError(`${erro} Tente de novo.`, 502, erro)
  return { ...(meta as Omit<PerguntarResp, 'resposta'>), resposta, ...(erro ? { interrompida: erro } : {}) }
}

export const api = {
  perguntarStream,
  // ── Leitura pública ──────────────────────────────────────────────────────
  status: () => pedir<StatusResp>('/api/status'),
  config: () => pedir<ConfigResp>('/api/config'),
  providers: () => pedir<ProvidersResp>('/api/providers'),
  buscar: (query: string, n = 6) => postJson<BuscarResp>('/api/buscar', { query, n }),
  /** Página indexada inteira, para conferir a citação da resposta. */
  trecho: (fonte: string, pagina?: number | null, vizinhas = true) => {
    const q = new URLSearchParams({ fonte, vizinhas: String(vizinhas) })
    if (pagina) q.set('pagina', String(pagina))
    return pedir<TrechoResp>(`/api/trecho?${q}`)
  },
  perguntar: (pergunta: string, provider: string, modelo: string, persona: string = 'padrao') =>
    postJson<PerguntarResp>('/api/perguntar', { pergunta, provider, modelo, persona }),
  simplificar: (pergunta: string, resposta: string, contexto: Evidencia[], provider: string, modelo: string) =>
    postJson<SimplificarResp>('/api/simplificar', { pergunta, resposta, contexto, provider, modelo }),
  verificar: (pergunta: string, resposta: string, contexto: Evidencia[], provider: string, modelo: string) =>
    postJson<VerificarResp>('/api/verificar', { pergunta, resposta, contexto, provider, modelo }),
  aprenderExplicar: (tema: string, nivel: NivelAprender, provider: string, modelo: string) =>
    postJson<AprenderExplicarResp>('/api/aprender/explicar', { tema, nivel, provider, modelo }),
  aprenderAvaliar: (tema: string, explicacao_aluno: string, contexto: Evidencia[], provider: string, modelo: string) =>
    postJson<AprenderAvaliarResp>('/api/aprender/avaliar', { tema, explicacao_aluno, contexto, provider, modelo }),
  laboratorio: (systemPrompt: string, userPrompt: string, provider: string, modelo: string) =>
    postJson<LaboratorioResp>('/api/laboratorio', {
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
      provider,
      modelo,
    }),
  praticarQuestoes: (tema: string, quantidade: number, provider: string, modelo: string) =>
    postJson<QuestoesResp>('/api/praticar/questoes', { tema, quantidade, provider, modelo }),
  resolver: (texto: string, provider: string, modelo: string) =>
    postJson<ResolverResp>('/api/resolver', { texto, provider, modelo }),
  glossario: (tema: string, provider: string, modelo: string) =>
    postJson<GlossarioResp>('/api/glossario', { tema, provider, modelo }),
  /** Auditoria de fidelidade: frase por frase contra o material. */
  auditar: (resposta: string) => postJson<AuditarResp>('/api/auditar', { resposta }),
  glossarioTermosSalvos: (q = '') =>
    pedir<{ termos: TermoGlossario[] }>(`/api/glossario/termos?q=${encodeURIComponent(q)}`),
  perfisComportamentais: () => pedir<PerfisComportamentaisResp>('/api/perfis-comportamentais'),
  perfilComportamental: (
    contexto: string,
    mensagem: string,
    temperamentId: string,
    provider: string,
    modelo: string
  ) =>
    postJson<PerfilComportamentalResp>('/api/perfil-comportamental', {
      contexto,
      mensagem,
      temperament_id: temperamentId,
      provider,
      modelo,
    }),
  elencoPersonas: () => pedir<ElencoPersonasResp>('/api/elenco-personas'),
  elencoConversa: (
    contexto: string,
    mensagem: string,
    personaId: string,
    provider: string,
    modelo: string
  ) =>
    postJson<ElencoConversaResp>('/api/elenco-conversa', {
      contexto,
      mensagem,
      persona_id: personaId,
      provider,
      modelo,
    }),
  falePersonas: () => pedir<FalePersonasResp>('/api/fale-personas'),
  faleOQuePensa: (rascunho: string, contexto: string, personaId: string, provider: string, modelo: string) =>
    postJson<FaleOQuePensaResp>('/api/fale-o-que-pensa', {
      rascunho,
      contexto,
      persona_id: personaId,
      provider,
      modelo,
    }),
  suportePersonas: () => pedir<SuportePersonasResp>('/api/suporte-personas'),
  suporteAtendimento: (
    ambiente: string,
    problema: string,
    personaId: string,
    historico: string[],
    provider: string,
    modelo: string
  ) =>
    postJson<SuporteAtendimentoResp>('/api/suporte-atendimento', {
      ambiente,
      problema,
      persona_id: personaId,
      historico,
      provider,
      modelo,
    }),
  comparar: (pergunta: string, modelos: CompararAlvo[]) =>
    postJson<CompararResp>('/api/comparar', { pergunta, modelos }),
  resumirApostila: (file: File, provider: string, modelo: string) => {
    const form = new FormData()
    form.append('file', file)
    form.append('provider', provider)
    form.append('modelo', modelo)
    return pedir<ResumoApostilaResp>('/api/resumir-apostila', { method: 'POST', body: form })
  },
  gerarApostila: (tema: string, formato: 'pdf' | 'docx', provider: string, modelo: string, interesses = '') =>
    baixarArquivo(
      '/api/gerar-apostila',
      { tema, formato, provider, modelo, interesses: interesses.trim() || null },
      `apostila.${formato}`
    ),

  // ── Acesso ao app (modo privado) ─────────────────────────────────────────
  sessao: () => pedir<{ privado: boolean; logado: boolean }>('/api/sessao'),
  sair: () => postJson<{ ok: boolean }>('/api/sessao/sair', {}),

  // ── Rotas de escrita (exigem o token de admin) ───────────────────────────
  adminLogin: (usuario: string, senha: string) =>
    postJson<{ token: string; expira: number; usuario: string }>('/api/admin/login', { usuario, senha }),
  adminVerificar: (token: string) =>
    pedir<{ ok: boolean }>('/api/admin/verificar', { headers: { 'X-Admin-Token': token } }),
  pdfs: (token: string) => pedir<PdfsResp>('/api/pdfs', { headers: { 'X-Admin-Token': token } }),
  previaIngestao: (arquivo: string, token: string) =>
    postJson<PreviaIngestaoResp>('/api/ingerir/previa', { arquivo, offset: 0 }, token),
  ingerir: (arquivo: string, offset: number, token: string, forcar = false, corteId?: number, ultimoId?: number) =>
    postJson<IngerirResp>(
      '/api/ingerir',
      { arquivo, offset, forcar, corte_id: corteId ?? null, ultimo_id: ultimoId ?? null },
      token,
    ),
  upload: (files: File[], token: string, forcar = false) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    form.append('forcar', String(forcar))
    return pedir<UploadResp>('/api/upload', {
      method: 'POST',
      headers: { 'X-Admin-Token': token },
      body: form,
    })
  },

  // Envio direto (arquivos acima do teto da Vercel): pede a URL assinada, manda o
  // arquivo ao Storage sem passar pelo servidor e depois pede a confirmação.
  uploadUrl: (nome: string, tamanho: number, token: string) =>
    postJson<EnvioUrlResp>('/api/upload/url', { nome, tamanho }, token),
  enviarAoStorage: (url: string, file: File) => {
    // Mesmo formato do uploadToSignedUrl do supabase-js.
    const form = new FormData()
    form.append('cacheControl', '3600')
    form.append('', file)
    return pedir<unknown>(url, { method: 'PUT', headers: { 'x-upsert': 'true' }, body: form })
  },
  uploadConfirmar: (caminho: string, token: string, forcar = false) =>
    postJson<UploadResp>('/api/upload/confirmar', { caminho, forcar }, token),
}
