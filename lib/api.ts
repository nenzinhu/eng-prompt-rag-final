import type {
  AprenderAvaliarResp,
  AprenderExplicarResp,
  NivelAprender,
  StatusResp,
  ConfigResp,
  ProvidersResp,
  BuscarResp,
  PerguntarResp,
  ResolverResp,
  PdfsResp,
  IngerirResp,
  PreviaIngestaoResp,
  UploadResp,
  CompararAlvo,
  CompararResp,
  Evidencia,
  SimplificarResp,
  VerificarResp,
  GlossarioResp,
  TermoGlossario,
  AuditarResp,
  ResumoApostilaResp,
  PerfisComportamentaisResp,
  PerfilComportamentalResp,
  ElencoPersonasResp,
  ElencoConversaResp,
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

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
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

/** Extrai o nome do arquivo do header Content-Disposition, com um padrão de fallback. */
function nomeDoContentDisposition(header: string | null, padrao: string): string {
  const m = header?.match(/filename="?([^"]+)"?/)
  return m ? m[1] : padrao
}

/** Baixa um arquivo binário (POST com corpo JSON, resposta é o arquivo, não JSON). */
async function baixarArquivo(url: string, body: unknown, nomePadrao: string): Promise<void> {
  const r = await fetch(url, {
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
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = nome
  a.click()
  URL.revokeObjectURL(objUrl)
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
): Promise<PerguntarResp> {
  const r = await fetch('/api/perguntar/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pergunta, provider, modelo, persona }),
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
  gerarApostila: (tema: string, formato: 'pdf' | 'docx', provider: string, modelo: string) =>
    baixarArquivo(
      '/api/gerar-apostila',
      { tema, formato, provider, modelo },
      `apostila.${formato}`
    ),

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
}
