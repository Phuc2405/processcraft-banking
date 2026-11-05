import { memo } from 'react';
import { cashLinePath, STAGE } from '../../engine/plan/layout';
import { CASH_ENDPOINTS, type CashEndpoint } from '../../sim/topology';
import { vaultPost, type VaultCashFlow } from '../../sim/vaultFlows';
import { useVaultFlows } from './useVaultFlows';

/** One cash run along a line: how long the 💵 takes from end to end, in seconds. */
export const CASH_ICON_SECONDS = 2.4;
/** A till run has no van: the custodian walks the teller line, at a walking pace (slower than the 💵). */
export const CUSTODIAN_WALK_SECONDS = 6;

/** Whether a flow is walked on foot by the vault custodian (a CIT till run), so the 2D line shows them walking it. */
export const walkedOnFoot = (f: VaultCashFlow): boolean => f.endpoint === 'TELLER' && f.source === 'cit';
const TONE = { IN: '#facc15', OUT: '#f97316' } as const;
const ICON: Readonly<Record<CashEndpoint, string>> = { TELLER: '🧑‍💼', ATM: '🏧', BAY: '🚚' };

export const CashLines2D = memo(function CashLines2D() {
  return <CashLinesView flows={useVaultFlows()} />;
});

/**
 * The gold cash lines from the Central Cash Vault to the teller, the ATM and the CIT bay: faint while idle; while cash moves, the
 * line glows (just enough) in its direction's colour and a 💵 glides along it, OUT from the vault (Cr 1111) or IN to it (Dr 1111).
 */
export function CashLinesView({ flows }: { flows: readonly VaultCashFlow[] }) {
  const live = new Map(flows.map((f) => [f.endpoint, f]));
  return (
    <svg className="pointer-events-none absolute inset-0 z-[11]" width={STAGE.width} height={STAGE.height} aria-hidden="true" data-testid="cash-lines">
      {CASH_ENDPOINTS.map((e) => {
        const f = live.get(e);
        const d = cashLinePath(e);
        return (
          <g key={e} data-cash-line={e} data-dir={f?.dir ?? 'idle'}>
            <path d={d} fill="none" stroke={f ? TONE[f.dir] : '#a16207'} strokeOpacity={f ? 0.85 : 0.35} strokeWidth={f ? 2.6 : 1.6} strokeDasharray="6 4" strokeLinejoin="round" style={f ? { filter: `drop-shadow(0 0 4px ${TONE[f.dir]})` } : undefined} />
            {f && (
              <g key={f.id} data-testid={`cash-icon-${e}`} data-dir={f.dir}>
                {/* OUT runs vault → endpoint (the path's own way), IN the other way round. */}
                <animateMotion dur={`${CASH_ICON_SECONDS}s`} repeatCount="indefinite" path={d} keyPoints={f.dir === 'OUT' ? '0;1' : '1;0'} keyTimes="0;1" calcMode="linear" />
                <rect x={-30} y={-9} width={60} height={18} rx={9} fill="#0f172a" stroke={TONE[f.dir]} strokeWidth={1.2} />
                <text x={0} y={4} textAnchor="middle" fontSize={10} fontWeight={700} fill={TONE[f.dir]}>
                  💵 {f.dir === 'OUT' ? '→' : '←'} {ICON[e]}
                </text>
              </g>
            )}
            {f && walkedOnFoot(f) && (
              <g key={`walk-${f.id}`} data-testid="cash-walker-TELLER" data-dir={f.dir}>
                <animateMotion dur={`${CUSTODIAN_WALK_SECONDS}s`} repeatCount="indefinite" path={d} keyPoints={f.dir === 'OUT' ? '0;1' : '1;0'} keyTimes="0;1" calcMode="linear" />
                <circle r={10} cy={-16} fill="#0e7490" stroke="#facc15" strokeWidth={1.2} />
                <text y={-12} textAnchor="middle" fontSize={11}>
                  🚶
                </text>
                <text x={9} y={-6} fontSize={9}>
                  💼
                </text>
              </g>
            )}
          </g>
        );
      })}
      {flows[0] && (
        <text x={1440} y={786} textAnchor="middle" fontSize={10} fontWeight={800} fill={TONE[flows[0].dir]} data-testid="cash-vault-post">
          {vaultPost(flows[0].dir)}
        </text>
      )}
    </svg>
  );
}
