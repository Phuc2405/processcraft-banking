import { tr } from '../../i18n/locale';
import { t } from '../../i18n/t';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { DAY_END, DAY_START, formatClock, PHASES, SPEEDS, speedNameText, type Phase } from '../../sim/clock';
import { eventText } from '../../sim/traffic';
import { SKIP_TARGETS, useBankStore } from '../../store/bankStore';
import { LedgerButton } from './LedgerDrawer';
import { fractionToMinute, keyStep, minuteToFraction, SEGMENT_WIDTH } from './timeline';

const PHASE_STYLE: Record<Phase, { chip: string; bar: string; label: string }> = {
  PRE_OPEN: { chip: 'bg-sky-400/10 text-sky-200 ring-sky-400/30', bar: 'bg-sky-500/40', label: 'Pre-open · systems check' },
  WORKING: { chip: 'bg-lime-400/10 text-lime-200 ring-lime-400/30', bar: 'bg-lime-500/45', label: 'Working hours · live customers' },
  AFTER_HOURS: { chip: 'bg-indigo-400/10 text-indigo-200 ring-indigo-400/30', bar: 'bg-indigo-500/40', label: 'After hours · queues drain' },
  EOD: { chip: 'bg-amber-400/10 text-amber-200 ring-amber-400/30', bar: 'bg-amber-500/50', label: 'EOD night cycle · batch, Visa, reconciliation' },
};

function IconButton({ label, onClick, disabled, children, tone = 'plain', testId }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode; tone?: 'plain' | 'primary'; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      data-testid={testId}
      className={[
        'grid h-9 w-9 place-items-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-35',
        tone === 'primary' ? 'bg-lime-400 text-slate-950 hover:bg-lime-300' : 'bg-slate-800 text-slate-200 hover:bg-slate-700',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

const icon = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'currentColor', 'aria-hidden': true } as const;

/**
 * The 08:00-24:00 bar, and the scrubber on it. Click anywhere on the bar, or drag the thumb, to put the bank at that time:
 * the clock, the queues, the KPIs and the ledger all jump there (backwards replays today from 08:00 with the same customers).
 * While dragging, the thumb and a time label follow the pointer; the bank moves when the pointer is let go. The arrow keys move
 * a quarter of an hour, Page Up and Page Down an hour, Home and End to the ends of the day.
 */
function Timeline({ minute, dayOver }: { minute: number; dayOver: boolean }) {
  const scrubTo = useBankStore((s) => s.scrubTo);
  const bar = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const shown = dayOver ? DAY_END : minute;
  const at = drag ?? shown;
  const x = minuteToFraction(at) * 100;
  const minuteAt = (clientX: number): number => {
    const r = bar.current?.getBoundingClientRect();
    if (!r || r.width === 0) return shown;
    return fractionToMinute((clientX - r.left) / r.width);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.focus();
    setDrag(minuteAt(e.clientX));
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const m = minuteAt(e.clientX);
    if (drag !== null) setDrag(m);
    else setHover(m);
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (drag === null) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const target = minuteAt(e.clientX);
    setDrag(null);
    if (target !== shown) scrubTo(target);
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const next = keyStep(e.key, shown);
    if (next === null) return;
    e.preventDefault();
    if (next !== shown) scrubTo(next);
  };

  const mark = (m: number): string => formatClock(m);
  const tip = drag ?? hover;
  return (
    <div className="min-w-0 flex-1">
      <div
        ref={bar}
        role="slider"
        tabIndex={0}
        aria-label={t('Bank time. Drag or click to jump to a time of day')}
        aria-valuemin={DAY_START}
        aria-valuemax={DAY_END}
        aria-valuenow={shown}
        aria-valuetext={formatClock(shown)}
        title={t('Drag or click to jump the bank to that time. Going back replays today from 08:00 with the same customers.')}
        data-testid="timeline-scrubber"
        data-dragging={drag !== null}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKeyDown}
        className="group relative -my-1.5 cursor-pointer touch-none select-none py-1.5 outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-sky-400/70"
      >
        <div className="relative flex h-3 gap-[3px]">
          {PHASES.map((seg) => (
            <div key={seg.phase} className={`relative h-full overflow-hidden rounded-sm transition-[filter] group-hover:brightness-125 ${PHASE_STYLE[seg.phase].bar}`} style={{ width: `${SEGMENT_WIDTH[seg.phase]}%` }}>
              <div className="absolute inset-y-0 left-0 bg-white/25" style={{ width: at >= seg.to ? '100%' : at <= seg.from ? '0%' : `${((at - seg.from) / (seg.to - seg.from)) * 100}%` }} />
            </div>
          ))}
          {hover !== null && drag === null && <div className="pointer-events-none absolute -top-0.5 bottom-[-2px] w-px -translate-x-1/2 bg-white/50" style={{ left: `${minuteToFraction(hover) * 100}%` }} aria-hidden="true" />}
          {/* the thumb */}
          <div
            className={`pointer-events-none absolute -top-1.5 bottom-[-6px] w-[14px] -translate-x-1/2 ${drag === null ? 'transition-[left] duration-300' : ''}`}
            style={{ left: `${x}%` }}
            data-testid="timeline-thumb"
            aria-hidden="true"
          >
            <div className="mx-auto h-full w-[3px] rounded bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
            <div className={`absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-900 shadow transition-transform ${drag !== null ? 'scale-125' : 'group-hover:scale-110'}`} />
          </div>
          {tip !== null && (
            <div className="pointer-events-none absolute -top-7 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-slate-900 shadow" style={{ left: `${minuteToFraction(tip) * 100}%` }} data-testid="timeline-tip">
              {formatClock(tip)}
            </div>
          )}
        </div>
      </div>
      <div className="relative mt-1 flex h-3 text-[10px] tabular-nums text-slate-500" aria-hidden="true">
        {PHASES.map((seg) => (
          <div key={seg.phase} className="shrink-0" style={{ width: `${SEGMENT_WIDTH[seg.phase]}%` }}>
            {mark(seg.from)}
          </div>
        ))}
        <span className="absolute right-0">{mark(DAY_END)}</span>
      </div>
    </div>
  );
}

const speedName = (index: number): string | undefined => speedNameText(SPEEDS[index]?.name);

const SAVE_COPY = {
  unavailable: { text: 'Not saved: browser blocks storage', dot: 'bg-amber-400' },
  pristine: { text: 'Autosave on', dot: 'bg-slate-500' },
  saved: { text: 'Saved', dot: 'bg-emerald-400' },
  error: { text: 'Could not save', dot: 'bg-rose-400' },
} as const;

function SaveRow() {
  const status = useBankStore((s) => s.saveStatus);
  const resetBank = useBankStore((s) => s.resetBank);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  const copy = SAVE_COPY[status];
  return (
    <div className="flex items-center gap-2 text-[11px] text-slate-400">
      <span className="flex items-center gap-1.5" role="status" data-testid="bank-save-status" data-status={status}>
        <span className={`h-1.5 w-1.5 rounded-full ${copy.dot}`} />
        {t(copy.text)}
      </span>
      <button
        type="button"
        onClick={() => {
          if (armed) {
            setArmed(false);
            resetBank();
          } else setArmed(true);
        }}
        data-testid="bank-reset"
        className={`rounded px-1.5 py-0.5 transition ${armed ? 'bg-rose-500 font-semibold text-white' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'}`}
      >
        {armed ? t('Really start over?') : t('Start over')}
      </button>
    </div>
  );
}

export function ClockBar() {
  const day = useBankStore((s) => s.view.day);
  const minute = useBankStore((s) => s.view.minute);
  const phase = useBankStore((s) => s.view.phase);
  const event = useBankStore((s) => s.view.event);
  const dayOver = useBankStore((s) => s.view.dayOver);
  const playing = useBankStore((s) => s.playing);
  const speedIndex = useBankStore((s) => s.speedIndex);
  const historyCount = useBankStore((s) => s.view.history.length);
  const resetDay = useBankStore((s) => s.resetDay);
  // Nothing to reset until the clock has moved off 07:00, the start of the day.
  const started = useBankStore((s) => s.view.tick > 0 || s.view.minute > DAY_START);
  const toggle = useBankStore((s) => s.toggle);
  const step = useBankStore((s) => s.step);
  const setSpeed = useBankStore((s) => s.setSpeed);
  const skipTo = useBankStore((s) => s.skipTo);
  const jumpToEod = useBankStore((s) => s.jumpToEod);
  const touring = useBankStore((s) => s.spotlight !== null);
  const skipToEndOfDay = useBankStore((s) => s.skipToEndOfDay);
  const startNextDay = useBankStore((s) => s.startNextDay);
  const reopenReport = useBankStore((s) => s.reopenReport);

  const style = PHASE_STYLE[phase];
  const skips: Array<{ id: string; label: string; target: number }> = [
    { id: 'open', label: t('Open 09:00'), target: SKIP_TARGETS.open },
    { id: 'close', label: t('Close 17:00'), target: SKIP_TARGETS.close },
  ];

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-800 bg-slate-950 px-4 py-2.5" data-testid="clock-bar">
      <div className="flex items-center gap-3">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t('Day')}</div>
          <div className="text-[26px] font-black leading-none tracking-tight text-slate-50" data-testid="day-number">
            {day}
          </div>
        </div>
        <div className="h-9 w-px bg-slate-800" />
        <div className="w-[92px]">
          <div className="font-mono text-[28px] font-semibold leading-none tabular-nums text-slate-50" data-testid="clock-time" aria-live="off">
            {formatClock(minute)}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">{t('bank time')}</div>
        </div>
      </div>

      <div className="flex min-w-[280px] flex-1 basis-[300px] flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${style.chip}`} data-testid="phase-label" data-phase={phase}>
            {t(style.label)}
          </span>
          <span
            className={`max-w-full truncate whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${event.id === 'NORMAL' ? 'bg-slate-800/70 text-slate-300 ring-slate-700' : 'bg-fuchsia-400/10 text-fuchsia-200 ring-fuchsia-400/30'}`}
            title={tr({ en: `${eventText(event).blurb} Watch: ${eventText(event).watch}`, vi: `${eventText(event).blurb} Theo dõi: ${eventText(event).watch}` })}
            data-testid="event-pill"
          >
            {eventText(event).title}
          </span>
        </div>
        <Timeline minute={minute} dayOver={dayOver} />
      </div>

      <div className="flex items-center gap-1.5">
        <IconButton label={playing ? t('Pause the bank') : t('Run the bank')} onClick={toggle} disabled={dayOver} tone="primary" testId="bank-play">
          {playing ? (
            <svg {...icon}>
              <rect x="3.5" y="2.5" width="3" height="11" rx="0.8" />
              <rect x="9.5" y="2.5" width="3" height="11" rx="0.8" />
            </svg>
          ) : (
            <svg {...icon}>
              <path d="M4 2.5v11l9-5.5z" />
            </svg>
          )}
        </IconButton>
        <IconButton label={t('Advance one beat')} onClick={step} disabled={dayOver} testId="bank-step">
          <svg {...icon}>
            <path d="M3 2.5v11l7-5.5z" />
            <rect x="11" y="2.5" width="2.2" height="11" rx="0.8" />
          </svg>
        </IconButton>
        <div className="relative ml-1 flex flex-col items-center">
        <div
            className={`ml-1 flex rounded-lg bg-slate-800 p-0.5 ${touring ? 'ring-1 ring-sky-400/40' : ''}`}
            role="group"
            aria-label={t('Speed')}
            title={touring ? t('The speed is locked to 0.25× while a guided tour runs, so nothing moves ahead of the explanation.') : t('How fast the bank day plays. 1× Relaxed is one tick every 1.5 seconds.')}
            data-testid="bank-speeds"
            data-locked={touring}
          >
            {SPEEDS.map((sp, i) => (
              <button
                key={sp.label}
                type="button"
                onClick={() => setSpeed(i)}
                disabled={touring}
                aria-pressed={i === speedIndex}
                aria-label={sp.name ? `${sp.label} ${speedNameText(sp.name)}` : sp.label}
                title={sp.name ? `${sp.label} ${speedNameText(sp.name)}` : undefined}
                data-testid={`bank-speed-${i}`}
                className={`rounded-md px-2 py-1.5 text-[11px] font-semibold tabular-nums transition disabled:cursor-not-allowed ${i === speedIndex ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-100 disabled:opacity-40 disabled:hover:text-slate-400'}`}
              >
                {sp.label}
              </button>
            ))}
          </div>
  
          <span className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-medium uppercase tracking-wide text-slate-500" data-testid="bank-speed-name">
            {speedName(speedIndex) ?? ''}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {skips.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => skipTo(s.target)}
            disabled={dayOver || minute >= s.target}
            data-testid={`bank-skip-${s.id}`}
            title={tr({ en: `Jump the clock forward to ${formatClock(s.target)}`, vi: `Đưa đồng hồ tới ${formatClock(s.target)}` })}
            className="rounded-md bg-slate-800/80 px-2 py-1.5 text-[11px] font-medium text-slate-300 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {s.label}
          </button>
        ))}
        <button
          type="button"
          onClick={jumpToEod}
          disabled={dayOver || minute >= SKIP_TARGETS.night}
          data-testid="bank-jump-eod"
          title={t('Jump the clock to 23:00 and keep playing, to watch the night cycle: batch clearing, Visa settlement, reconciliation')}
          className="rounded-md bg-amber-400/15 px-2 py-1.5 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-400/30 transition hover:bg-amber-400/25 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {t('Jump to EOD (23:00)')}
        </button>
        <button
          type="button"
          onClick={skipToEndOfDay}
          disabled={dayOver}
          data-testid="bank-skip-end"
          title={t('Play the rest of the day at once and see the report')}
          className="rounded-md bg-slate-800/80 px-2 py-1.5 text-[11px] font-medium text-slate-300 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {t('End of day')}
        </button>
      </div>

      <div className="ml-auto flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-1.5">
          <LedgerButton />
          <button
            type="button"
            onClick={resetDay}
            disabled={!started}
            data-testid="bank-reset-day"
            title={tr({ en: `Replay day ${day} from 07:00, as the staff arrive. The same customers arrive, so after changing a rule it shows what that rule does to this very day.`, vi: `Phát lại ngày ${day} từ 07:00, lúc nhân viên đến làm. Cùng các khách hàng sẽ đến, nên sau khi đổi quy tắc bạn thấy quy tắc đó tác động thế nào tới chính ngày này.` })}
            className="rounded-md px-2 py-1.5 text-[11px] font-medium text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {tr({ en: `Reset day ${day}`, vi: `Chạy lại ngày ${day}` })}
          </button>
          {historyCount > 0 && (
            <button type="button" onClick={reopenReport} data-testid="bank-open-report" className="rounded-md px-2 py-1.5 text-[11px] font-medium text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-800">
              {t('Day report')}
            </button>
          )}
          <button
            type="button"
            onClick={startNextDay}
            disabled={!dayOver}
            data-testid="bank-next-day"
            className={`rounded-md px-3 py-1.5 text-[12px] font-bold transition disabled:cursor-not-allowed disabled:opacity-35 ${dayOver ? 'bg-lime-400 text-slate-950 hover:bg-lime-300' : 'bg-slate-800 text-slate-300'}`}
          >
            {tr({ en: `Start day ${day + 1}`, vi: `Bắt đầu ngày ${day + 1}` })}
          </button>
        </div>
        <SaveRow />
      </div>
    </div>
  );
}

