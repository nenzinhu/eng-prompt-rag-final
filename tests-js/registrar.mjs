/**
 * Registra o hook de resolução antes dos testes.
 * Usado por: npm run test:js
 */
import { register } from 'node:module'

register('./hooks.mjs', import.meta.url)
