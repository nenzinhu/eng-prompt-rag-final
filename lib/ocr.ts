'use client'

/**
 * OCR das imagens anexadas — roda no NAVEGADOR, com tesseract.js.
 *
 * Roda no cliente por dois motivos: custa zero (nenhuma API paga, nada de
 * cota) e a imagem nunca sai do computador do aluno. É o caminho que a aba
 * Resolver já usava para um print único; aqui virou módulo reutilizável, com
 * worker reaproveitado entre imagens e pré-processamento da foto.
 *
 * O primeiro reconhecimento baixa o modelo de idioma (~15 MB) do CDN do
 * tesseract e fica cacheado pelo navegador — as leituras seguintes são
 * rápidas. Por isso o worker é mantido vivo entre anexos e só é encerrado
 * depois de um período ocioso (as abas ficam montadas, mesmo invisíveis).
 */

/** Tipos derivados do pacote: o import do tesseract é dinâmico (só ao usar). */
type WorkerTesseract = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>
/**
 * O pacote exporta o tipo do callback de log como opcional, o que impede
 * derivá-lo por `Parameters<>`. O formato é estável e simples, então é
 * declarado aqui: { status, progress } — é o que o logger precisa ler.
 */
type MensagemLog = { status: string; progress: number }

const LARGURA_MAX = 1800 // acima disso o OCR fica lento sem ganhar precisão
const LARGURA_MIN = 700 // print pequeno melhora bastante ao ser ampliado
const OCIOSIDADE_MS = 60_000 // devolve a memória do worker quando a leitura para

let workerPromessa: Promise<WorkerTesseract> | null = null
let reportarProgresso: ((fracao: number) => void) | null = null
let temporizadorOcioso: ReturnType<typeof setTimeout> | null = null
/** Leituras em curso. Enquanto houver alguma, o worker não é encerrado. */
let leiturasEmAndamento = 0

/**
 * Ajusta a imagem antes de entregá-la ao OCR.
 *
 * Duas correções que mudam o resultado na prática:
 * - foto de celular (4000 px de largura) é reduzida — o OCR demora minutos e
 *   não lê melhor por isso;
 * - print pequeno é ampliado com suavização — o pior caso do tesseract é
 *   texto minúsculo.
 *
 * O fundo é pintado de branco de propósito: PNG com transparência é lido como
 * preto pelo tesseract e nenhuma letra é reconhecida.
 */
async function prepararImagem(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const largura = bitmap.width
    let escala = 1
    if (largura > LARGURA_MAX) escala = LARGURA_MAX / largura
    else if (largura < LARGURA_MIN) escala = Math.min(2, LARGURA_MIN / largura)

    const destinoLargura = Math.max(1, Math.round(largura * escala))
    const destinoAltura = Math.max(1, Math.round(bitmap.height * escala))

    const canvas = document.createElement('canvas')
    canvas.width = destinoLargura
    canvas.height = destinoAltura
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('não foi possível preparar a imagem no navegador')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, destinoLargura, destinoAltura)
    ctx.drawImage(bitmap, 0, 0, destinoLargura, destinoAltura)

    const blob = await new Promise<Blob | null>((resolver) => canvas.toBlob(resolver, 'image/png'))
    if (!blob) throw new Error('não foi possível converter a imagem')
    return blob
  } finally {
    bitmap.close()
  }
}

/** Worker único, criado sob demanda. `por+eng` porque o curso usa termos em inglês. */
async function obterWorker(): Promise<WorkerTesseract> {
  if (!workerPromessa) {
    const { createWorker } = await import('tesseract.js')
    workerPromessa = createWorker(['por', 'eng'], 1, {
      logger: (m: MensagemLog) => {
        if (m.status === 'recognizing text' && reportarProgresso) reportarProgresso(m.progress)
      },
    }).catch((e) => {
      workerPromessa = null // permite nova tentativa sem recarregar a página
      throw e
    })
  }
  return workerPromessa
}

function agendarEncerramento() {
  if (temporizadorOcioso) clearTimeout(temporizadorOcioso)
  temporizadorOcioso = setTimeout(() => void encerrarWorker(), OCIOSIDADE_MS)
}

/**
 * Encerra o worker e libera a memória (chamado no desmonte e após ociosidade).
 *
 * O worker é compartilhado por TODOS os `AnexoImagem` montados (é global do
 * módulo). Se um componente desmonta enquanto OUTRO está lendo uma imagem com
 * esse mesmo worker, encerrar agora derrubaria a leitura alheia no meio —
 * `worker.recognize()` levanta erro e o anexo vira "erro" sem causa aparente.
 * Por isso, com leitura em andamento, esta chamada não faz nada: quando a
 * última leitura terminar, `leiturasEmAndamento` chega a zero e o encerramento
 * por ociosidade (`agendarEncerramento`) cuida da limpeza sozinho.
 */
export async function encerrarWorker(): Promise<void> {
  if (leiturasEmAndamento > 0) return
  if (temporizadorOcioso) {
    clearTimeout(temporizadorOcioso)
    temporizadorOcioso = null
  }
  const promessa = workerPromessa
  workerPromessa = null
  if (!promessa) return
  try {
    const worker = await promessa
    await worker.terminate()
  } catch {
    // já encerrado ou nunca inicializado — nada a fazer
  }
}

/**
 * Lê o texto de uma imagem.
 *
 * As chamadas são serializadas pelo componente (uma imagem por vez): o worker
 * do tesseract não aceita dois `recognize` simultâneos, e sequencial preserva a
 * ordem em que as imagens foram anexadas — que é a ordem da questão.
 */
export async function reconhecerImagem(
  file: Blob,
  onProgresso?: (fracao: number) => void
): Promise<string> {
  // Cancela o encerramento por ociosidade ANTES de começar. O temporizador é
  // armado no `finally` da leitura anterior e só era limpo quando outra leitura
  // TERMINAVA: uma leitura iniciada perto do fim da contagem era interrompida no
  // meio por um `terminate()`, e o aluno via erro no anexo sem motivo aparente.
  if (temporizadorOcioso) {
    clearTimeout(temporizadorOcioso)
    temporizadorOcioso = null
  }
  const preparada = await prepararImagem(file)
  const worker = await obterWorker()
  reportarProgresso = onProgresso ?? null
  leiturasEmAndamento += 1
  try {
    const { data } = await worker.recognize(preparada)
    return data.text ?? ''
  } finally {
    leiturasEmAndamento -= 1
    reportarProgresso = null
    // Só começa a contar a ociosidade quando não há mais nada sendo lido.
    if (leiturasEmAndamento === 0) agendarEncerramento()
  }
}
