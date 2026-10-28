import type { ReactNode } from 'react';
import { useMessages } from '../../utils/i18nHelper';
import { viewModeMessages } from './viewModeToggle.messages';

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

/**
 * The one segmented switch of the app ([ A | B ] with a radio per option): the Basic / Advanced view, Standard / Expert
 * depth, Select / Pan pointer and the audit scope all draw through it, so they look and behave alike.
 *
 * The group is `testId` and carries `data-<stateKey>` with the value that is on; each option is `${testId}-${value}`.
 */
export function SegmentedToggle<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
  stateKey = 'view',
  title,
}: {
  /** The group's accessible name. */
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  testId: string;
  stateKey?: string;
  title?: string;
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
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition ${on ? TONE[o.tone ?? 'sky'] : 'text-slate-300 hover:bg-slate-800'}`}
          >
            {o.label}
            {o.badge !== undefined && <span className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${on ? 'bg-slate-950/20' : 'bg-slate-700 text-slate-200'}`}>{o.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

export type ViewMode = 'basic' | 'advanced';

/**
 * [🔰 Basic | 🔬 Advanced]: plain words for a beginner, or the exact codes and the deeper detail. Used by the core ledger,
 * the audit report and the Knowledge Base; `hints` lets a screen say what its own Advanced view adds.
 */
export function ViewModeToggle({ view, onChange, testId, caption = false, hints }: { view: ViewMode; onChange: (view: ViewMode) => void; testId: string; caption?: boolean; hints?: Partial<Record<ViewMode, string>> }) {
  const m = useMessages(viewModeMessages);
  return (
    <div className="flex shrink-0 items-center gap-1.5" data-testid={`${testId}-group`}>
      {caption && <span className="whitespace-nowrap text-[11px] font-semibold text-slate-400">{m('label')}:</span>}
      <SegmentedToggle<ViewMode>
        label={m('label')}
        value={view}
        onChange={onChange}
        testId={testId}
        options={[
          { value: 'basic', label: m('basic'), hint: hints?.basic ?? m('basicHint'), tone: 'sky' },
          { value: 'advanced', label: m('advanced'), hint: hints?.advanced ?? m('advancedHint'), tone: 'violet' },
        ]}
      />
    </div>
  );
}
