'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="answer-markdown space-y-3 text-[0.95rem] leading-[1.8] text-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
          h1: ({ children }) => <h3 className="mt-4 text-[1.05rem] font-semibold text-text first:mt-0">{children}</h3>,
          h2: ({ children }) => <h3 className="mt-4 text-[1.02rem] font-semibold text-text first:mt-0">{children}</h3>,
          h3: ({ children }) => <h4 className="mt-3 text-[0.95rem] font-semibold text-text first:mt-0">{children}</h4>,
          strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-cyan underline underline-offset-2 hover:text-violet">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-violet/40 pl-3 text-muted">{children}</blockquote>
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = /language-/.test(className || '')
            if (isBlock) {
              return (
                <code className={`${className ?? ''} block`} {...props}>
                  {children}
                </code>
              )
            }
            return (
              <code className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[0.82em] text-cyan" {...props}>
                {children}
              </code>
            )
          },
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-lg border border-white/[0.08] bg-black/40 p-3.5 font-mono text-[0.8rem] leading-relaxed text-text">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[0.85rem]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-left font-medium">{children}</th>
          ),
          td: ({ children }) => <td className="border border-white/10 px-2.5 py-1.5">{children}</td>,
          hr: () => <hr className="border-white/10" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
