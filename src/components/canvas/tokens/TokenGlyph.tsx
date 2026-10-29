import { t } from '../../../i18n/t';
import type { CardType } from '../../../types/processLearning';
import type { TokenLook } from '../../../store/liveSimulation';

/** The pictures a transaction wears as it moves through the diagram. */

const CARD_COLOR: Record<CardType, { body: string; edge: string; glow: string }> = {
  DEBIT: { body: '#0284c7', edge: '#7dd3fc', glow: 'rgba(56,189,248,0.85)' },
  CREDIT: { body: '#7c3aed', edge: '#c4b5fd', glow: 'rgba(167,139,250,0.85)' },
  PREPAID: { body: '#0d9488', edge: '#5eead4', glow: 'rgba(45,212,191,0.85)' },
  VIRTUAL_DPAN: { body: '#4338ca', edge: '#a5b4fc', glow: 'rgba(129,140,248,0.85)' },
};

const BNPL_COLOR = { lit: '#f0abfc', dim: '#6b21a8', edge: '#e879f9', glow: 'rgba(232,121,249,0.8)' };
const FOLDER_COLOR = { body: '#f59e0b', tab: '#d97706', edge: '#fde68a', glow: 'rgba(251,191,36,0.8)' };
const TRANSFER_COLOR = { body: '#0f766e', edge: '#5eead4', bolt: '#fde047', glow: 'rgba(45,212,191,0.85)' };
const NOTE_COLOR = { body: '#15803d', band: '#86efac', edge: '#bbf7d0', glow: 'rgba(74,222,128,0.8)' };

/** One quarter of a ring, as a path. Angles are in degrees clockwise from twelve o'clock. */
function quarter(index: number, outer: number, inner: number, gap: number): string {
  const rad = (deg: number): number => ((deg - 90) * Math.PI) / 180;
  const a0 = index * 90 + gap;
  const a1 = (index + 1) * 90 - gap;
  const p = (r: number, a: number): string => `${(r * Math.cos(rad(a))).toFixed(2)} ${(r * Math.sin(rad(a))).toFixed(2)}`;
  return `M${p(outer, a0)}A${outer} ${outer} 0 0 1 ${p(outer, a1)}L${p(inner, a1)}A${inner} ${inner} 0 0 0 ${p(inner, a0)}Z`;
}

function glowOf(look: TokenLook): string {
  if (look.kind === 'BNPL') return BNPL_COLOR.glow;
  if (look.kind === 'SETTLEMENT') return FOLDER_COLOR.glow;
  if (look.kind === 'TRANSFER') return TRANSFER_COLOR.glow;
  if (look.kind === 'CASH') return NOTE_COLOR.glow;
  return CARD_COLOR[look.cardType].glow;
}

/** The shape alone, as SVG content to place inside any <svg>. */
export function TokenShape({ look }: { look: TokenLook }) {
  const filter = `drop-shadow(0 0 3.5px ${glowOf(look)})`;

  if (look.kind === 'BNPL') {
    return (
      <g style={{ filter }} data-token-kind="BNPL">
        {[0, 1, 2, 3].map((i) => (
          <path
            key={i}
            d={quarter(i, 12, 4.2, 4)}
            fill={i === 0 ? BNPL_COLOR.lit : BNPL_COLOR.dim}
            stroke={BNPL_COLOR.edge}
            strokeWidth={i === 0 ? 0.9 : 0.6}
            opacity={i === 0 ? 1 : 0.8}
          />
        ))}
        <circle r="3.2" fill="#2e1065" stroke={BNPL_COLOR.edge} strokeWidth="0.6" />
        <text y="1.9" textAnchor="middle" fontSize="5.2" fontWeight="800" fill="#f5d0fe" style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
          4
        </text>
      </g>
    );
  }

  if (look.kind === 'TRANSFER') {
    return (
      <g style={{ filter }} data-token-kind="TRANSFER">
        <rect x="-15" y="-10" width="30" height="20" rx="8" fill={TRANSFER_COLOR.body} stroke={TRANSFER_COLOR.edge} strokeWidth="1" />
        <path d="M2.6 -7.4 L-5.6 1.2 H-0.6 L-2.6 7.6 L6 -1.6 H0.8 Z" fill={TRANSFER_COLOR.bolt} stroke="#a16207" strokeWidth="0.5" strokeLinejoin="round" />
        <path d="M-12 4.5h3.2M9.2 -4.5h3.2" stroke={TRANSFER_COLOR.edge} strokeWidth="1" strokeLinecap="round" />
      </g>
    );
  }

  if (look.kind === 'CASH') {
    return (
      <g style={{ filter }} data-token-kind="CASH">
        <rect x="-15" y="-9" width="30" height="18" rx="2" fill={NOTE_COLOR.body} stroke={NOTE_COLOR.edge} strokeWidth="1" />
        <rect x="-12.2" y="-6.4" width="24.4" height="12.8" rx="1" fill="none" stroke={NOTE_COLOR.band} strokeWidth="0.7" strokeDasharray="2 1.4" />
        <circle r="4.4" fill={NOTE_COLOR.band} stroke={NOTE_COLOR.edge} strokeWidth="0.6" />
        <text y="2.2" textAnchor="middle" fontSize="6.4" fontWeight="800" fill="#14532d" style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
          $
        </text>
      </g>
    );
  }

  if (look.kind === 'SETTLEMENT') {
    return (
      <g style={{ filter }} data-token-kind="SETTLEMENT">
        <path d="M-15 -8.5h9l2.4 2.6H15a1.6 1.6 0 0 1 1.6 1.6V9a1.6 1.6 0 0 1-1.6 1.6h-28.8A1.6 1.6 0 0 1 -15.4 9V-6.9A1.6 1.6 0 0 1 -15 -8.5z" fill={FOLDER_COLOR.tab} />
        <rect x="-11" y="-7.2" width="20" height="10" rx="1" fill="#f8fafc" transform="rotate(-4)" />
        <path d="M-8.5 -4.2h13M-8.5 -1.4h9" stroke="#94a3b8" strokeWidth="1" strokeLinecap="round" transform="rotate(-4)" />
        <path d="M-15.4 -3.2a1.6 1.6 0 0 1 1.6-1.6h28.8a1.6 1.6 0 0 1 1.6 1.6V9a1.6 1.6 0 0 1-1.6 1.6h-28.8A1.6 1.6 0 0 1-15.4 9z" fill={FOLDER_COLOR.body} stroke={FOLDER_COLOR.edge} strokeWidth="0.7" />
      </g>
    );
  }

  const c = CARD_COLOR[look.cardType];
  const virtual = look.cardType === 'VIRTUAL_DPAN';
  return (
    <g style={{ filter }} data-token-kind="CARD">
      <rect x="-15" y="-10" width="30" height="20" rx="3.4" fill={c.body} stroke={c.edge} strokeWidth="1" strokeDasharray={virtual ? '3 1.6' : undefined} />
      <path d="M-15 -3.2h30v3.4h-30z" fill="#0f172a" opacity="0.28" />
      <rect x="-11.5" y="2" width="8.4" height="6.2" rx="1.3" fill="#fcd34d" stroke="#b45309" strokeWidth="0.55" />
      <path d="M-11.5 5.1h8.4M-7.3 2v6.2" stroke="#b45309" strokeWidth="0.5" />
      <g fill="none" stroke={c.edge} strokeWidth="0.9" strokeLinecap="round">
        <path d="M6 4.2a3.3 3.3 0 0 1 0 3.6" />
        <path d="M8.6 2.9a6 6 0 0 1 0 6.2" />
        <path d="M11.2 1.7a8.6 8.6 0 0 1 0 8.8" />
      </g>
      <path d="M-15 -10h30l-14 20h-16z" fill="#fff" opacity="0.07" />
    </g>
  );
}

/** The shape in its own <svg>, for use inside an HTML desk or toolbar. */
export function TokenGlyph({ look, width = 34, className }: { look: TokenLook; width?: number; className?: string }) {
  return (
    <svg
      width={width}
      height={(width * 30) / 40}
      viewBox="-20 -15 40 30"
      className={className}
      role="img"
      aria-label={t(look.label)}
      style={{ overflow: 'visible' }}
    >
      <title>{t(look.label)}</title>
      <TokenShape look={look} />
    </svg>
  );
}
