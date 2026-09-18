/**
 * Partes puras da conta do aluno (`lib/conta.ts`): retorno do link do e-mail,
 * leitura do JWT, tradução dos erros do Supabase Auth e prazo de renovação.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { lerRetornoDoLink, mensagemErroAuth, payloadJwt, precisaRenovar } from '../lib/conta'

function jwt(payload: object): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `eyJhbGciOiJIUzI1NiJ9.${b64}.assinatura`
}

test('payloadJwt lê e-mail com acento e base64url sem padding', () => {
  const p = payloadJwt(jwt({ email: 'joão@exemplo.com', exp: 123 }))
  assert.equal(p.email, 'joão@exemplo.com')
  assert.equal(p.exp, 123)
})

test('payloadJwt com token inválido devolve objeto vazio', () => {
  assert.deepEqual(payloadJwt('lixo'), {})
  assert.deepEqual(payloadJwt('a.%%%.c'), {})
})

test('link de confirmação vira sessão com o e-mail do token', () => {
  const token = jwt({ email: 'aluno@exemplo.com', exp: 2000000000 })
  const r = lerRetornoDoLink(
    `#access_token=${token}&expires_at=2000000000&expires_in=3600&refresh_token=rt1&token_type=bearer&type=signup`,
  )
  assert.ok(r && r.tipo === 'sessao')
  assert.equal(r.evento, 'signup')
  assert.equal(r.sessao.email, 'aluno@exemplo.com')
  assert.equal(r.sessao.refresh_token, 'rt1')
  assert.equal(r.sessao.expira_em, 2000000000)
})

test('link vencido vira erro traduzido', () => {
  const r = lerRetornoDoLink('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid')
  assert.ok(r && r.tipo === 'erro')
  assert.equal(r.erro.codigo, 'otp_expired')
  assert.match(r.erro.message, /expirou/)
})

test('hash sem tokens é ignorado', () => {
  assert.equal(lerRetornoDoLink(''), null)
  assert.equal(lerRetornoDoLink('#secao'), null)
})

test('erros do Supabase Auth nos formatos novo e antigo', () => {
  assert.match(mensagemErroAuth({ error_code: 'invalid_credentials', msg: 'x' }, 400).message, /incorretos/)
  assert.match(mensagemErroAuth({ error: 'invalid_grant' }, 400).message, /incorretos/)
  assert.match(mensagemErroAuth({}, 429).message, /Muitas tentativas/)
  assert.equal(mensagemErroAuth({ msg: 'Algo novo' }, 400).message, 'Algo novo')
  assert.equal(mensagemErroAuth(null, 500).message, 'Erro 500 no serviço de contas.')
})

test('renova com 1 minuto de folga', () => {
  const s = { access_token: 'a', refresh_token: 'r', email: '', expira_em: 1000 }
  assert.equal(precisaRenovar(s, 900), false)
  assert.equal(precisaRenovar(s, 950), true)
})
