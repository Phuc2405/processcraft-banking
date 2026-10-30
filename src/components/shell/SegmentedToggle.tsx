import type { ReactNode } from 'react';
import { useMessages } from '../../utils/i18nHelper';
import { depthMessages, viewModeMessages } from './viewModeToggle.messages';

/** The colour of the option that is on. */
export type SegmentTone = 'sky' | 'violet' | 'emerald';

const TONE: Record<SegmentTone, string> = {
  sky: 'bg-sky-400 text-slate-950',
  violet: 'bg-violet-500 text-white',
  emerald: 'bg-emerald-400 text-slate-950',
};

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  hint?: string;
  tone?: SegmentTone;
  /** A count or badge after the label, tinted to match the option's state. */
  badge?: ReactNode;
}

/** The one segmented switch of the app ([ A | B ] with a radio per option). */
export function SegmentedToggle<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
  stateKey = 'view',
  title,
  size = 'md',
}: {
  /** The group's accessible name. */
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  testId: string;
  stateKey?: string;
  title?: string;
  /** 'sm': a compact toggle for dense toolbars (dialog headers). */
  size?: 'md' | 'sm';
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-fit shrink-0 rounded-lg border border-slate-700 bg-slate-900 p-0.5" data-testid={testId} {...{ [`data-${stateKey}`]: value }} title={title}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            title={o.hint}
            data-testid={`${testId}-${o.value}`}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-md font-semibold transition ${size === 'sm' ? 'px-2 py-0.5 text-[12px]' : 'px-2.5 py-1 text-[13.5px]'} ${on ? TONE[o.tone ?? 'sky'] : 'text-slate-300 hover:bg-slate-800'}`}
          >
            {o.label}
            {o.badge !== undefined && <span className={`rounded-full font-bold tabular-nums ${size === 'sm' ? 'px-1 text-[11px]' : 'px-1.5 text-[12px]'} ${on ? 'bg-slate-950/20' : 'bg-slate-700 text-slate-200'}`}>{o.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

export type Depth = 'standard' | 'expert';

/** [💡 Standard | </> Expert]: the one terminology switch, drawn the same in the Living Bank header, the guided tour bar, the Academy and the analyst workspace. */
export function DepthToggle({ value, onChange, testId, stateKey = 'depth', caption = false }: { value: Depth; onChange: (depth: Depth) => void; testId: string; stateKey?: string; caption?: boolean }) {
  const m = useMessages(depthMessages);
  return (
    <div className="flex shrink-0 items-center gap-1.5" data-testid={`${testId}-group`}>
      {caption && <span className="whitespace-nowrap text-[12px] font-semibold uppercase tracking-wider text-slate-400">{m('label')}</span>}
      <SegmentedToggle<Depth>
        label={m('label')}
        value={value}
        onChange={onChange}
        testId={testId}
        stateKey={stateKey}
        options={[
          {
            value: 'standard',
            label: (
              <>
                <span aria-hidden="true">💡</span>
                {m('standard')}
              </>
            ),
            hint: m('standardHint'),
            tone: 'sky',
          },
          {
            value: 'expert',
            label: (
              <>
                <span aria-hidden="true" className="font-mono text-[11.5px]">
                  &lt;/&gt;
                </span>
                {m('expert')}
              </>
            ),
            hint: m('expertHint'),
            tone: 'emerald',
          },
        ]}
      />
    </div>
  );
}

export type ViewMode = 'basic' | 'advanced';

/** [🔰 Basic | 🔬 Advanced]: plain words for a beginner, or the exact codes and the deeper detail. */
export function ViewModeToggle({ view, onChange, testId, caption = false, hints, size = 'md' }: { view: ViewMode; onChange: (view: ViewMode) => void; testId: string; caption?: boolean; hints?: Partial<Record<ViewMode, string>>; size?: 'md' | 'sm' }) {
  const m = useMessages(viewModeMessages);
  return (
    <div className="flex shrink-0 items-center gap-1.5" data-testid={`${testId}-group`}>
      {caption && <span className={`whitespace-nowrap font-semibold text-slate-400 ${size === 'sm' ? 'text-[12px]' : 'text-[13px]'}`}>{m('label')}:</span>}
      <SegmentedToggle<ViewMode>
        label={m('label')}
        value={view}
        onChange={onChange}
        testId={testId}
        size={size}
        options={[
          { value: 'basic', label: m('basic'), hint: hints?.basic ?? m('basicHint'), tone: 'sky' },
          { value: 'advanced', label: m('advanced'), hint: hints?.advanced ?? m('advancedHint'), tone: 'violet' },
        ]}
      />
    </div>
  );
}
