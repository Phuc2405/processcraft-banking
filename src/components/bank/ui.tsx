/**
 * Small pieces the whole Living Bank screen shares: a worker's face, fatigue colours, packet pictures,
 * a sparkline, and the words for things.
 */

import { t } from '../../i18n/t';
import { activeLocale } from '../../i18n/locale';
import type { ReactNode } from 'react';
import type { TokenLook } from '../../store/liveSimulation';
import type { CardType } from '../../types/processLearning';
import type { NodeRunStatus } from '../../store/liveSimulation';
import type { PacketKind, Severity, StationStatus, WorkerProfileSeed } from '../../sim/types';
import { formatClock } from '../../sim/clock';
import { TokenGlyph } from '../canvas/tokens/TokenGlyph';
import { InfoTip } from './InfoTip';

// ─────────────────────────────────────────────────────────────────────────────
// Words
// ─────────────────────────────────────────────────────────────────────────────

/** The label of a kind of payment in the active language. */
export const kindLabel = (kind: PacketKind): string => t(KIND_LABEL[kind]);

/** The label of a desk status in the active language. */
export const statusLabel = (s: StationStatus): string => t(STATUS_LABEL[s]);

export const KIND_LABEL: Record<PacketKind, string> = {
  VIRTUAL: 'Virtual card',
  POS: 'POS swipe',
  ECOM: 'Online card',
  BNPL: 'Pay-in-4',
  A2A: 'Instant transfer',
  ATM: 'ATM withdrawal',
  SETTLEMENT: 'Settlement record',
};

export const STATUS_LABEL: Record<StationStatus, string> = {
  IDLE: 'Idle',
  BUSY: 'Working',
  CONGESTED: 'Queue building',
  ALERT: 'Needs attention',
};

/** The desk status in the vocabulary the workstation drawing already understands. */
export const RUN_STATUS: Record<StationStatus, NodeRunStatus> = {
  IDLE: 'IDLE',
  BUSY: 'PROCESSING',
  CONGESTED: 'WAITING',
  ALERT: 'FAULTED',
};

export const STATUS_TEXT_CLASS: Record<StationStatus, string> = {
  IDLE: 'text-slate-400',
  BUSY: 'text-emerald-300',
  CONGESTED: 'text-amber-300',
  ALERT: 'text-rose-300',
};

export const STATUS_DOT_CLASS: Record<StationStatus, string> = {
  IDLE: 'bg-slate-500',
  BUSY: 'bg-emerald-400',
  CONGESTED: 'bg-amber-400 animate-pulse',
  ALERT: 'bg-rose-500 animate-pulse',
};

export const SEVERITY_TEXT: Record<Severity, string> = {
  info: 'text-slate-300',
  ok: 'text-emerald-300',
  warn: 'text-amber-300',
  crit: 'text-rose-300',
};

export const SEVERITY_DOT: Record<Severity, string> = {
  info: 'bg-slate-500',
  ok: 'bg-emerald-400',
  warn: 'bg-amber-400',
  crit: 'bg-rose-500',
};

export const SEVERITY_BOX: Record<Severity, string> = {
  info: 'border-slate-700 bg-slate-900/70 text-slate-200',
  ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
  warn: 'border-amber-400/35 bg-amber-400/10 text-amber-100',
  crit: 'border-rose-500/40 bg-rose-500/10 text-rose-100',
};

export function lookOfKind(kind: PacketKind, cardType: CardType): TokenLook {
  if (kind === 'SETTLEMENT') return { kind: 'SETTLEMENT', cardType, label: KIND_LABEL.SETTLEMENT };
  if (kind === 'BNPL') return { kind: 'BNPL', cardType, label: KIND_LABEL.BNPL };
  if (kind === 'A2A') return { kind: 'TRANSFER', cardType, label: KIND_LABEL.A2A };
  if (kind === 'ATM') return { kind: 'CASH', cardType, label: KIND_LABEL.ATM };
  return { kind: 'CARD', cardType: kind === 'VIRTUAL' ? 'VIRTUAL_DPAN' : cardType, label: KIND_LABEL[kind] };
}

export function PacketGlyph({ kind, cardType, width = 26 }: { kind: PacketKind; cardType: CardType; width?: number }) {
  return <TokenGlyph look={lookOfKind(kind, cardType)} width={width} />;
}

export const clock = formatClock;

export const waitText = (minutes: number): string => {
  const vi = activeLocale() === 'vi';
  return minutes < 1 ? (vi ? '<1 phút' : '<1 min') : minutes < 60 ? `${Math.round(minutes)} ${vi ? 'phút' : 'min'}` : `${(minutes / 60).toFixed(1)} ${vi ? 'giờ' : 'h'}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Fatigue
// ─────────────────────────────────────────────────────────────────────────────

export interface FatigueLook {
  label: string;
  hex: string;
  text: string;
  bar: string;
}

/** 0 fresh, 100 spent. The bank starts to feel it above 60 (slips and redoes), and is in trouble above 85. */
export function fatigueLook(fatigue: number): FatigueLook {
  if (fatigue >= 85) return { label: t('Exhausted'), hex: '#fb7185', text: 'text-rose-300', bar: 'bg-rose-500' };
  if (fatigue >= 60) return { label: t('Tired'), hex: '#fb923c', text: 'text-orange-300', bar: 'bg-orange-400' };
  if (fatigue >= 35) return { label: t('Warming up'), hex: '#fbbf24', text: 'text-amber-300', bar: 'bg-amber-400' };
  return { label: t('Fresh'), hex: '#34d399', text: 'text-emerald-300', bar: 'bg-emerald-400' };
}

/** The 0–100 strain bar. A human desk reads it as fatigue; an automated node passes its own `look` and `label` (CPU load). */
export function FatigueBar({ fatigue, className = '', look: given, label }: { fatigue: number; className?: string; look?: Pick<FatigueLook, 'bar'>; label?: string }) {
  const look = given ?? fatigueLook(fatigue);
  return (
    <div className={`relative h-1.5 overflow-hidden rounded-full bg-slate-800 ${className}`} role="meter" aria-label={label ?? t('Fatigue')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fatigue)}>
      <div className={`h-full rounded-full transition-[width] duration-500 ${look.bar}`} style={{ width: `${Math.max(2, Math.min(100, fatigue))}%` }} />
      {/* where the slips begin */}
      <div className="absolute inset-y-0 w-px bg-slate-950/70" style={{ left: '60%' }} />
    </div>
  );
}

/** A server thread's face: a rack unit with status lights, ringed in its load colour (dashed when it was scaled out). */
export function MachineFace({ ring, size = 22, temp = false, title }: { ring: string; size?: number; temp?: boolean; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={title ?? 'Server'} data-testid="machine-face" style={{ overflow: 'visible' }}>
      {title && <title>{title}</title>}
      <circle cx="20" cy="20" r="19" fill="#0b1220" stroke={ring} strokeWidth={2.4} strokeDasharray={temp ? '4 3' : undefined} />
      <rect x="10" y="11" width="20" height="7" rx="1.6" fill="#334155" stroke="#64748b" strokeWidth="0.8" />
      <rect x="10" y="21" width="20" height="7" rx="1.6" fill="#334155" stroke="#64748b" strokeWidth="0.8" />
      <circle cx="14" cy="14.5" r="1.3" fill={ring} />
      <circle cx="14" cy="24.5" r="1.3" fill={ring} />
      <path d="M18 14.5h8M18 24.5h8" stroke="#94a3b8" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Faces
// ─────────────────────────────────────────────────────────────────────────────

/** A person, head and shoulders, ringed in their fatigue colour. */
export function WorkerFace({ profile, fatigue, size = 22, temp = false, selected = false, title }: { profile: WorkerProfileSeed; fatigue: number; size?: number; temp?: boolean; selected?: boolean; title?: string }) {
  const look = fatigueLook(fatigue);
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={title ?? 'Worker'} style={{ overflow: 'visible' }}>
      {title && <title>{title}</title>}
      <circle cx="20" cy="20" r="19" fill="#0b1220" stroke={look.hex} strokeWidth={selected ? 3.4 : 2.4} strokeDasharray={temp ? '4 3' : undefined} />
      <clipPath id={`face-${size}`}>
        <circle cx="20" cy="20" r="17" />
      </clipPath>
      <g clipPath={`url(#face-${size})`}>
        <path d="M5 42 Q5 27 20 27 Q35 27 35 42Z" fill={profile.shirt} />
        <rect x="17.4" y="22" width="5.2" height="6" rx="2" fill={profile.skin} />
        <circle cx="20" cy="16.5" r="8" fill={profile.skin} />
        <path d="M11.6 16 Q11 7.6 20 7.6 Q29 7.6 28.4 16 Q25 11.6 20 11.8 Q15 11.6 11.6 16Z" fill={profile.hair} />
        <circle cx="17" cy="17" r="0.95" fill="#0f172a" />
        <circle cx="23" cy="17" r="0.95" fill="#0f172a" />
        <path d="M17.6 20.6 q2.4 1.5 4.8 0" stroke="#0f172a" strokeWidth="0.9" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sparkline
// ─────────────────────────────────────────────────────────────────────────────

export function Sparkline({ values, width = 120, height = 28, color = '#38bdf8', label }: { values: readonly number[]; width?: number; height?: number; color?: string; label: string }) {
  const max = Math.max(4, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`);
  const area = points.length > 1 ? `M0,${height} L${points.join(' L')} L${width},${height}Z` : '';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="overflow-visible">
      <title>{label}</title>
      {area && <path d={area} fill={color} opacity="0.14" />}
      {points.length > 1 && <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />}
      {points.length > 0 && <circle cx={points.length > 1 ? width : 0} cy={Number((points[points.length - 1] ?? `0,${height}`).split(',')[1])} r="2.2" fill={color} />}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout atoms
// ─────────────────────────────────────────────────────────────────────────────

/** A metric tip: the standard definition and, for a hybrid tip, what it means at this desk. */
export interface MetricInfo {
  text: string;
  example?: { title: string; text: string };
  testId?: string;
}

export function Stat({ label, value, tone = 'info', hint, info }: { label: string; value: ReactNode; tone?: Severity; hint?: string; info?: MetricInfo }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-2" title={info ? undefined : hint}>
      <div className="flex items-center text-[10px] font-medium uppercase tracking-wide text-slate-500">
        <span className="min-w-0 truncate">{label}</span>
        {info && <InfoTip label={label} text={info.text} {...(info.example ? { example: info.example } : {})} {...(info.testId ? { testId: info.testId } : {})} />}
      </div>
      <div className={`mt-0.5 text-[15px] font-semibold tabular-nums ${SEVERITY_TEXT[tone]}`}>{value}</div>
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{children}</h3>
      {aside}
    </div>
  );
}
