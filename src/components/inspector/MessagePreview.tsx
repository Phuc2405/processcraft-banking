import type { ReactNode } from 'react';

/** Colours the tags of a small XML message so the elements stand out from the values. Reads like an IDE, costs no library. */
function highlight(xml: string): ReactNode[] {
  return xml.split('\n').map((line, i) => {
    const parts = line.split(/(<\/?[A-Za-z0-9:.]+(?:\s+[^>]*)?>)/g);
    return (
      <div key={i} className="whitespace-pre">
        {parts.map((p, j) =>
          p.startsWith('<') ? (
            <span key={j} className="text-sky-300">
              {p}
            </span>
          ) : (
            <span key={j} className="text-amber-200">
              {p}
            </span>
          ),
        )}
      </div>
    );
  });
}

/** An XML message, read-only, in a scrollable box. Used for the pacs.008 a bank-to-bank payment arrives as. */
export function MessagePreview({ title, xml, testId }: { title: string; xml: string; testId?: string }) {
  return (
    <figure className="rounded-md border border-slate-700 bg-slate-950" data-testid={testId ?? 'message-preview'}>
      <figcaption className="border-b border-slate-800 px-2 py-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{title}</figcaption>
      <pre className="overflow-x-auto p-2 font-mono text-[10.5px] leading-[1.45]" tabIndex={0} aria-label={title}>
        <code>{highlight(xml)}</code>
      </pre>
    </figure>
  );
}
