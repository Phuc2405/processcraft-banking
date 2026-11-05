import { memo } from 'react';
import { PLACE_BOX } from '../../engine/plan/layout';
import { CIT_STRATEGIES, type CitAccountId, type CitSnapshot } from '../../sim/citEngine';
import { formatMoney } from '../../sim/kpis';
import { beatLive, useBankStore } from '../../store/bankStore';
import { useMessages } from '../../utils/i18nHelper';
import { citMessages } from '../ops/cit.messages';
import { useCit } from '../ops/CitPanel';

/** The loading bay on the map's bottom-right edge, under the vault: the van, the custodian and the cassettes moving between them. */
export const CIT_BAY = { x: 1336, y: 772, w: 208, h: 216 } as const;

const VAULT = PLACE_BOX.COLLATERAL_VAULT;
const VAULT_BOTTOM = VAULT.cy + VAULT.h / 2;
const VAN_Y = CIT_BAY.y + 148;
const ENDPOINTS: ReadonlyArray<{ account: CitAccountId; icon: string }> = [
  { account: 'ATM', icon: '🏧' },
  { account: 'HQ_VAULT', icon: '🏛️' },
  { account: 'SBV', icon: '🏦' },
  { account: 'CORP', icon: '🏬' },
];

export const CitBay2D = memo(function CitBay2D() {
  const select = useBankStore((s) => s.select);
  return <CitBayView cit={useCit()} live={useBankStore(beatLive)} onOpen={() => select({ kind: 'station', id: 'COLLATERAL_VAULT' })} />;
});

export function CitBayView({ cit, live, onOpen }: { cit: CitSnapshot; live: boolean; onOpen: () => void }) {
  const m = useMessages(citMessages);
  const run = cit.active?.run ?? null;
  const moving = run && run.status !== 'SETTLED' ? run : null;
  const route = moving ? CIT_STRATEGIES[moving.order.scenario].route(moving.order.direction) : null;
  const other = route ? (route.from === 'VAULT' ? route.to : route.from) : null;
  const atBay = !!moving && (cit.vaultFlow !== null || moving.status !== 'EN_ROUTE');
  const flow = cit.vaultFlow;
  return (
    <>
      {flow && <div aria-hidden="true" className={`pointer-events-none absolute z-[21] rounded-xl ${flow === 'OUT' ? 'bk-vault-out' : 'bk-vault-in'}`} style={{ left: VAULT.cx - VAULT.w / 2 - 4, top: VAULT.cy - VAULT.h / 2 - 4, width: VAULT.w + 8, height: VAULT.h + 8 }} data-testid="cit-vault-pulse" data-flow={flow} />}
      <button
        type="button"
        onClick={onOpen}
        title={m('bayHint')}
        aria-label={`${m('bay')}: ${m('bayHint')}`}
        data-testid="cit-bay"
        data-status={moving?.status ?? 'IDLE'}
        className="absolute z-20 rounded-xl border border-dashed border-cyan-400/50 bg-slate-950/60 text-left transition hover:border-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        style={{ left: CIT_BAY.x, top: CIT_BAY.y, width: CIT_BAY.w, height: CIT_BAY.h }}
      >
        <span className="absolute left-2 top-1.5 text-[10.5px] font-bold uppercase tracking-wider text-cyan-200">{m('bay')}</span>
        <span key={cit.book.VAULT} className="bk-cit-count absolute right-2 top-1.5 font-mono text-[10.5px] font-bold tabular-nums text-amber-200" data-testid="cit-vault-counter">
          {formatMoney(cit.book.VAULT)}
        </span>
        <span className="absolute left-1/2 top-[34px] -translate-x-1/2 text-[18px]" aria-hidden="true">
          👮
        </span>
        <span className={`absolute left-1/2 -translate-x-1/2 text-[26px] transition-opacity duration-500 ${atBay ? 'opacity-100' : 'opacity-25'}`} style={{ top: VAN_Y - CIT_BAY.y - 18 }} aria-hidden="true" data-testid="cit-van">
          🚚
        </span>
        {moving && (
          <span className={`absolute left-2 top-[60px] rounded-full px-1.5 py-px text-[9.5px] font-bold ${moving.blocked ? 'bg-rose-500/30 text-rose-100' : 'bg-emerald-500/20 text-emerald-100'}`}>🔐 {moving.order.sealId}</span>
        )}
        <span className="absolute left-2 top-[78px] max-w-[70px] text-[9.5px] font-semibold leading-tight text-slate-300">{moving ? m(`status_${moving.status}`) : m('idle')}</span>
        {flow && <span className={`absolute right-2 top-[60px] max-w-[80px] text-right text-[9.5px] font-bold leading-tight ${flow === 'OUT' ? 'text-orange-300' : 'text-lime-300'}`}>{flow === 'OUT' ? m('outflow') : m('inflow')}</span>}
        <span className="absolute inset-x-2 bottom-1.5 flex justify-between text-[15px]" aria-hidden="true">
          {ENDPOINTS.map((e) => (
            <span key={e.account} className={`rounded px-1 ${other === e.account ? 'bg-cyan-400/25 ring-1 ring-cyan-300' : 'opacity-50'}`} data-endpoint={e.account}>
              {e.icon}
            </span>
          ))}
        </span>
      </button>
      {flow && (
        <div aria-hidden="true" className="pointer-events-none absolute z-[22]" style={{ left: VAULT.cx - 8, top: VAULT_BOTTOM, height: VAN_Y - VAULT_BOTTOM }} data-testid="cit-particles" data-flow={flow}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={`absolute left-0 top-0 text-[14px] ${flow === 'OUT' ? 'bk-cit-down' : 'bk-cit-up'}`} style={{ animationDelay: `${i * 0.6}s`, animationPlayState: live ? 'running' : 'paused', ['--cit-dist' as string]: `${VAN_Y - VAULT_BOTTOM}px` }}>
              💼
            </span>
          ))}
        </div>
      )}
    </>
  );
}
