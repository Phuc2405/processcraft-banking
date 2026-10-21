import { t } from '../../../i18n/t';
import { memo } from 'react';
import { configLabel } from '../../../i18n/catalogVi';
import { labLabel } from '../../../i18n/labText';
import { tr } from '../../../i18n/locale';
import { Position, type NodeProps } from '@xyflow/react';
import type { ProcessFlowNode } from '../../../store/graphConversion';
import { IDLE_RUNTIME, useWorkflowStore } from '../../../store/workflowStore';
import { NodeIcon } from '../icons';
import { CATEGORY_THEME, categoryOf, STATUS_TEXT, WORKER_PROFILE } from '../nodeTheme';
import { AlarmBadge, AlarmRing, CongestionBadges, DroppedToken, TokenDock } from './NodeReactions';
import { PortHandle } from './PortHandle';
import { WorkstationGraphic } from './WorkstationGraphic';

/** Ring and glow that make a busy, stuck or finished desk readable from across the canvas. */
const STATUS_RING = {
  IDLE: 'border-slate-700/80',
  QUEUED: 'border-sky-500/60',
  PROCESSING: 'border-amber-400 shadow-[0_0_24px_-4px_rgba(251,191,36,0.55)]',
  WAITING: 'border-orange-400 shadow-[0_0_24px_-4px_rgba(251,146,60,0.5)]',
  DONE: 'border-emerald-400/80',
  FAULTED: 'border-rose-500 shadow-[0_0_24px_-4px_rgba(244,63,94,0.55)]',
  FROZEN: 'border-sky-200 shadow-[0_0_26px_-4px_rgba(125,211,252,0.7)]',
} as const;

/** An alarm outranks whatever else the desk is doing: the border goes emergency crimson. */
const ALARM_RING = 'border-red-600 shadow-[0_0_28px_-3px_rgba(220,38,38,0.75)]';

function TaskNodeView({ id, data, selected }: NodeProps<ProcessFlowNode>) {
  const node = data.node;
  const runtime = useWorkflowStore((s) => s.nodeRuntime[id] ?? IDLE_RUNTIME);
  const definition = useWorkflowStore((s) => s.catalog.find((d) => d.id === node.definitionId));

  const category = CATEGORY_THEME[categoryOf(node)];
  const capability = node.bankingCapability;
  const worker = capability ? WORKER_PROFILE[capability] : null;
  const status = STATUS_TEXT[runtime.status];

  const flowOut = node.outputPorts.filter((p) => p.role === 'FLOW');
  const errorOut = node.outputPorts.filter((p) => p.role === 'ERROR');
  const spread = (i: number, n: number): string => `${((i + 1) / (n + 1)) * 100}%`;

  const settings = (definition?.configSchema ?? []).slice(0, 3).map((c) => ({
    key: c.key,
    text: `${configLabel(c.key, c.label)}: ${String(node.configParams[c.key] ?? c.defaultValue)}`,
  }));

  return (
    <div
      className={[
        'relative w-[236px] rounded-xl border-2 bg-slate-900/95 text-slate-100 shadow-xl transition-shadow',
        runtime.alarm ? ALARM_RING : STATUS_RING[runtime.status],
        runtime.congested ? 'pc-shake-card' : '',
        selected ? 'outline outline-2 outline-offset-2 outline-sky-400' : '',
      ].join(' ')}
      data-testid={`task-${id}`}
      data-run-status={runtime.status}
    >
      {/* header */}
      <header className="flex items-center gap-2 border-b border-slate-700/60 px-3 py-2">
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md"
          style={{ background: `${category.accent}22`, color: category.accent }}
        >
          <NodeIcon type={node.type} capability={capability} size={15} />
        </span>
        <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight" title={labLabel(node.label)}>
          {labLabel(node.label)}
        </h3>
      </header>

      {/* body: the person at their desk, and what they are doing */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        {capability && (
          <div className="relative h-[62px] w-[82px] shrink-0">
            {/* the avatar pulses once per tick of work; the ring is keyed by the tick so every piece of work restarts it */}
            {runtime.status === 'PROCESSING' && <span key={`ring-${runtime.workedAtTick}`} className="pc-work-ring absolute inset-1 rounded-full border-2 border-amber-300" aria-hidden="true" />}
            <div key={runtime.status === 'PROCESSING' ? `pulse-${runtime.workedAtTick}` : 'still'} className={`h-full w-full ${runtime.status === 'PROCESSING' ? 'pc-avatar-pulse' : ''}`}>
              <WorkstationGraphic capability={capability} status={runtime.status} className="h-full w-full" />
            </div>
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className={`rounded-full px-1.5 py-px text-[9.5px] font-semibold ring-1 ${category.badge}`}>{t(category.label)}</span>
          </div>
          {worker && (
            <p className="truncate text-[11px] text-slate-400" title={t(worker.desk)}>
              {t(worker.role)}
            </p>
          )}
          <p className={`flex items-center gap-1.5 text-[12px] font-medium ${status.text}`} aria-live="polite">
            <span className={`inline-block h-2 w-2 rounded-full ${status.dot}`} />
            {t(status.label)}
            {runtime.status === 'PROCESSING' && runtime.lastDurationMs !== null && (
              <span className="font-normal text-slate-400">{runtime.lastDurationMs} ms</span>
            )}
          </p>
          {runtime.visits > 0 && <p className="text-[11px] text-slate-500">{tr({ en: `Handled ${runtime.visits}×`, vi: `Đã xử lý ${runtime.visits}×` })}</p>}
        </div>
      </div>

      {/* settings summary */}
      {settings.length > 0 && (
        <ul className="flex flex-wrap gap-1 border-t border-slate-800 px-3 py-2">
          {settings.map((s) => (
            <li key={s.key} className="max-w-full truncate rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300" title={s.text}>
              {s.text}
            </li>
          ))}
        </ul>
      )}

      {/* progress strip while the desk is working */}
      {runtime.status === 'PROCESSING' && (
        <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-xl bg-slate-800" role="progressbar" aria-label={t('Work in progress')}>
          <div key={`bar-${runtime.workedAtTick}`} className="pc-progress h-full bg-amber-400" />
        </div>
      )}

      {/* reactions: the token at the desk, a pile-up, a crimson alarm, a dropped transaction */}
      <TokenDock runtime={runtime} className="-top-8 left-3" />
      {runtime.congested && <CongestionBadges runtime={runtime} className="-top-4 left-1/2" />}
      {runtime.alarm && <AlarmRing alarm={runtime.alarm} shape="box" />}
      {runtime.alarm && <AlarmBadge alarm={runtime.alarm} className="-right-2 -top-4" />}
      {runtime.dropped && <DroppedToken marker={runtime.dropped} />}

      {/* ports */}
      {node.inputPorts.map((p, i) => (
        <PortHandle key={p.id} port={p} side={Position.Left} accent={category.accent} style={{ top: spread(i, node.inputPorts.length) }} />
      ))}
      {flowOut.map((p, i) => (
        <PortHandle key={p.id} port={p} side={Position.Right} accent={category.accent} style={{ top: spread(i, flowOut.length) }} />
      ))}
      {errorOut.map((p, i) => (
        <PortHandle key={p.id} port={p} side={Position.Bottom} accent={category.accent} caption={p.label} style={{ left: spread(i, errorOut.length) }} />
      ))}
    </div>
  );
}

export const TaskNode = memo(TaskNodeView);
