import { useEffect, useState, type ReactNode } from 'react';
import { modeHint, modeLabel, TERM_MODES, type TermMode } from '../../sim/terms';
import type { ViewMode } from '../../store/bankPersistence';
import { useBankStore } from '../../store/bankStore';
import { webglAvailable } from './office/webgl';

/**
 * The switches in the header of the Living Bank (the Academy button that opens the Course Catalog is in CourseCatalog.tsx):
 *   Mode              Fintech Expert | Concept Explorer
 *   View              2D Blueprint Flow | 3D Isometric Office
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

/** 2D Blueprint Flow | 3D Isometric Office. The 3D office needs WebGL; without it the switch says so and stays on 2D. */
export function ViewToggle() {
  const view = useBankStore((s) => s.viewMode);
  const setView = useBankStore((s) => s.setViewMode);
  const [noWebgl, setNoWebgl] = useState(false);
  useEffect(() => {
    if (view === '3d' && !webglAvailable()) setNoWebgl(true);
  }, [view]);
  const choose = (v: ViewMode): void => {
    if (v === '3d' && !webglAvailable()) {
      setNoWebgl(true);
      return;
    }
    setNoWebgl(false);
    setView(v);
  };
  return (
    <div className="relative">
      <Segmented<ViewMode>
        label="View"
        testPrefix="view"
        value={view}
        onChange={choose}
        options={[
          { id: '2d', text: <><span className="xl:hidden">2D Flow</span><span className="hidden xl:inline">2D Blueprint Flow</span></>, title: 'The flat map of departments and wires', aria: '2D Blueprint Flow' },
          { id: '3d', text: <><span className="xl:hidden">3D Office</span><span className="hidden xl:inline">3D Isometric Office</span></>, title: 'The same bank as an isometric office: desks, staff and customers', aria: '3D Isometric Office' },
        ]}
      />
      {noWebgl && (
        <p role="alert" className="absolute right-0 top-full z-50 mt-1.5 w-[250px] rounded-lg border border-amber-400/40 bg-amber-950/95 px-3 py-2 text-[12px] leading-snug text-amber-100 shadow-xl" data-testid="view-no-webgl">
          This browser cannot draw 3D (WebGL is off). The 2D map shows exactly the same bank.
        </p>
      )}
    </div>
  );
}
