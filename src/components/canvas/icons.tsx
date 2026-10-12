import type { ReactNode } from 'react';
import type { BankingCapability, NodeType, Outcome } from '../../types/processLearning';

/** 24x24 line icons. Drawn by hand so the project needs no icon package. */
function Svg({ children, size = 16, className }: { children: ReactNode; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

type IconProps = { size?: number; className?: string };

const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);
const MaskedCodeIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="7" width="18" height="10" rx="2" />
    <path d="M7.5 12h.01M12 12h.01M16.5 12h.01" strokeWidth={3} />
  </Svg>
);
const ShieldCheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
    <path d="M9 12l2 2 4-4" />
  </Svg>
);
const BookIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
    <path d="M8 8h7M8 12h7" />
  </Svg>
);
const ThreeWayIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="9.5" r="5" />
    <circle cx="15" cy="9.5" r="5" />
    <circle cx="12" cy="15" r="5" />
  </Svg>
);
const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
);
const CrossIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
const CardIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 10h18M7 15h3" />
  </Svg>
);
const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
const HourglassIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4h10M7 20h10M8 4c0 5 8 5 8 8s-8 3-8 8M16 4c0 5-8 5-8 8" />
  </Svg>
);
const ShieldAlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
    <path d="M12 8.5v4M12 15.5h.01" />
  </Svg>
);

/** Two banks joined by a pipe: money moving account to account. */
const NetworkIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="8" width="6" height="8" rx="1.5" />
    <rect x="15.5" y="8" width="6" height="8" rx="1.5" />
    <path d="M8.5 10.5h7M13.5 8.2l2 2.3-2 2.3M10.5 13.5h5" />
  </Svg>
);
/** A magnifier over a list: the screening against watchlists. */
const ScreeningIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="5.5" />
    <path d="M14.5 14.5L20 20M8 10.5h5M10.5 8v5" />
  </Svg>
);
/** A folder with a tab: the case file an investigator opens. */
const CaseFileIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M8 13h8M8 16h5" />
  </Svg>
);
/** Two arrows turning back: the money going home. */
const ChargebackIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 7H5v4M5 7l2.5 2.2A7 7 0 0 1 19 12" />
    <path d="M15 17h4v-4M19 17l-2.5-2.2A7 7 0 0 1 5 12" />
  </Svg>
);

const CAPABILITY_ICON: Record<BankingCapability, (p: IconProps) => ReactNode> = {
  TOKEN_VAULT: LockIcon,
  DCVV_VERIFIER: MaskedCodeIcon,
  THREE_DS_EVALUATOR: ShieldCheckIcon,
  CORE_LEDGER_CHECK: BookIcon,
  RECON_DESK: ThreeWayIcon,
  BNPL_UNDERWRITER: CalendarIcon,
  A2A_GATEWAY: NetworkIcon,
  AML_SCREENING: ScreeningIcon,
  CASE_INVESTIGATION: CaseFileIcon,
  CHARGEBACK_DESK: ChargebackIcon,
};

const OUTCOME_ICON: Record<Outcome, (p: IconProps) => ReactNode> = {
  APPROVED: CheckIcon,
  DECLINED: CrossIcon,
  ROUTED_TO_SUSPENSE: HourglassIcon,
  CHALLENGE_REQUIRED: ShieldAlertIcon,
};

export function NodeIcon({
  type,
  capability,
  outcome,
  size = 16,
  className,
}: {
  type: NodeType;
  capability: BankingCapability | null;
  outcome?: Outcome;
  size?: number;
  className?: string;
}) {
  const p = { size, ...(className !== undefined ? { className } : {}) };
  if (capability) return <>{CAPABILITY_ICON[capability](p)}</>;
  switch (type) {
    case 'GATEWAY_XOR':
      return <CrossIcon {...p} />;
    case 'GATEWAY_AND':
      return <PlusIcon {...p} />;
    case 'EVENT_START':
      return <CardIcon {...p} />;
    case 'EVENT_END':
      return <>{OUTCOME_ICON[outcome ?? 'DECLINED'](p)}</>;
    case 'TASK':
      return <CardIcon {...p} />;
  }
}
