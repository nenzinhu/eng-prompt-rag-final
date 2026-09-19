import { TriangleAlert } from 'lucide-react'

export default function WarnBanner({ confianca }: { confianca: number }) {
  return (
    <div className="aviso-atencao surgir mb-4 flex items-center gap-2 px-3.5 py-2.5 text-[0.85rem]">
      <TriangleAlert className="h-4 w-4 shrink-0 text-atencao" aria-hidden="true" />
      <span>
        Resposta baseada principalmente no conhecimento geral da IA (confiança na apostila:{' '}
        {Math.round(confianca * 100)}%)
      </span>
    </div>
  )
}
