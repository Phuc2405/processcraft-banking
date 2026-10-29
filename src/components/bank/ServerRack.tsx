import type { NodeRunStatus } from '../../store/liveSimulation';

const LED: Record<NodeRunStatus, string> = {
  IDLE: '#475569',
  QUEUED: '#38bdf8',
  PROCESSING: '#34d399',
  WAITING: '#fbbf24',
  DONE: '#34d399',
  FAULTED: '#fb7185',
  FROZEN: '#38bdf8',
};

/** The workstation picture of an automated node: a server rack with a bot badge instead of a person at a desk. */
export function ServerRackGraphic({ status, className = '', accent = '#a78bfa' }: { status: NodeRunStatus; className?: string; accent?: string }) {
  const led = LED[status];
  const busy = status === 'PROCESSING';
  return (
    <svg viewBox="0 0 70 52" className={className} role="img" aria-label="Server" data-testid="server-rack" data-status={status}>
      <rect x="14" y="4" width="34" height="44" rx="3" fill="#0f172a" stroke="#475569" strokeWidth="1.2" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(17 ${8 + i * 10})`}>
          <rect width="28" height="7.5" rx="1.4" fill="#1e293b" stroke="#334155" strokeWidth="0.7" />
          <circle cx="4" cy="3.75" r="1.4" fill={led} className={busy ? 'bk-rack-led' : undefined} style={busy ? { animationDelay: `${i * 0.18}s` } : undefined} />
          <circle cx="8" cy="3.75" r="1.1" fill={i % 2 ? led : '#475569'} />
          <path d="M13 2.6h12M13 4.9h9" stroke="#64748b" strokeWidth="0.9" strokeLinecap="round" />
        </g>
      ))}
      {/* Bot badge */}
      <g transform="translate(46 27)">
        <circle r="10" fill="#0b1120" stroke={accent} strokeWidth="1.4" />
        <rect x="-5.5" y="-4" width="11" height="8" rx="2" fill={accent} />
        <circle cx="-2.4" cy="0" r="1.2" fill="#0b1120" />
        <circle cx="2.4" cy="0" r="1.2" fill="#0b1120" />
        <path d="M0-4v-2.6" stroke={accent} strokeWidth="1.2" strokeLinecap="round" />
        <circle cy="-7.2" r="1" fill={accent} />
      </g>
    </svg>
  );
}
