import { t } from '../../../i18n/t';
import { memo } from 'react';
import { labLabel } from '../../../i18n/labText';
import { Position, type NodeProps } from '@xyflow/react';
import type { ProcessFlowNode } from '../../../store/graphConversion';
import { IDLE_RUNTIME, useWorkflowStore } from '../../../store/workflowStore';
import { NodeIcon } from '../icons';
import { CATEGORY_THEME, isOutcome, OUTCOME_THEME } from '../nodeTheme';
import { AlarmBadge, AlarmRing, DroppedToken, TokenDock } from './NodeReactions';
import { PortHandle } from './PortHandle';
import { CustomerGraphic } from './WorkstationGraphic';

/**
 * Start: a customer's payment arrives. End: Approved, Declined, To suspense or Challenge.
 * Both are pills; the End pill takes its colour from the outcome the learner chose.
 */
function EventNodeView({ id, data, selected }: NodeProps<ProcessFlowNode>) {
  const node = data.node;
  const isStart = node.type === 'EVENT_START';
  const runtime = useWorkflowStore((s) => s.nodeRuntime[id] ?? IDLE_RUNTIME);

  const outcomeValue = node.configParams.outcome;
  const outcome = !isStart && isOutcome(outcomeValue) ? outcomeValue : null;
  const theme = outcome ? OUTCOME_THEME[outcome] : null;
  const accent = theme?.accent ?? CATEGORY_THEME.EVENT.accent;
  const reasonCode = typeof node.configParams.reasonCode === 'string' ? node.configParams.reasonCode : '';

  const active = runtime.status === 'PROCESSING' || runtime.status === 'QUEUED';
  const reached = runtime.status === 'DONE';

  // Name the result first. If the learner renamed the node, keep their name as the subtitle.
  const title = isStart ? labLabel(node.label) : theme ? t(theme.label) : labLabel(node.label);
  const subtitle = isStart
    ? t('a customer payment arrives')
    : node.label !== theme?.label && node.label !== 'End: Outcome'
      ? labLabel(node.label)
      : reasonCode
        ? reasonCode
        : t('end of the process');

  return (
    <div
      className={[
        'relative flex min-w-[196px] items-center gap-2.5 rounded-full border-2 bg-slate-900/95 py-2 pl-2.5 pr-5 text-slate-100 shadow-xl transition-shadow',
        selected ? 'outline outline-2 outline-offset-2 outline-sky-400' : '',
        reached ? 'shadow-[0_0_26px_-4px_var(--pc-accent)]' : '',
        active ? 'pc-glow' : '',
      ].join(' ')}
      style={{ borderColor: runtime.alarm ? '#dc2626' : runtime.status === 'FAULTED' ? '#fb7185' : accent, ['--pc-accent' as string]: accent }}
      data-testid={`event-${id}`}
      data-run-status={runtime.status}
    >
      {isStart ? (
        <CustomerGraphic active={runtime.status === 'QUEUED' || runtime.status === 'PROCESSING'} className="h-11 w-11 shrink-0" />
      ) : (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: `${accent}26`, color: accent }}>
          <NodeIcon type={node.type} capability={null} {...(outcome ? { outcome } : {})} size={22} />
        </span>
      )}

      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold leading-tight" title={title}>
          {title}
        </p>
        <p className="truncate text-[11px] text-slate-400" title={subtitle}>
          {subtitle}
        </p>
      </div>

      {node.locked && (
        <span className="absolute -top-2 left-4 rounded-full bg-slate-800 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-slate-400 ring-1 ring-slate-700" title={t('Part of the starter diagram')}>
          {t('fixed')}
        </span>
      )}

      <TokenDock runtime={runtime} settles={!isStart} bornHere={isStart} className="-top-8 left-2" />
      {runtime.alarm && <AlarmRing alarm={runtime.alarm} shape="pill" />}
      {runtime.alarm && <AlarmBadge alarm={runtime.alarm} className="-top-4 right-1" />}
      {runtime.dropped && <DroppedToken marker={runtime.dropped} anchorClass="-top-8 left-2" crossClass="-right-2 -top-3" />}

      {node.inputPorts.map((p, i) => (
        <PortHandle key={p.id} port={p} side={Position.Left} accent={accent} style={{ top: `${((i + 1) / (node.inputPorts.length + 1)) * 100}%` }} />
      ))}
      {node.outputPorts.map((p, i) => (
        <PortHandle key={p.id} port={p} side={Position.Right} accent={accent} style={{ top: `${((i + 1) / (node.outputPorts.length + 1)) * 100}%` }} />
      ))}
    </div>
  );
}

export const EventNode = memo(EventNodeView);
