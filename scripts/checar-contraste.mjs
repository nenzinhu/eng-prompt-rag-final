// Confere o contraste (WCAG) dos pares de cor do visual grafite.
//
//     node scripts/checar-contraste.mjs     (ou: npm run contraste)
//
// Lê as cores direto de tailwind.config.ts e app/globals.css, então mudar um token sem rodar isto
// não passa despercebido. Sai com código 1 se algum par ficar abaixo de 4,5:1.
import { readFile } from 'node:fs/promises'

const MINIMO = 4.5

const fonte = await readFile(new URL('../tailwind.config.ts', import.meta.url), 'utf8')
const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8')

// Fim do degradê do fundo: a última cor do `linear-gradient` do body em globals.css.
const degrade = css.match(/linear-gradient\([^;]*?(#[0-9a-fA-F]{6})\s+100%\)/)
if (!degrade) {
  console.log('?? não achei o fim do linear-gradient em app/globals.css')
  process.exit(1)
}
const FIM_DO_DEGRADE = degrade[1].toLowerCase()
const cores = {}
for (const [, nome, hex] of fonte.matchAll(/^\s*'?([\w-]+)'?:\s*'(#[0-9a-fA-F]{6})'/gm)) {
  cores[nome] = hex
}

function luminancia(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function razao(a, b) {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (claro + 0.05) / (escuro + 0.05)
}

const fundos = {
  topo: cores.topo,
  cartao: cores.cartao,
  'cartao-hover': cores['cartao-hover'],
  campo: cores.campo,
  'fim-do-degrade': FIM_DO_DEGRADE,
}

// [texto, fundo]: texto/suave/apagado em todos os fundos, estados sobre os fundos onde aparecem,
// e a tinta escura do botão primário sobre o fim do degradê.
const pares = []
for (const texto of ['texto', 'texto-suave', 'texto-apagado']) {
  for (const fundo of Object.keys(fundos)) pares.push([texto, cores[texto], fundo, fundos[fundo]])
}
for (const estado of ['erro', 'ok', 'atencao']) {
  for (const fundo of ['topo', 'cartao', 'campo']) pares.push([estado, cores[estado], fundo, fundos[fundo]])
}
pares.push(['topo (tinta do botão)', cores.topo, 'destaque-fim', cores['destaque-fim']])

let falhas = 0
for (const [nomeT, t, nomeF, f] of pares) {
  if (!t || !f) {
    console.log(`?? ${nomeT} sobre ${nomeF}: cor não encontrada em tailwind.config.ts`)
    falhas++
    continue
  }
  const r = razao(t, f)
  const ok = r >= MINIMO
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${r.toFixed(2).padStart(5)}:1  ${nomeT} sobre ${nomeF}`)
}

console.log(falhas ? `\n${falhas} par(es) abaixo de ${MINIMO}:1` : `\nTodos os ${pares.length} pares ≥ ${MINIMO}:1`)
process.exit(falhas ? 1 : 0)
