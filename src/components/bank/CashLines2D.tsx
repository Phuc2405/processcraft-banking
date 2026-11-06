import { memo, useMemo } from 'react';
import { CASH_WIRES, litWires, routeDirs, type CashWire } from '../../sim/cashWires';
import { useWireHover } from '../../store/wireHoverStore';
import { activeFlowOf, citChildOf, useBankStore } from '../../store/bankStore';
import { useHopPlayer } from '../../store/hopPlayerStore';
import { CIT_FLOW } from '../../types/viewport';
import { cashWireLabel, cashWirePath, STAGE, WIRE_BADGE, wireBadgeWidth } from '../../engine/plan/layout';
import { citMessages, wireLabelKey } from '../ops/cit.messages';
import { message, useMessages } from '../../utils/i18nHelper';
import { useCitStore } from '../../store/citStore';
import type { CashEndpoint } from '../../sim/topology';
import { CASH_ICON_SECONDS, CUSTODIAN_WALK_SECONDS, vaultPost, type CashDir, type VaultCashFlow } from '../../sim/vaultFlows';
import { useVaultFlows } from './useVaultFlows';

/** Whether a flow is walked on foot by the vault custodian (a CIT till run), so the 2D line shows them walking it. */
export const walkedOnFoot = (f: VaultCashFlow): boolean => f.endpoint === 'TELLER' && f.source === 'cit';
const TONE = { IN: '#facc15', OUT: '#f97316' } as const;
const ICON: Readonly<Record<CashEndpoint, string>> = { TELLER: '🧑‍💼', ATM: '🏧', BAY: '🚚' };

export const CashLines2D = memo(function CashLines2D() {
  // The lit wires: the active flow's (03 the ATM line, 06 the teller line, 09 the whole network; a picked CIT child only its own),
  // plus every wire of the station under the pointer (sim/cashWires.ts, shared with the 3D office).
  const flow = useBankStore(activeFlowOf);
  const child = useBankStore((s) => (activeFlowOf(s) === CIT_FLOW ? citChildOf(s) : null));
  const hover = useWireHover();
  const route = useMemo(() => litWires(flow, child, hover), [flow, child, hover]);
  // A picked CIT child's wires read its movement ("Xuất quỹ ➔ Hộc ATM"); the SBV child follows the sheet's case toggle.
  const sbv = useCitStore((s) => (s.sbvCase === 'DEPOSIT' ? 'OUT' : 'IN'));
  const dirs = useMemo(() => routeDirs(child, sbv), [child, sbv]);
  // While the hop player shows a CIT run, its own icon carries the cash hop by hop: the lines drop their looping 💵.
  const hop = useHopPlayer((s) => s.session?.kind === 'cit');
  const m = useMessages(citMessages);
  return <CashLinesView flows={useVaultFlows()} route={route} dirs={dirs} hovered={hover !== null} hopIcon={hop} label={(w, d) => m(wireLabelKey(w, d))} />;
});

/**
 * The gold cash wires: the Main Cash Vault to the teller, the ATM and the CIT bay, and the bay's handover to the teller. Faint
 * while idle; while cash moves, the line glows (just enough) in its direction's colour and a 💵 glides along it, OUT from the vault
 * (Cr 1111) or IN to it (Dr 1111). A lit wire (its flow is active, or a station it touches is hovered) glows softly; the rest dim.
 */
export function CashLinesView({ flows, route = null, dirs = {}, hovered = false, hopIcon = false, label = wireText }: { flows: readonly VaultCashFlow[]; route?: ReadonlySet<CashWire> | null; dirs?: Readonly<Partial<Record<CashWire, CashDir>>>; hovered?: boolean; hopIcon?: boolean; label?: WireText }) {
  const live = new Map<CashWire, VaultCashFlow>(flows.map((f) => [f.endpoint, f]));
  return (
    <svg className="pointer-events-none absolute inset-0 z-[11]" width={STAGE.width} height={STAGE.height} aria-hidden="true" data-testid="cash-lines">
      {CASH_WIRES.map((e) => {
        const f = live.get(e);
        const d = cashWirePath(e);
        const lit = route?.has(e) ?? false;
        return (
          <g key={e} data-cash-line={e} data-dir={f?.dir ?? 'idle'} data-route={route ? lit : undefined} opacity={route && !lit ? 0.2 : 1}>
            <path d={d} fill="none" stroke={f ? TONE[f.dir] : lit ? '#facc15' : '#a16207'} strokeOpacity={f ? 0.85 : lit ? 0.7 : 0.35} strokeWidth={f || lit ? 2.6 : 1.6} strokeDasharray="6 4" strokeLinejoin="round" style={f ? { filter: `drop-shadow(0 0 4px ${TONE[f.dir]})` } : lit && hovered ? { filter: 'drop-shadow(0 0 3px #facc15)' } : undefined} />
            {f && !(hopIcon && f.source === 'cit') && (
              <g key={f.id} data-testid={`cash-icon-${e}`} data-dir={f.dir}>
                {/* OUT runs vault → endpoint (the path's own way), IN the other way round. */}
                <animateMotion dur={`${CASH_ICON_SECONDS}s`} repeatCount={f.source === 'retail' ? '1' : 'indefinite'} fill="freeze" path={d} keyPoints={f.dir === 'OUT' ? '0;1' : '1;0'} keyTimes="0;1" calcMode="linear" />
                <rect x={-30} y={-9} width={60} height={18} rx={9} fill="#0f172a" stroke={TONE[f.dir]} strokeWidth={1.2} />
                <text x={0} y={4} textAnchor="middle" fontSize={10} fontWeight={700} fill={TONE[f.dir]}>
                  💵 {f.dir === 'OUT' ? '→' : '←'} {ICON[f.endpoint]}
                </text>
              </g>
            )}
            {(f || lit) && <WireLabel e={e} dir={f?.dir ?? dirs[e] ?? null} live={Boolean(f)} label={label} />}
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

/** A wire's label text: its station-specific copy (cit.messages wire_*), idle or in the direction cash moves. */
type WireText = (w: CashWire, dir: CashDir | null) => string;
const wireText: WireText = (w, dir) => message(citMessages, wireLabelKey(w, dir));

/**
 * A wire's label, in a padded dark badge centred ON the wire (layout.cashWireLabel picks a run long enough for its words, so it never
 * reaches a card's header): the station it serves and, while cash moves (or a picked CIT child will move it), that direction in its
 * colour; idle, both ways, faint gold.
 */
function WireLabel({ e, dir, live, label }: { e: CashWire; dir: CashDir | null; live: boolean; label: WireText }) {
  const text = label(e, dir);
  const w = wireBadgeWidth(text);
  const { x, y, vertical } = cashWireLabel(e, w);
  const tone = dir ? TONE[dir] : '#fde68a';
  return (
    <g transform={`translate(${x} ${y})${vertical ? ' rotate(-90)' : ''}`} data-testid={`cash-wire-label-${e}`} data-dir={dir ?? 'both'} data-live={live || undefined} opacity={dir ? 1 : 0.85}>
      <rect x={-w / 2} y={-WIRE_BADGE.h / 2} width={w} height={WIRE_BADGE.h} rx={5} fill="#020617" fillOpacity={0.92} stroke={tone} strokeOpacity={live ? 0.9 : 0.55} strokeWidth={live ? 1.4 : 1} style={live ? { filter: `drop-shadow(0 0 3px ${tone})` } : undefined} />
      <text y={3.2} textAnchor="middle" fontSize={9} fontWeight={800} fill={tone}>
        {text}
      </text>
    </g>
  );
}
