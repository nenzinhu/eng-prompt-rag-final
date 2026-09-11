import type {
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
} from './types'

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

export const api = {
  // ── Leitura pública ──────────────────────────────────────────────────────
  status: () => pedir<StatusResp>('/api/status'),
  config: () => pedir<ConfigResp>('/api/config'),
  providers: () => pedir<ProvidersResp>('/api/providers'),
  buscar: (query: string, n = 6) => postJson<BuscarResp>('/api/buscar', { query, n }),
  perguntar: (pergunta: string, provider: string, modelo: string, persona: 'padrao' | 'professor' = 'padrao') =>
    postJson<PerguntarResp>('/api/perguntar', { pergunta, provider, modelo, persona }),
  simplificar: (pergunta: string, resposta: string, contexto: Evidencia[], provider: string, modelo: string) =>
    postJson<SimplificarResp>('/api/simplificar', { pergunta, resposta, contexto, provider, modelo }),
  verificar: (pergunta: string, resposta: string, contexto: Evidencia[], provider: string, modelo: string) =>
    postJson<VerificarResp>('/api/verificar', { pergunta, resposta, contexto, provider, modelo }),
  resolver: (texto: string, provider: string, modelo: string) =>
    postJson<ResolverResp>('/api/resolver', { texto, provider, modelo }),
  glossario: (tema: string, provider: string, modelo: string) =>
    postJson<GlossarioResp>('/api/glossario', { tema, provider, modelo }),
  /** Auditoria de fidelidade: frase por frase contra o material. */
  auditar: (resposta: string) => postJson<AuditarResp>('/api/auditar', { resposta }),
  glossarioTermosSalvos: (q = '') =>
    pedir<{ termos: TermoGlossario[] }>(`/api/glossario/termos?q=${encodeURIComponent(q)}`),
  comparar: (pergunta: string, modelos: CompararAlvo[]) =>
    postJson<CompararResp>('/api/comparar', { pergunta, modelos }),
  pdfs: () => pedir<PdfsResp>('/api/pdfs'),

  // ── Rotas de escrita (exigem o token de admin) ───────────────────────────
  adminLogin: (usuario: string, senha: string) =>
    postJson<{ token: string; expira: number; usuario: string }>('/api/admin/login', { usuario, senha }),
  adminVerificar: (token: string) =>
    pedir<{ ok: boolean }>('/api/admin/verificar', { headers: { 'X-Admin-Token': token } }),
  previaIngestao: (arquivo: string, token: string) =>
    postJson<PreviaIngestaoResp>('/api/ingerir/previa', { arquivo, offset: 0 }, token),
  ingerir: (arquivo: string, offset: number, token: string, forcar = false) =>
    postJson<IngerirResp>('/api/ingerir', { arquivo, offset, forcar }, token),
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
