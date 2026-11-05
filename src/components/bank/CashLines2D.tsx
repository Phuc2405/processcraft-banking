import { memo, useMemo } from 'react';
import { CASH_WIRES, litWires, type CashWire } from '../../sim/cashWires';
import { useWireHover } from '../../store/wireHoverStore';
import { activeFlowOf, citChildOf, useBankStore } from '../../store/bankStore';
import { useHopPlayer } from '../../store/hopPlayerStore';
import { CIT_FLOW } from '../../types/viewport';
import { cashWireLabel, cashWirePath, STAGE } from '../../engine/plan/layout';
import { citMessages, WIRE_LABEL } from '../ops/cit.messages';
import { useMessages } from '../../utils/i18nHelper';
import type { CashEndpoint } from '../../sim/topology';
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
  // The lit wires: the active flow's (03 the ATM line, 06 the teller line, 09 the whole network; a picked CIT child only its own),
  // plus every wire of the station under the pointer (sim/cashWires.ts, shared with the 3D office).
  const flow = useBankStore(activeFlowOf);
  const child = useBankStore((s) => (activeFlowOf(s) === CIT_FLOW ? citChildOf(s) : null));
  const hover = useWireHover();
  const route = useMemo(() => litWires(flow, child, hover), [flow, child, hover]);
  // While the hop player shows a CIT run, its own icon carries the cash hop by hop: the lines drop their looping 💵.
  const hop = useHopPlayer((s) => s.session?.kind === 'cit');
  const m = useMessages(citMessages);
  return <CashLinesView flows={useVaultFlows()} route={route} hovered={hover !== null} hopIcon={hop} labels={{ OUT: m(WIRE_LABEL.OUT), IN: m(WIRE_LABEL.IN) }} />;
});

/**
 * The gold cash wires: the Central Cash Vault to the teller, the ATM and the CIT bay, and the bay's handover to the teller. Faint
 * while idle; while cash moves, the line glows (just enough) in its direction's colour and a 💵 glides along it, OUT from the vault
 * (Cr 1111) or IN to it (Dr 1111). A lit wire (its flow is active, or a station it touches is hovered) glows softly; the rest dim.
 */
export function CashLinesView({ flows, route = null, hovered = false, hopIcon = false, labels = DEFAULT_LABELS }: { flows: readonly VaultCashFlow[]; route?: ReadonlySet<CashWire> | null; hovered?: boolean; hopIcon?: boolean; labels?: Readonly<Record<'OUT' | 'IN', string>> }) {
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
                <animateMotion dur={`${CASH_ICON_SECONDS}s`} repeatCount="indefinite" path={d} keyPoints={f.dir === 'OUT' ? '0;1' : '1;0'} keyTimes="0;1" calcMode="linear" />
                <rect x={-30} y={-9} width={60} height={18} rx={9} fill="#0f172a" stroke={TONE[f.dir]} strokeWidth={1.2} />
                <text x={0} y={4} textAnchor="middle" fontSize={10} fontWeight={700} fill={TONE[f.dir]}>
                  💵 {f.dir === 'OUT' ? '→' : '←'} {ICON[f.endpoint]}
                </text>
              </g>
            )}
            {(f || lit) && <WireLabel e={e} dir={f?.dir ?? null} labels={labels} />}
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

/** The labels' fallback when none are passed (a static render): the English copy of cit.messages' wireOut / wireIn. */
const DEFAULT_LABELS = { OUT: 'Outflow ➔', IN: '🡨 Inflow' } as const;

/** The direction chips of a run too short for words: down / up along a vertical wire, right / left along a horizontal one. */
const CHIP = { vertical: { OUT: '▼', IN: '▲', both: '⇅' }, horizontal: { OUT: '▶', IN: '◀', both: '⇄' } } as const;
/** Label text: 9 px bold, about 5.4 px a character; the badge pads it 6 px each side. */
const badgeWidth = (text: string): number => Math.round([...text].length * 5.4 + 12);

/**
 * A wire's direction label, in a padded dark badge centred ON the wire (rotated along a vertical run), so it never reaches a card's
 * header: the live direction in its colour, or (an idle wire of the lit network) both directions, faint. A run too short for words
 * (vault ↔ bay) carries a glowing arrow chip instead.
 */
function WireLabel({ e, dir, labels }: { e: CashWire; dir: 'IN' | 'OUT' | null; labels: Readonly<Record<'OUT' | 'IN', string>> }) {
  const { x, y, vertical, chip } = cashWireLabel(e);
  const tone = dir ? TONE[dir] : '#fde68a';
  const text = chip ? CHIP[vertical ? 'vertical' : 'horizontal'][dir ?? 'both'] : dir ? labels[dir] : `${labels.OUT} · ${labels.IN}`;
  const w = chip ? 16 : badgeWidth(text);
  return (
    <g transform={`translate(${x} ${y})${vertical && !chip ? ' rotate(-90)' : ''}`} data-testid={`cash-wire-label-${e}`} data-dir={dir ?? 'both'} data-chip={chip || undefined} opacity={dir ? 1 : 0.85}>
      <rect x={-w / 2} y={-7.5} width={w} height={15} rx={chip ? 7.5 : 5} fill="#020617" fillOpacity={0.9} stroke={tone} strokeOpacity={0.55} strokeWidth={1} style={chip ? { filter: `drop-shadow(0 0 3px ${tone})` } : undefined} />
      <text y={3.2} textAnchor="middle" fontSize={9} fontWeight={800} fill={tone}>
        {text}
      </text>
    </g>
  );
}
