import type { ReactNode } from 'react';
import { modeHint, modeLabel, TERM_MODES, type TermMode } from '../../sim/terms';
import { useBankStore } from '../../store/bankStore';

/**
 * The vocabulary switch in the header of the Build Lab: Fintech Expert | Concept Explorer. (In the Living Bank the same
 * setting is the Standard | Expert data depth of the viewport dock, see ViewportControls.tsx.)
 */

function Segmented<T extends string>({ label, options, value, onChange, testPrefix }: { label: string; options: Array<{ id: T; text: ReactNode; title: string; aria: string }>; value: T; onChange: (v: T) => void; testPrefix: string }) {
  return (
    <div className="flex rounded-lg bg-slate-900 p-0.5 ring-1 ring-slate-800" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          aria-label={o.aria}
          title={o.title}
          data-testid={`${testPrefix}-${o.id}`}
          className={`rounded-md px-2.5 py-1 text-[12px] font-semibold transition ${value === o.id ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-100'}`}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

const SHORT_MODE: Record<TermMode, string> = { expert: 'Expert', beginner: 'Explorer' };

/** Fintech Expert | Concept Explorer: switches every name, tooltip and inspector panel. */
export function ModeToggle() {
  const mode = useBankStore((s) => s.termMode);
  const setMode = useBankStore((s) => s.setTermMode);
  return (
    <Segmented<TermMode>
      label="Vocabulary"
      testPrefix="mode"
      value={mode}
      onChange={setMode}
      options={TERM_MODES.map((m) => ({
        id: m,
        text: (
          <>
            <span className="xl:hidden">{SHORT_MODE[m]}</span>
            <span className="hidden xl:inline">{modeLabel(m)}</span>
          </>
        ),
        title: modeHint(m),
        aria: modeLabel(m),
      }))}
    />
  );
}
