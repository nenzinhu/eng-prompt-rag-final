// Gera os ícones do app (favicon, PWA e iPhone) a partir do logo do cabeçalho.
//
//     node scripts/gerar-icones.mjs
//
// O desenho é o mesmo de components/Header.tsx: o prompt ">_" com a estrela, em
// petróleo sobre verde suave. Rodar de novo sobrescreve os arquivos.
import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const LIME = '#c9e8a2'
const HOTPINK = '#8bd5bf'
const TINTA = '#0c1416'

// Os três traços do logo, no viewBox 24×24 do cabeçalho.
const glifo = `
  <path d="M4 6.5 9 12l-5 5.5" stroke="${TINTA}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M12 17.5h8" stroke="${TINTA}" stroke-width="2.2" stroke-linecap="round" fill="none"/>
  <path d="M18.5 3.5l.55 1.45L20.5 5.5l-1.45.55-.55 1.45-.55-1.45L16.5 5.5l1.45-.55.55-1.45Z" fill="${TINTA}"/>`

/**
 * SVG 512×512. `raio` arredonda o fundo (0 = quadrado cheio, para o sistema
 * recortar); `glifoPx` é o tamanho do desenho — menor no maskable, que precisa
 * caber na zona segura de 80% do centro.
 */
function svg({ raio, glifoPx }) {
  const escala = glifoPx / 24
  const desloc = (512 - glifoPx) / 2
  // O desenho ocupa y 3,5–17,5 no viewBox 24: desce 1,5 para ficar no centro.
  const descida = 1.5 * escala
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${LIME}"/>
      <stop offset="1" stop-color="${HOTPINK}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${raio}" fill="url(#g)"/>
  <g transform="translate(${desloc} ${desloc + descida}) scale(${escala})">${glifo}</g>
</svg>`
}

const comum = svg({ raio: 112, glifoPx: 272 })
const cheio = svg({ raio: 0, glifoPx: 272 })
const maskable = svg({ raio: 0, glifoPx: 208 })

const png = (fonte, lado, destino) =>
  sharp(Buffer.from(fonte)).resize(lado, lado).png().toFile(`public/${destino}`)

await writeFile('public/icon.svg', comum)
await Promise.all([
  png(comum, 32, 'favicon-32.png'),
  png(comum, 192, 'icon-192.png'),
  png(comum, 512, 'icon-512.png'),
  png(maskable, 192, 'icon-maskable-192.png'),
  png(maskable, 512, 'icon-maskable-512.png'),
  // O iPhone arredonda sozinho e deixa transparência preta: fundo cheio.
  png(cheio, 180, 'apple-touch-icon.png'),
])
console.log('Ícones gerados em public/')
