import { useMemo, type DragEvent } from 'react';
import { useStoreApi } from '@xyflow/react';
import { nodeDefDescription, nodeDefLabel } from '../../i18n/catalogVi';
import { tr } from '../../i18n/locale';
import { t } from '../../i18n/t';
import { NODE_DRAG_MIME } from '../canvas/dragData';
import { NodeIcon } from '../canvas/icons';
import { CATEGORY_THEME, categoryOf } from '../canvas/nodeTheme';
import { findFreeSpot, flowKindOf, NODE_FOOTPRINT } from '../../store/graphConversion';
import { computePaletteUsage, paletteBlockReason, useWorkflowStore } from '../../store/workflowStore';
import type { NodeDefinition, NodeType } from '../../types/processLearning';

const GROUPS: Array<{ title: string; match: (type: NodeType) => boolean }> = [
  { title: 'Events', match: (t) => t === 'EVENT_START' || t === 'EVENT_END' },
  { title: 'Routing', match: (t) => t === 'GATEWAY_XOR' || t === 'GATEWAY_AND' },
  { title: 'Banking desks', match: (t) => t === 'TASK' },
];

/** The building blocks the active level allows, taken from NODE_CATALOG and filtered by the level's allowedNodePalette. */
export function NodePalette() {
  const level = useWorkflowStore((s) => s.level);
  const catalog = useWorkflowStore((s) => s.catalog);
  const nodes = useWorkflowStore((s) => s.nodes);
  const addNode = useWorkflowStore((s) => s.addNode);
  const flow = useStoreApi();

  const usage = useMemo(() => computePaletteUsage(level, nodes), [level, nodes]);
  const available = useMemo(
    () =>
      usage.rows.flatMap((row) => {
        const def = catalog.find((d) => d.id === row.definitionId);
        return def ? [{ def, row }] : [];
      }),
    [usage, catalog],
  );

  const dropAtCentre = (def: NodeDefinition): void => {
    const { width, height, transform } = flow.getState();
    const [tx, ty, zoom] = transform;
    const size = NODE_FOOTPRINT[flowKindOf(def.type)];
    // Aim at the middle of what the learner can see, then slide to the nearest gap so nodes never stack.
    const middle = { x: (width / 2 - tx) / zoom - size.width / 2, y: (height / 2 - ty) / zoom - size.height / 2 };
    addNode(def.id, findFreeSpot(nodes, middle, size));
  };

  const onDragStart = (e: DragEvent<HTMLElement>, def: NodeDefinition): void => {
    e.dataTransfer.setData(NODE_DRAG_MIME, def.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const budgetPct = usage.budget ? Math.min(100, (usage.placed / usage.budget) * 100) : 0;

  return (
    <section aria-label={t('Node palette')} className="flex flex-col gap-4">
      <header>
        <h2 className="text-sm font-semibold text-slate-100">{t('Node palette')}</h2>
        <p className="mt-0.5 text-xs text-slate-400">{t('Drag onto the canvas, or press + to add.')}</p>
        {usage.budget !== null && (
          <div className="mt-2.5">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>{t('Nodes used')}</span>
              <span className={usage.placed >= usage.budget ? 'font-semibold text-amber-300' : ''}>
                {usage.placed} / {usage.budget}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className={`h-full rounded-full transition-all ${usage.placed >= usage.budget ? 'bg-amber-400' : 'bg-sky-500'}`} style={{ width: `${budgetPct}%` }} />
            </div>
          </div>
        )}
      </header>

      {GROUPS.map((group) => {
        const items = available.filter(({ def }) => group.match(def.type));
        if (items.length === 0) return null;
        return (
          <div key={group.title}>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t(group.title)}</h3>
            <ul className="space-y-1.5">
              {items.map(({ def, row }) => {
                const category = CATEGORY_THEME[categoryOf(def)];
                const blocked = row.remaining === 0 ? paletteBlockReason(level, catalog, nodes, def.id) : null;
                return (
                  <li key={def.id}>
                    <div
                      draggable={!blocked}
                      onDragStart={(e) => onDragStart(e, def)}
                      title={blocked ?? nodeDefDescription(def.id, def.description)}
                      aria-disabled={blocked !== null}
                      data-testid={`palette-${def.id}`}
                      className={[
                        'group flex items-start gap-2.5 rounded-lg border border-slate-700/70 bg-slate-900 p-2 transition',
                        blocked ? 'cursor-not-allowed opacity-45' : 'cursor-grab hover:border-slate-500 hover:bg-slate-800/80 active:cursor-grabbing',
                      ].join(' ')}
                    >
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md" style={{ background: `${category.accent}22`, color: category.accent }}>
                        <NodeIcon type={def.type} capability={def.bankingCapability} size={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-medium text-slate-100">{nodeDefLabel(def.id, def.label)}</span>
                          <span className="ml-auto shrink-0 rounded bg-slate-800 px-1.5 py-px font-mono text-[10px] text-slate-400" title={t('Placed / allowed')}>
                            {row.used}/{row.max ?? '∞'}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-400">{nodeDefDescription(def.id, def.description)}</p>
                      </div>
                      <button
                        type="button"
                        disabled={blocked !== null}
                        onClick={() => dropAtCentre(def)}
                        aria-label={tr({ en: `Add ${def.label} to the canvas`, vi: `Thêm ${nodeDefLabel(def.id, def.label)} vào canvas` })}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-800 text-slate-300 transition hover:bg-sky-500 hover:text-slate-950 disabled:pointer-events-none"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                          <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {level.starterGraph && (
        <p className="rounded-lg border border-dashed border-slate-700 p-2.5 text-[11px] leading-snug text-slate-400">
          {t('Nodes marked')} <span className="rounded bg-slate-800 px-1 text-[9px] font-semibold uppercase text-slate-300">{t('fixed')}</span>{' '}
          {t('come with the level. They are free: they do not count against your node budget.')}
        </p>
      )}
    </section>
  );
}
