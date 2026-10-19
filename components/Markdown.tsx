import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders LLM answers. Raw HTML in the source is not rendered (react-markdown's
// default), and unsafe link protocols are stripped by its default urlTransform.
const components: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 pl-5 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 pl-5 list-decimal space-y-1">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
  h1: ({ children }) => <h3 className="mt-3 mb-1 font-semibold text-base">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-3 mb-1 font-semibold text-base">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 mb-1 font-semibold">{children}</h4>,
  h4: ({ children }) => <h4 className="mt-3 mb-1 font-semibold">{children}</h4>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline text-sky-700">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-slate-100 p-2 text-xs">{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-slate-300 pl-3 text-slate-600">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-slate-200" />,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b px-2 py-1 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-slate-100 px-2 py-1 align-top">{children}</td>,
};

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm leading-relaxed break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
