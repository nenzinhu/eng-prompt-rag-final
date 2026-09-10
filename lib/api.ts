import type {
  StatusResp,
  ProvidersResp,
  BuscarResp,
  PerguntarResp,
  ResolverResp,
  PdfsResp,
  IngerirResp,
  UploadResp,
  CompararAlvo,
  CompararResp,
  Evidencia,
  SimplificarResp,
  VerificarResp,
} from './types'

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await r.json()) as T & { detail?: string }
  if (!r.ok) throw new Error((data as { detail?: string }).detail || 'Erro na requisição')
  return data
}

export const api = {
  status: async (): Promise<StatusResp> => {
    const r = await fetch('/api/status')
    return r.json()
  },
  providers: async (): Promise<ProvidersResp> => {
    const r = await fetch('/api/providers')
    return r.json()
  },
  buscar: (query: string, n = 6) => postJson<BuscarResp>('/api/buscar', { query, n }),
  perguntar: (pergunta: string, provider: string, modelo: string) =>
    postJson<PerguntarResp>('/api/perguntar', { pergunta, provider, modelo }),
  simplificar: (pergunta: string, resposta: string, contexto: Evidencia[], provider: string, modelo: string) =>
    postJson<SimplificarResp>('/api/simplificar', { pergunta, resposta, contexto, provider, modelo }),
  verificar: (pergunta: string, resposta: string, contexto: Evidencia[], provider: string, modelo: string) =>
    postJson<VerificarResp>('/api/verificar', { pergunta, resposta, contexto, provider, modelo }),
  resolver: (texto: string, provider: string, modelo: string) =>
    postJson<ResolverResp>('/api/resolver', { texto, provider, modelo }),
  comparar: (pergunta: string, modelos: CompararAlvo[]) =>
    postJson<CompararResp>('/api/comparar', { pergunta, modelos }),
  pdfs: async (): Promise<PdfsResp> => {
    const r = await fetch('/api/pdfs')
    return r.json()
  },
  ingerir: (arquivo: string, offset: number) =>
    postJson<IngerirResp>('/api/ingerir', { arquivo, offset }),
  upload: async (files: File[]): Promise<UploadResp> => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    const r = await fetch('/api/upload', { method: 'POST', body: form })
    return r.json()
  },
}
