import { useEffect, useState } from 'react';
import type { ProcessFlowEdge, ProcessFlowNode } from '../../store/graphConversion';
import { useWorkflowStore } from '../../store/workflowStore';
import type { ConfigParamDef, ConfigValue } from '../../types/processLearning';
import { NodeIcon } from '../canvas/icons';
import { CATEGORY_THEME, categoryOf } from '../canvas/nodeTheme';
import { pacs008From, pacs008Xml } from '../../engine/iso20022';
import { ConditionEditor } from './ConditionEditor';
import { MessagePreview } from './MessagePreview';

const inputClass =
  'w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-[12px] text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50';

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12px] font-medium text-slate-200">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] leading-snug text-slate-400">{hint}</p>}
    </div>
  );
}

/** A number box that lets the learner clear it and retype, and only commits when the text is a real number. */
function NumberInput({ id, value, min, max, disabled, onCommit }: { id: string; value: number; min?: number; max?: number; disabled: boolean; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText((t) => (Number(t) === value ? t : String(value)));
  }, [value]);
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      value={text}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(n)) onCommit(n);
      }}
      className={inputClass}
    />
  );
}

/**
 * The bank-to-bank message the selected test payment carries, for the boxes that read it: the A2A start event and the A2A gateway.
 * It is the same pacs.008 the gateway validates, so the learner can see which field a rule is about.
 */
function A2aMessage() {
  const payload = useWorkflowStore((s) => s.level.testSuite.find((t) => t.id === s.selectedTestId)?.inputPayload);
  const testName = useWorkflowStore((s) => s.level.testSuite.find((t) => t.id === s.selectedTestId)?.name);
  const wire = payload ? pacs008From(payload) : null;
  if (!wire) return null;
  return (
    <div className="space-y-1">
      <MessagePreview title="pacs.008 message" xml={pacs008Xml(wire)} testId="a2a-message" />
      <p className="text-[11px] leading-snug text-slate-400">The message for the test chosen in the toolbar{testName ? `: ${testName}` : ''}. It travels with the payment.</p>
    </div>
  );
}

function ConfigField({ nodeId, def, value, locked }: { nodeId: string; def: ConfigParamDef; value: ConfigValue; locked: boolean }) {
  const update = useWorkflowStore((s) => s.updateNodeConfig);
  const id = `cfg-${nodeId}-${def.key}`;
  const range = def.type === 'number' && (def.min !== undefined || def.max !== undefined) ? ` (${def.min ?? '…'} to ${def.max ?? '…'})` : '';

  switch (def.type) {
    case 'number':
      return (
        <Field id={id} label={`${def.label}${range}`} hint={def.description}>
          <NumberInput id={id} value={typeof value === 'number' ? value : Number(def.defaultValue)} {...(def.min !== undefined ? { min: def.min } : {})} {...(def.max !== undefined ? { max: def.max } : {})} disabled={locked} onCommit={(n) => update(nodeId, def.key, n)} />
        </Field>
      );
    case 'enum':
      return (
        <Field id={id} label={def.label} hint={def.description}>
          <select id={id} value={String(value)} disabled={locked} onChange={(e) => update(nodeId, def.key, e.target.value)} className={inputClass}>
            {(def.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o.replace(/_/g, ' ').toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
      );
    case 'boolean':
      return (
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-700 bg-slate-900 p-2.5">
          <input type="checkbox" checked={value === true} disabled={locked} onChange={(e) => update(nodeId, def.key, e.target.checked)} className="mt-0.5 h-4 w-4 accent-sky-500" />
          <span>
            <span className="block text-[12px] font-medium text-slate-100">{def.label}</span>
            <span className="block text-[11px] leading-snug text-slate-400">{def.description}</span>
          </span>
        </label>
      );
    case 'string':
      return (
        <Field id={id} label={def.label} hint={def.description}>
          <input id={id} value={String(value)} disabled={locked} onChange={(e) => update(nodeId, def.key, e.target.value)} className={`${inputClass} font-mono`} />
        </Field>
      );
  }
}

function NodeInspector({ node }: { node: ProcessFlowNode }) {
  const definition = useWorkflowStore((s) => s.catalog.find((d) => d.id === node.data.node.definitionId));
  const updateLabel = useWorkflowStore((s) => s.updateNodeLabel);
  const removeNode = useWorkflowStore((s) => s.removeNode);
  const p = node.data.node;
  const locked = p.locked === true;

  return (
    <div className="space-y-4">
      {locked && (
        <p className="rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-[11px] leading-snug text-slate-300">
          This node is part of the level&apos;s starter diagram. You can move it, but not change or delete it.
        </p>
      )}
      <Field id={`label-${node.id}`} label="Name">
        <input
          id={`label-${node.id}`}
          value={p.label}
          disabled={locked}
          onChange={(e) => updateLabel(node.id, e.target.value)}
          className={inputClass}
        />
      </Field>
      {definition && <p className="text-[11px] leading-snug text-slate-400">{definition.description}</p>}

      {(node.data.node.definitionId === 'nd_start_a2a' || node.data.node.bankingCapability === 'A2A_GATEWAY') && <A2aMessage />}

      {definition?.configSchema.map((c) => (
        <ConfigField key={c.key} nodeId={node.id} def={c} value={p.configParams[c.key] ?? c.defaultValue} locked={locked} />
      ))}

      {definition && (definition.readsFacts.length > 0 || definition.writesFacts.length > 0) && (
        <dl className="space-y-2 text-[11px]">
          {definition.readsFacts.length > 0 && (
            <div>
              <dt className="mb-1 font-medium uppercase tracking-wide text-slate-500">Reads</dt>
              <dd className="flex flex-wrap gap-1">
                {definition.readsFacts.map((f) => (
                  <code key={f} className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
                    {f}
                  </code>
                ))}
              </dd>
            </div>
          )}
          {definition.writesFacts.length > 0 && (
            <div>
              <dt className="mb-1 font-medium uppercase tracking-wide text-slate-500">Sets (usable in conditions after this node)</dt>
              <dd className="flex flex-wrap gap-1">
                {definition.writesFacts.map((f) => (
                  <code key={f} className="rounded bg-emerald-950 px-1.5 py-0.5 text-emerald-300">
                    {f}
                  </code>
                ))}
              </dd>
            </div>
          )}
        </dl>
      )}

      {!locked && (
        <button
          type="button"
          onClick={() => removeNode(node.id)}
          className="w-full rounded-md border border-rose-500/40 px-2 py-1.5 text-[12px] font-medium text-rose-300 hover:bg-rose-500/10"
        >
          Delete node
        </button>
      )}
    </div>
  );
}

function EdgeInspector({ edge }: { edge: ProcessFlowEdge }) {
  const fromXor = useWorkflowStore((s) => s.nodes.find((n) => n.id === edge.source)?.data.node.type === 'GATEWAY_XOR');
  const updateEdge = useWorkflowStore((s) => s.updateEdge);
  const removeEdge = useWorkflowStore((s) => s.removeEdge);

  return (
    <div className="space-y-4">
      {fromXor ? (
        <ConditionEditor edge={edge} />
      ) : (
        <>
          <p className="text-[11px] leading-snug text-slate-400">
            This wire is always followed. Conditions only apply to wires that leave a <strong className="text-slate-200">Decision (XOR)</strong> gateway.
          </p>
          <Field id={`label-${edge.id}`} label="Note">
            <input
              id={`label-${edge.id}`}
              value={edge.data?.label ?? ''}
              placeholder="optional, shown on the wire"
              onChange={(e) => updateEdge(edge.id, { label: e.target.value })}
              className={inputClass}
            />
          </Field>
        </>
      )}
      <button
        type="button"
        onClick={() => removeEdge(edge.id)}
        className="w-full rounded-md border border-rose-500/40 px-2 py-1.5 text-[12px] font-medium text-rose-300 hover:bg-rose-500/10"
      >
        Delete wire
      </button>
    </div>
  );
}

/**
 * Settings for whatever is selected on the canvas: a node's name and configuration, or a wire's
 * condition. Hidden when nothing (or more than one thing) is selected.
 */
export function InspectorPanel() {
  const node = useWorkflowStore((s) => {
    const picked = s.nodes.filter((n) => n.selected);
    return picked.length === 1 ? picked[0] : undefined;
  });
  const edge = useWorkflowStore((s) => {
    const picked = s.edges.filter((e) => e.selected);
    return picked.length === 1 && !s.nodes.some((n) => n.selected) ? picked[0] : undefined;
  });
  const sourceLabel = useWorkflowStore((s) => (edge ? (s.nodes.find((n) => n.id === edge.source)?.data.node.label ?? '') : ''));
  const targetLabel = useWorkflowStore((s) => (edge ? (s.nodes.find((n) => n.id === edge.target)?.data.node.label ?? '') : ''));
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange);

  if (!node && !edge) return null;

  const close = (): void => {
    if (node) onNodesChange([{ type: 'select', id: node.id, selected: false }]);
    if (edge) onEdgesChange([{ type: 'select', id: edge.id, selected: false }]);
  };

  const accent = node ? CATEGORY_THEME[categoryOf(node.data.node)].accent : '#818cf8';

  return (
    <aside
      aria-label={node ? 'Node settings' : 'Wire settings'}
      className="pointer-events-auto flex max-h-[calc(100vh-290px)] min-h-[160px] w-[320px] flex-col rounded-xl border border-slate-700 bg-slate-950/95 shadow-2xl"
    >
      <header className="flex items-center gap-2 border-b border-slate-800 px-3 py-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md" style={{ background: `${accent}22`, color: accent }}>
          {node ? (
            <NodeIcon type={node.data.node.type} capability={node.data.node.bankingCapability} size={16} />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12h13M13 7l5 5-5 5" />
            </svg>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13px] font-semibold text-slate-100">{node ? node.data.node.label : 'Wire'}</h2>
          <p className="truncate text-[11px] text-slate-400">{node ? 'Node settings' : `${sourceLabel} → ${targetLabel}`}</p>
        </div>
        <button type="button" onClick={close} aria-label="Close settings" className="grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {node && <NodeInspector key={node.id} node={node} />}
        {edge && <EdgeInspector key={edge.id} edge={edge} />}
      </div>
    </aside>
  );
}
