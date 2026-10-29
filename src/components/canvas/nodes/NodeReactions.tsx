import type { CSSProperties } from 'react';
import { alarmText, noteText } from '../../../i18n/notesVi';
import { tr } from '../../../i18n/locale';
import type { DroppedMarker, NodeAlarm, NodeRuntime } from '../../../store/liveSimulation';
import { TokenGlyph } from '../tokens/TokenGlyph';

/** How a desk reacts to what is happening to it. */

export type NodeShape = 'box' | 'pill' | 'diamond';

const DIAMOND_CLIP = 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)';

// Icons

function Warning({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 1.2 11.2 10.4H0.8z" fill="currentColor" />
      <path d="M6 4.4v3M6 8.6v.1" stroke="#fef3c7" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function Snowflake({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-8 -8 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      {[0, 60, 120].map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <path d="M0 -7V7" />
          <path d="M-2 -5L0 -3L2 -5M-2 5L0 3L2 5" />
        </g>
      ))}
    </svg>
  );
}

export function Siren({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11.5V8a4 4 0 0 1 8 0v3.5" fill="currentColor" fillOpacity="0.25" />
      <path d="M2.5 11.5h11v2.5h-11z" fill="currentColor" fillOpacity="0.5" />
      <path d="M8 1v1.4M2.4 3.4l1 1M13.6 3.4l-1 1M1 7.5h1.4M13.6 7.5H15" />
    </svg>
  );
}

// Tokens at the desk

/** The token being worked on (for the working part of the tick) and any tokens waiting here. */
export function TokenDock({ runtime, settles = false, bornHere = false, className = '' }: { runtime: NodeRuntime; settles?: boolean; bornHere?: boolean; className?: string }) {
  const { worked, chips } = runtime;
  if (!worked && chips.length === 0) return null;
  return (
    <div className={`pointer-events-none absolute z-10 flex items-end ${className}`} data-testid="token-dock">
      {worked && (
        <span
          key={`worked-${runtime.workedAtTick}`}
          className={settles ? 'pc-docked' : 'pc-worked'}
          style={settles ? ({ animationDelay: '0ms' } satisfies CSSProperties) : undefined}
          data-testid="worked-token"
          data-token-kind={worked.look.kind}
        >
          <TokenGlyph look={worked.look} width={40} />
        </span>
      )}
      {chips.map((c, i) => (
        <span
          key={c.tokenId}
          className="pc-docked"
          style={{ marginLeft: i > 0 || worked ? -12 : 0, zIndex: 10 - i, ...(bornHere ? { animationDelay: '0ms' } : {}) }}
          data-testid="docked-token"
          data-token-kind={c.look.kind}
        >
          <TokenGlyph look={c.look} width={40} />
        </span>
      ))}
    </div>
  );
}

// Congestion

/** Warning badges stacked like a pile of paperwork, with how many are in line. The caller also shakes the card. */
export function CongestionBadges({ runtime, className = '' }: { runtime: NodeRuntime; className?: string }) {
  const pile = Math.min(runtime.load, 4);
  const capacity = Number.isFinite(runtime.capacity) ? runtime.capacity : runtime.load;
  return (
    <div
      role="status"
      aria-label={tr({ en: `Congested: ${runtime.load} transactions are in line at a desk that handles ${capacity} at a time`, vi: `Nghẽn: ${runtime.load} giao dịch đang xếp hàng ở quầy chỉ xử lý ${capacity} cùng lúc` })}
      title={tr({ en: `${runtime.load} transactions in line. This desk handles ${capacity} at a time.`, vi: `${runtime.load} giao dịch đang xếp hàng. Quầy này xử lý ${capacity} cùng lúc.` })}
      data-testid="congestion"
      className={`pointer-events-none absolute z-20 flex items-center ${className}`}
    >
      <span className="flex items-center">
        {Array.from({ length: pile }, (_, i) => (
          <span
            key={i}
            className="pc-pop grid h-[22px] w-[22px] place-items-center rounded-md bg-amber-400 text-amber-950 shadow-lg ring-2 ring-slate-950"
            style={{ marginLeft: i === 0 ? 0 : -10, zIndex: pile - i, transform: `rotate(${i % 2 ? 7 : -7}deg) translateY(${i * -1.5}px)`, animationDelay: `${i * 60}ms` }}
          >
            <Warning size={13} />
          </span>
        ))}
      </span>
      <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 py-px text-[10px] font-extrabold leading-4 text-amber-950 shadow-lg ring-2 ring-slate-950">
        {runtime.load} in line
      </span>
    </div>
  );
}

// Deadlock

/** Ice over the whole desk, and a badge that says what it is waiting for. */
export function FrostOverlay({ shape, runtime, className = '' }: { shape: NodeShape; runtime: NodeRuntime; className?: string }) {
  const join = runtime.joinWaiting;
  const text = join
    ? tr({ en: `Deadlock: ${join.arrived} of ${join.expected} branches arrived`, vi: `Bế tắc: ${join.arrived}/${join.expected} nhánh đã tới` })
    : tr({ en: 'Deadlock', vi: 'Bế tắc' });
  return (
    <>
      <div
        data-testid="frost"
        aria-hidden="true"
        className={`pc-frost pointer-events-none absolute inset-0 z-10 ${shape === 'box' ? 'rounded-xl' : shape === 'pill' ? 'rounded-full' : ''}`}
        style={shape === 'diamond' ? { clipPath: DIAMOND_CLIP } : undefined}
      >
        <span className="absolute left-[14%] top-[16%] text-sky-100/90"><Snowflake size={13} /></span>
        <span className="absolute bottom-[14%] right-[16%] text-sky-100/80"><Snowflake size={10} /></span>
      </div>
      <div
        role="status"
        data-testid="frost-badge"
        title={runtime.note ? noteText(runtime.note) : text}
        className={`pc-pop pointer-events-none absolute z-20 flex items-center gap-1 whitespace-nowrap rounded-full border border-sky-200/80 bg-sky-950/95 px-2 py-0.5 text-[10.5px] font-semibold text-sky-100 shadow-[0_0_16px_rgba(125,211,252,0.55)] ${className}`}
      >
        <Snowflake size={12} />
        {text}
      </div>
    </>
  );
}

// Alarms

/** A crimson ring around the desk that flashes. */
export function AlarmRing({ alarm, shape }: { alarm: NodeAlarm; shape: NodeShape }) {
  const loud = alarm.kind !== 'RECON_BREAK';
  const className = loud ? 'pc-alarm-ring' : 'pc-alarm-ring pc-alarm-once';
  if (shape === 'diamond') {
    return (
      <svg key={alarm.tick} data-testid="alarm-ring" data-alarm={alarm.kind} aria-hidden="true" viewBox="0 0 108 108" className={`pointer-events-none absolute inset-0 z-10 overflow-visible ${className}`} width="100%" height="100%">
        <polygon points="54,0 108,54 54,108 0,54" fill="none" stroke="#ef4444" strokeWidth="5" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <div
      key={alarm.tick}
      data-testid="alarm-ring"
      data-alarm={alarm.kind}
      aria-hidden="true"
      className={`pointer-events-none absolute -inset-[3px] z-10 border-[3px] border-red-500 ${shape === 'pill' ? 'rounded-full' : 'rounded-[14px]'} ${className}`}
    />
  );
}

export function AlarmBadge({ alarm, className = '' }: { alarm: NodeAlarm; className?: string }) {
  const loud = alarm.kind !== 'RECON_BREAK';
  return (
    <div
      key={alarm.tick}
      role="status"
      data-testid="alarm-badge"
      data-alarm={alarm.kind}
      className={`pc-pop pointer-events-none absolute z-30 flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-bold shadow-lg ${
        loud ? 'border-red-300 bg-red-600 text-white shadow-[0_0_18px_rgba(239,68,68,0.8)]' : 'border-red-400/80 bg-red-950 text-red-100'
      } ${className}`}
    >
      <span className={loud ? 'pc-siren' : ''}><Siren size={13} /></span>
      {alarmText(alarm.text)}
    </div>
  );
}

// Dropped transactions

const STRIPS = 6;
const PAPER = [
  { x: -22, d: 0, r: -24 },
  { x: -12, d: 90, r: 18 },
  { x: -3, d: 40, r: -10 },
  { x: 7, d: 130, r: 28 },
  { x: 16, d: 60, r: -20 },
  { x: 24, d: 110, r: 12 },
] as const;

/** The token falls apart into strips of shredded paper at the desk where it stopped, and a red cross is left on the desk's corner. */
export function DroppedToken({ marker, anchorClass = '-top-8 left-3', crossClass = '-right-3 -top-3' }: { marker: DroppedMarker; anchorClass?: string; crossClass?: string }) {
  return (
    <div key={marker.tick} data-testid="dropped-token" data-token-kind={marker.look.kind} className="pointer-events-none absolute inset-0 z-20">
      {/* the strips start exactly where the desk's token was shown, then fall onto the desk */}
      <div className={`absolute h-[30px] w-[40px] ${anchorClass}`}>
        {Array.from({ length: STRIPS }, (_, i) => (
          <span
            key={i}
            className="pc-shred absolute inset-0"
            style={
              {
                clipPath: `inset(0 ${100 - ((i + 1) * 100) / STRIPS}% 0 ${(i * 100) / STRIPS}%)`,
                ['--dx' as string]: `${(i - 2.5) * 6}px`,
                ['--rot' as string]: `${(i % 2 ? 1 : -1) * (12 + i * 7)}deg`,
                animationDelay: `calc(var(--pc-work, 300ms) + ${i * 45}ms)`,
              } as CSSProperties
            }
          >
            <TokenGlyph look={marker.look} width={40} />
          </span>
        ))}
        {PAPER.map((p, i) => (
          <span
            key={i}
            className="pc-paper absolute left-1/2 top-1/2 h-[10px] w-[3.5px] rounded-[1px] bg-red-500"
            style={{ ['--px' as string]: `${p.x}px`, ['--pr' as string]: `${p.r}deg`, animationDelay: `calc(var(--pc-work, 300ms) + ${p.d}ms)` } as CSSProperties}
          />
        ))}
      </div>
      <span
        className={`pc-cross absolute grid h-6 w-6 place-items-center rounded-full bg-red-600 text-white shadow-[0_0_14px_rgba(239,68,68,0.8)] ring-2 ring-slate-950 ${crossClass}`}
        title={`Dropped: ${marker.reason}`}
        role="img"
        aria-label={tr({ en: `Transaction dropped here: ${marker.reason}`, vi: `Giao dịch bị rơi ở đây: ${marker.reason}` })}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </span>
    </div>
  );
}
