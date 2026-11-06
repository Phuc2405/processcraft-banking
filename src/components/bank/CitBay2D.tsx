import { memo, useState } from 'react';
import { CIT_BAY, PLACE_BOX } from '../../engine/plan/layout';
import { actorStatus } from '../../sim/actorStatus';
import { crewOf, vaultPulseAt, type CrewPoint } from '../../sim/citCrew';
import { citBayRun, citDemoBusy, CIT_STRATEGIES, type CitAccountId, type CitSnapshot } from '../../sim/citEngine';
import { formatMoney } from '../../sim/kpis';
import { activeFlowOf, beatLive, useBankStore } from '../../store/bankStore';
import { CIT_FLOW } from '../../types/viewport';
import { useMessages } from '../../utils/i18nHelper';
import { citMessages } from '../ops/cit.messages';
import { useCit } from '../ops/CitPanel';
import { ActorStatusBadge } from './ActorStatusBadge';
import { StationTooltip } from './StationTooltip';
import { H, Person, W } from './DeskVisitors2D';

/** The loading bay on the map's bottom-right edge, right under the Main Cash Vault: the van, and its crew walking between the van and the vault. */
export { CIT_BAY };

/** The bay card's text rows, px from its top: the header, then the live vault balance on its own line (14 px apart: no overlap). */
export const BAY_ROWS = { header: 7, balance: 24 } as const;
/** The gap between the bay and its hover card, px. */
const BAY_TIP_GAP = 8;

const VAULT = PLACE_BOX.MAIN_CASH_VAULT;
const VAULT_BOTTOM = VAULT.cy + VAULT.h / 2;
const VAN_Y = CIT_BAY.y + 112;
/** The crew's walk on the 2D map: straight up from the van's door to the vault's, the custodian on the left, the guard on the right. */
const WALK = { x: CIT_BAY.x + CIT_BAY.w / 2, van: VAN_Y - 6, vault: VAULT_BOTTOM + H / 2 + 2 } as const;
const LANE = { custodian: -13, guard: 13 } as const;
const ENDPOINTS: ReadonlyArray<{ account: CitAccountId; icon: string }> = [
  { account: 'ATM', icon: '🏧' },
  { account: 'HQ_VAULT', icon: '🏛️' },
  { account: 'SBV', icon: '🏦' },
  { account: 'CORP', icon: '🏬' },
];

export const CitBay2D = memo(function CitBay2D() {
  const select = useBankStore((s) => s.select);
  const cit = useCit();
  // A paused bank still plays the learner's own van (a pause-isolated demo): the bay animates, nothing else does.
  const solo = useBankStore((s) => !s.playing) && citDemoBusy(cit) !== null;
  const live = useBankStore(beatLive) || solo;
  // Highlighted only while Flow 09 (cash in transit) is the lit flow; quiet under every other flow.
  const lit = useBankStore((s) => activeFlowOf(s) === CIT_FLOW);
  return <CitBayView cit={cit} live={live} lit={lit} onOpen={() => select({ kind: 'bay' })} />;
});

/** A crew member on the 2D walk: the same figure and badge as a customer at a counter (DeskVisitors2D, ActorStatusBadge). */
function CrewFigure2D({ role, flow, p }: { role: 'custodian' | 'guard'; flow: 'IN' | 'OUT'; p: CrewPoint }) {
  const y = WALK.van + (WALK.vault - WALK.van) * p.along;
  const status = actorStatus('cit', `${flow}:${p.stage}`);
  return (
    <div
      className="bk-visit-figure pointer-events-none absolute left-0 top-0 z-[23]"
      style={{ transform: `translate(${WALK.x + LANE[role] - W / 2}px, ${y - H / 2}px)`, transition: 'transform 300ms linear' }}
      data-phase={p.walking ? 'walk' : 'transact'}
      data-testid={`cit-crew-${role}`}
      data-stage={p.stage}
      data-carrying={p.carrying}
    >
      <Person shirt={role === 'guard' ? '#1e293b' : '#0e7490'} officer={role === 'guard'} />
      {p.carrying && (
        <span className="absolute -right-2 top-3 text-[12px]" aria-hidden="true">
          💼
        </span>
      )}
      {status && <ActorStatusBadge status={status} />}
    </div>
  );
}

export function CitBayView({ cit, live, lit = false, onOpen }: { cit: CitSnapshot; live: boolean; lit?: boolean; onOpen: () => void }) {
  const m = useMessages(citMessages);
  const run = cit.active?.run ?? null;
  const moving = run && run.status !== 'SETTLED' ? run : null;
  const route = moving ? CIT_STRATEGIES[moving.order.scenario].route(moving.order.direction) : null;
  const other = route ? (route.from === 'VAULT' ? route.to : route.from) : null;
  const atBay = citBayRun(cit) !== null;
  const flow = cit.vaultFlow;
  const crew = cit.bay ? crewOf(cit.bay.flow, cit.bay.u) : null;
  const post = cit.bay ? vaultPulseAt(cit.bay.flow, cit.bay.u) : null;
  // The pointer on the bay opens the same one card as the 3D bay (StationTooltip), to the bay's left: the bay sits on the map's right edge.
  const [hover, setHover] = useState(false);
  return (
    <div data-frozen={!live} data-testid="cit-bay-layer" className="contents">
      {flow && <div aria-hidden="true" className={`pointer-events-none absolute z-[21] rounded-xl ${flow === 'OUT' ? 'bk-vault-out' : 'bk-vault-in'}`} style={{ left: VAULT.cx - VAULT.w / 2 - 4, top: VAULT.cy - VAULT.h / 2 - 4, width: VAULT.w + 8, height: VAULT.h + 8 }} data-testid="cit-vault-pulse" data-flow={flow} />}
      {post && (
        // The vault's own line as the cash crosses its door: gold Dr 1111 in, orange Cr 1111 out.
        <span aria-hidden="true" className={`bk-cit-count pointer-events-none absolute z-[24] rounded-full px-1.5 py-px font-mono text-[10px] font-bold ${post === 'IN' ? 'bg-amber-400/25 text-amber-200 ring-1 ring-amber-300' : 'bg-orange-500/25 text-orange-200 ring-1 ring-orange-400'}`} style={{ left: VAULT.cx + VAULT.w / 2 - 54, top: VAULT.cy - VAULT.h / 2 - 10 }} data-testid="cit-vault-post" data-flow={post}>
          {post === 'IN' ? 'Dr 1111' : 'Cr 1111'}
        </span>
      )}
      <button
        type="button"
        onClick={onOpen}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        aria-label={`${m('bay')}: ${m('bayOpen')}`}
        data-testid="cit-bay"
        data-status={moving?.status ?? 'IDLE'}
        data-lit={lit}
        data-wire-node="BAY"
        className={`absolute z-20 rounded-xl border bg-slate-950/60 text-left transition hover:border-cyan-300 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${lit ? 'border-solid border-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.45)]' : 'border-dashed border-slate-700 opacity-40 grayscale hover:grayscale-0'}`}
        style={{ left: CIT_BAY.x, top: CIT_BAY.y, width: CIT_BAY.w, height: CIT_BAY.h }}
      >
        {/* Header and balance on rows of their own (BAY_ROWS), so the title never runs into the vault's figure. */}
        <span className="absolute inset-x-2 truncate text-[10.5px] font-bold leading-none tracking-wide text-cyan-200" style={{ top: BAY_ROWS.header }} data-testid="cit-bay-title">
          {m('bay')}
        </span>
        <span key={cit.book.VAULT} className="bk-cit-count absolute right-2 font-mono text-[10.5px] font-bold leading-none tabular-nums text-amber-200" style={{ top: BAY_ROWS.balance }} data-testid="cit-vault-counter">
          {formatMoney(cit.book.VAULT)}
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
      {hover && <StationTooltip place="LOADING_BAY" className="pointer-events-none absolute z-50" style={{ left: CIT_BAY.x - BAY_TIP_GAP, top: CIT_BAY.y, transform: 'translateX(-100%)' }} />}
      {cit.bay && crew?.custodian && <CrewFigure2D role="custodian" flow={cit.bay.flow} p={crew.custodian} />}
      {cit.bay && crew?.guard && <CrewFigure2D role="guard" flow={cit.bay.flow} p={crew.guard} />}
    </div>
  );
}
