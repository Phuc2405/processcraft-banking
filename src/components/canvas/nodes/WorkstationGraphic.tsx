import type { ReactNode } from 'react';
import { tr } from '../../../i18n/locale';
import { t } from '../../../i18n/t';
import type { BankingCapability } from '../../../types/processLearning';
import type { NodeRunStatus } from '../../../store/liveSimulation';
import { CATEGORY_THEME, categoryOf, WORKER_PROFILE, type Accessory } from '../nodeTheme';

/** A banker at a desk, drawn in SVG. */

interface Props {
  capability: BankingCapability;
  status: NodeRunStatus;
  className?: string;
  /** A particular person's looks, in place of the desk's usual one. */
  profile?: { skin: string; hair: string; shirt: string };
}

/** What each desk's monitor shows when it is not busy. Drawn inside a 28x16 box centred at (0,0). */
function ScreenGlyph({ capability, color }: { capability: BankingCapability; color: string }): ReactNode {
  const stroke = { stroke: color, strokeWidth: 1.4, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (capability) {
    case 'TOKEN_VAULT':
      return (
        <g {...stroke}>
          <rect x="-5" y="-1" width="10" height="7" rx="1.5" />
          <path d="M-3 -1v-2.5a3 3 0 0 1 6 0V-1" />
        </g>
      );
    case 'DCVV_VERIFIER':
      return (
        <g fill={color}>
          <circle cx="-7" cy="1" r="1.6" />
          <circle cx="0" cy="1" r="1.6" />
          <circle cx="7" cy="1" r="1.6" />
          <rect x="-9" y="-5" width="18" height="1.6" rx="0.8" opacity="0.5" />
        </g>
      );
    case 'THREE_DS_EVALUATOR':
      return (
        <g {...stroke}>
          <path d="M0 -6l6 2.2v4c0 3.4-2.4 5.6-6 7-3.6-1.4-6-3.6-6-7v-4z" transform="scale(0.8) translate(0 1)" />
          <path d="M-2.5 0.5l2 2 3.5-3.8" />
        </g>
      );
    case 'CORE_LEDGER_CHECK':
      return (
        <g fill={color}>
          <rect x="-9" y="1" width="3.4" height="5" rx="0.6" opacity="0.6" />
          <rect x="-4.2" y="-2.5" width="3.4" height="8.5" rx="0.6" />
          <rect x="0.6" y="-5.5" width="3.4" height="11.5" rx="0.6" opacity="0.8" />
          <rect x="5.4" y="-1" width="3.4" height="7" rx="0.6" opacity="0.6" />
        </g>
      );
    case 'RECON_DESK':
      return (
        <g {...stroke}>
          <circle cx="-3.5" cy="-1.5" r="4" />
          <circle cx="3.5" cy="-1.5" r="4" />
          <circle cx="0" cy="2.5" r="4" />
        </g>
      );
    case 'BNPL_UNDERWRITER':
      return (
        <g fill={color}>
          {[-9, -3, 3, 9].map((x) => (
            <circle key={x} cx={x} cy="0.5" r="2.6" opacity={x === -9 ? 1 : 0.45} />
          ))}
        </g>
      );
    case 'A2A_GATEWAY':
      // Two banks and a message crossing between them.
      return (
        <g {...stroke}>
          <rect x="-11" y="-3" width="5" height="8" rx="1" />
          <rect x="6" y="-3" width="5" height="8" rx="1" />
          <path d="M-5 1h8M0.5 -2l3 3-3 3" />
        </g>
      );
    case 'AML_SCREENING':
      // A magnifier over a list of names.
      return (
        <g {...stroke}>
          <circle cx="-2" cy="-1" r="4.5" />
          <path d="M1.5 2.5L6 7" />
          <path d="M-5 -1h6" opacity="0.6" />
        </g>
      );
    case 'CASE_INVESTIGATION':
      // A case folder.
      return (
        <g {...stroke}>
          <path d="M-8 -4h5l2 2.2h9v8.3h-16z" />
          <path d="M-4 3h8" opacity="0.6" />
        </g>
      );
    case 'CHARGEBACK_DESK':
      // Money turning back.
      return (
        <g {...stroke}>
          <path d="M-6 -3h8a4.5 4.5 0 0 1 0 9h-3" />
          <path d="M-3 -6.5l-3 3.5 3 3.5" />
        </g>
      );
  }
}

function AccessoryLayer({ accessory }: { accessory: Accessory }): ReactNode {
  switch (accessory) {
    case 'glasses':
      return (
        <g fill="none" stroke="#0f172a" strokeWidth="1.1">
          <circle cx="31" cy="22.5" r="2.6" />
          <circle cx="37" cy="22.5" r="2.6" />
          <path d="M33.6 22.5h0.8" />
        </g>
      );
    case 'tie':
      return <path d="M34 35.5l-1.8 3.5 1.8 6 1.8-6z" fill="#fde68a" />;
    case 'headset':
      return (
        <g fill="none" stroke="#0f172a" strokeWidth="1.4" strokeLinecap="round">
          <path d="M26 22a8 8 0 0 1 16 0" />
          <path d="M26 22v3" />
          <path d="M26 25.5q0 3 4 3" />
        </g>
      );
    case 'badge':
      return <rect x="38" y="38" width="5" height="6.5" rx="1" fill="#f8fafc" stroke="#0f172a" strokeWidth="0.8" />;
  }
}

export function WorkstationGraphic({ capability, status, className, profile }: Props) {
  const worker = profile ? { ...WORKER_PROFILE[capability], ...profile } : WORKER_PROFILE[capability];
  const accent = CATEGORY_THEME[categoryOf({ type: 'TASK', bankingCapability: capability })].accent;

  const busy = status === 'PROCESSING';
  const screenColor =
    status === 'FROZEN'
      ? '#7dd3fc'
      : status === 'FAULTED'
        ? '#fb7185'
        : status === 'WAITING'
          ? '#fb923c'
          : status === 'DONE'
            ? '#34d399'
            : busy
              ? '#fbbf24'
              : accent;
  const screenFill = status === 'FROZEN' ? '#082f49' : status === 'FAULTED' ? '#4c0519' : busy ? '#422006' : '#0b1220';

  return (
    <svg
      viewBox="0 0 96 72"
      className={className}
      role="img"
      aria-label={tr({ en: `${worker.role} at the ${worker.desk}. Status: ${status.toLowerCase()}`, vi: `${t(worker.role)} tại ${t(worker.desk)}. Trạng thái: ${status.toLowerCase()}` })}
    >
      <title>{`${t(worker.role)}: ${t(worker.desk)}`}</title>
      {/* floor shadow */}
      <ellipse cx="48" cy="66" rx="40" ry="4" fill="#020617" opacity="0.55" />

      {/* person: shakes if the desk is stuck */}
      <g className={status === 'FAULTED' ? 'pc-shake' : undefined}>
        {/* torso */}
        <path d="M20 52 Q20 34 34 34 Q48 34 48 52 Z" fill={worker.shirt} />
        <path d="M34 34 l-3.5 4 3.5 5 3.5-5z" fill="#f8fafc" opacity="0.9" />
        {/* neck + head */}
        <rect x="31.5" y="29" width="5" height="6" rx="2" fill={worker.skin} />
        <circle cx="34" cy="23" r="8.5" fill={worker.skin} />
        {/* hair */}
        <path d="M25.5 22.5 Q25 13.5 34 13.5 Q43 13.5 42.5 22.5 Q39 17.5 34 17.8 Q29 17.5 25.5 22.5Z" fill={worker.hair} />
        {/* eyes */}
        <circle cx="31" cy="23" r="0.9" fill="#0f172a" />
        <circle cx="37" cy="23" r="0.9" fill="#0f172a" />
        <path d="M31.5 27 q2.5 1.6 5 0" stroke="#0f172a" strokeWidth="0.9" fill="none" strokeLinecap="round" />
        <AccessoryLayer accessory={worker.accessory} />
      </g>

      {/* desk */}
      <rect x="6" y="50" width="84" height="9" rx="2.5" fill="#1e293b" stroke={accent} strokeOpacity="0.35" />
      <rect x="12" y="59" width="4" height="7" fill="#0f172a" />
      <rect x="80" y="59" width="4" height="7" fill="#0f172a" />

      {/* hands on the keyboard: they type while the desk is busy */}
      <rect x="44" y="47.5" width="22" height="3" rx="1.2" fill="#334155" />
      <circle cx="48" cy="46.5" r="2.6" fill={worker.skin} className={busy ? 'pc-type-a' : undefined} />
      <circle cx="56" cy="46.5" r="2.6" fill={worker.skin} className={busy ? 'pc-type-b' : undefined} />

      {/* monitor */}
      <rect x="66" y="20" width="26" height="22" rx="2.5" fill="#0f172a" stroke={screenColor} strokeWidth="1.4" />
      <rect x="68" y="22" width="22" height="18" rx="1.5" fill={screenFill} />
      <rect x="76" y="42" width="6" height="5" fill="#0f172a" />
      <rect x="72" y="46.5" width="14" height="3" rx="1.2" fill="#0f172a" />

      {/* screen content */}
      <g transform="translate(79 31)" className={status === 'WAITING' ? 'pc-pulse' : undefined}>
        {status === 'FROZEN' ? (
          <g stroke="#7dd3fc" strokeWidth="1.5" strokeLinecap="round" fill="none">
            {[0, 60, 120].map((a) => (
              <path key={a} d="M0 -5.5V5.5" transform={`rotate(${a})`} />
            ))}
          </g>
        ) : status === 'FAULTED' ? (
          <g stroke="#fb7185" strokeWidth="2" strokeLinecap="round">
            <path d="M0 -5v5" />
            <path d="M0 4h0.01" />
          </g>
        ) : status === 'DONE' ? (
          <path d="M-5 0.5l3.5 3.5 7-8" stroke="#34d399" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <g transform="scale(0.72)">
            <ScreenGlyph capability={capability} color={screenColor} />
          </g>
        )}
      </g>
      {busy && (
        <g clipPath="url(#pc-screen-clip)">
          <rect x="68" y="22" width="22" height="2.2" fill="#fbbf24" opacity="0.55" className="pc-scan" />
        </g>
      )}
      <defs>
        <clipPath id="pc-screen-clip">
          <rect x="68" y="22" width="22" height="18" rx="1.5" />
        </clipPath>
      </defs>
    </svg>
  );
}

// Start-event customer

/** A customer holding up a card: the "payment arrives" picture on the Start event. */
export function CustomerGraphic({ active, className }: { active: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={t('A customer presenting a card')}>
      <title>{t('Customer presenting a card')}</title>
      <ellipse cx="32" cy="58" rx="22" ry="3.5" fill="#020617" opacity="0.5" />
      <path d="M12 56 Q12 36 28 36 Q44 36 44 56 Z" fill="#65a30d" />
      <rect x="25" y="30" width="6" height="7" rx="2.5" fill="#e0ac86" />
      <circle cx="28" cy="24" r="9" fill="#e0ac86" />
      <path d="M19 23 Q18 13 28 13 Q38 13 37 23 Q33 18 28 18.5 Q23 18 19 23Z" fill="#3b2f2f" />
      <circle cx="25" cy="24" r="1" fill="#0f172a" />
      <circle cx="31" cy="24" r="1" fill="#0f172a" />
      <path d="M25.5 28.5 q2.5 1.8 5 0" stroke="#0f172a" strokeWidth="1" fill="none" strokeLinecap="round" />
      <g className={active ? 'pc-card-tap' : undefined}>
        <rect x="38" y="30" width="20" height="13" rx="2.2" fill="#0f172a" stroke="#a3e635" strokeWidth="1.4" />
        <rect x="38" y="33.5" width="20" height="3" fill="#a3e635" opacity="0.7" />
        <rect x="41" y="39" width="7" height="1.8" rx="0.9" fill="#a3e635" opacity="0.6" />
      </g>
    </svg>
  );
}
