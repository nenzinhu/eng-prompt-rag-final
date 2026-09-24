'use client'

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { lerCaderno, revisar, salvarCaderno, type ItemCaderno } from '@/lib/caderno'
import { nomeDaApostila } from '@/lib/progresso'
import QuestaoCard from '../QuestaoCard'

/** Caderno de erros: refazer o que errou. Acertou, sai; errou, fica. */
export default function CadernoTab({ ativo, onIr }: { ativo: boolean; onIr: (aba: string) => void }) {
  const [itens, setItens] = useState<ItemCaderno[]>([])
  // Fila fixa durante a revisão: a lista muda a cada resposta, a fila não.
  const [fila, setFila] = useState<ItemCaderno[]>([])
  const [pos, setPos] = useState(0)
  const [respondida, setRespondida] = useState(false)

  useEffect(() => {
    if (ativo) setItens(lerCaderno())
  }, [ativo])

  function atualizar(lista: ItemCaderno[]) {
    salvarCaderno(lista)
    setItens(lista)
  }

  function comecar() {
    setFila(itens)
    setPos(0)
    setRespondida(false)
  }

  const atual = fila[pos]
  const revisando = fila.length > 0 && pos < fila.length

  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono text-[0.7rem] uppercase tracking-wider text-muted">
        O que você errou no Me testa — acerte na revisão e a questão sai do caderno
      </p>

      {!itens.length && !revisando && (
        <div className="glass flex flex-col items-start gap-3 rounded-2xl p-5">
          <p className="text-[0.95rem] text-text">Nenhum erro guardado.</p>
          <p className="text-[0.88rem] text-muted">Quando você errar uma questão no Me testa, ela aparece aqui para revisar.</p>
          <button
            type="button"
            onClick={() => onIr('testar')}
            className="min-h-11 rounded-lg bg-lime px-5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90"
          >
            Ir para o Me testa
          </button>
        </div>
      )}

      {revisando && atual ? (
        <>
          <p className="text-[0.8rem] text-muted">
            Revisão {pos + 1} de {fila.length}
          </p>
          <QuestaoCard
            key={`${atual.id}-${pos}`}
            questao={atual}
            onResponder={(m) => {
              setRespondida(true)
              atualizar(revisar(lerCaderno(), atual.id, m, Date.now()))
            }}
          >
            <button
              type="button"
              disabled={!respondida}
              onClick={() => {
                setPos((p) => p + 1)
                setRespondida(false)
              }}
              className="min-h-11 rounded-lg bg-lime px-5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90"
            >
              {pos + 1 < fila.length ? 'Próxima' : 'Terminar'}
            </button>
          </QuestaoCard>
        </>
      ) : (
        itens.length > 0 && (
          <>
            {fila.length > 0 && (
              <p role="status" className="text-[0.9rem] text-muted">
                Revisão concluída. {itens.length === 1 ? 'Falta 1 questão' : `Faltam ${itens.length} questões`}.
              </p>
            )}
            <button
              type="button"
              onClick={comecar}
              className="min-h-11 self-start rounded-lg bg-lime px-5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90"
            >
              Revisar {itens.length === 1 ? '1 questão' : `${itens.length} questões`}
            </button>
            <ul className="glass flex flex-col divide-y divide-white/[0.06] rounded-2xl">
              {itens.map((i) => (
                <li key={i.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.9rem] leading-snug text-text">{i.pergunta}</p>
                    <p className="mt-1 text-[0.78rem] text-muted">
                      {i.vezes === 1 ? 'errou 1 vez' : `errou ${i.vezes} vezes`}
                      {i.fonte ? ` · ${nomeDaApostila(i.fonte)}${i.pagina ? `, pág. ${i.pagina}` : ''}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Tirar do caderno: ${i.pergunta}`}
                    onClick={() => atualizar(itens.filter((x) => x.id !== i.id))}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.05] hover:text-text"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )
      )}
    </div>
  )
}
