import { useMemo } from 'react';
import { formatMoney } from '../../sim/kpis';
import { isAutomatedNode, machineWorkerName, NODE_FAMILY, type NodeFamily } from '../../sim/nodeKind';
import type { StationId } from '../../sim/topology';
import { STATIONS } from '../../sim/topology';
import type { WorkerView } from '../../sim/types';
import { useMessages, type Translate } from '../../utils/i18nHelper';
import { nodeMessages } from './inspector.messages';
import { tipMessages } from './inspectorTips.messages';
import type { MetricInfo } from './ui';

type TipKey = Parameters<Translate<keyof typeof tipMessages.messages>>[0];

/** Metrics that carry a desk-specific example in their tip. */
const HYBRID = ['queue', 'errors'] as const;
type HybridMetric = (typeof HYBRID)[number];

export interface LoadLook {
  label: string;
  hex: string;
  text: string;
  bar: string;
}

export interface NodeCopy {
  automated: boolean;
  family: NodeFamily;
  /** The display name of a worker: a cluster or a thread on an automated node, the person's own name on a human desk. */
  workerName(worker: Pick<WorkerView, 'name'>, index: number): string;
  /** The machine's look for a load value (idle → saturated). Human desks keep fatigueLook. */
  loadLook(load: number): LoadLook;
  /** A plain tip. */
  tip(key: TipKey, testId?: string): MetricInfo;
  /** The tip of a desk-specific counter row: its own explanation when it has one (`line_<key>`), the generic one otherwise. */
  lineTip(key: string | undefined): string;
  /** A hybrid tip: the standard definition plus what the metric means at this kind of desk. */
  hybrid(metric: HybridMetric, testId?: string): MetricInfo;
  /** The scale-out button's text for this node and mode. */
  scaleLabel(beginner: boolean, costCents: number): string;
  n: Translate<keyof typeof nodeMessages.messages>;
}

/** Everything the inspector says that depends on whether a node is automated, and on what kind of desk it is. */
export function useNodeCopy(id: StationId): NodeCopy {
  const n = useMessages(nodeMessages);
  const m = useMessages(tipMessages);
  return useMemo<NodeCopy>(() => {
    const automated = isAutomatedNode(id);
    const family = NODE_FAMILY[id];
    return {
      automated,
      family,
      workerName: (worker, index) => {
        if (!automated) return worker.name;
        const w = machineWorkerName(id, index);
        if (w.kind === 'cluster') return n('cluster', { letter: w.letter });
        if (w.kind === 'engine') return n(`engine_${w.engine}`, { n: w.n });
        return n('thread', { n: w.n });
      },
      loadLook: (load) => {
        if (load >= 85) return { label: n('loadSaturated'), hex: '#fb7185', text: 'text-rose-300', bar: 'bg-rose-500' };
        if (load >= 60) return { label: n('loadHigh'), hex: '#fb923c', text: 'text-orange-300', bar: 'bg-orange-400' };
        if (load >= 35) return { label: n('loadNormal'), hex: '#38bdf8', text: 'text-sky-300', bar: 'bg-sky-400' };
        return { label: n('loadIdle'), hex: '#34d399', text: 'text-emerald-300', bar: 'bg-emerald-400' };
      },
      tip: (key, testId) => ({ text: m(key), ...(testId ? { testId } : {}) }),
      lineTip: (key) => (key && `line_${key}` in tipMessages.messages ? m(`line_${key}` as TipKey) : m('lines')),
      hybrid: (metric, testId) => ({ text: m(metric), example: { title: m('atThisDesk'), text: m(`${metric}_${family}` as TipKey) }, ...(testId ? { testId } : {}) }),
      scaleLabel: (beginner, cost) => {
        const values = { cost: formatMoney(cost, true) };
        if (!automated) return n('scaleHuman', values);
        return beginner ? n('scaleBeginner', values) : n('scaleAdvanced', values);
      },
      n,
    };
  }, [id, n, m]);
}

/** True when the engine itself treats the station as a machine (no fatigue, no cover to call): only the ATM today. */
export const selfScaling = (id: StationId): boolean => STATIONS[id].automated === true;
