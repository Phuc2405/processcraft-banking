import { useMemo, useState } from 'react';
import { checkExpression } from '../../engine/expression';
import { variableDescription } from '../../i18n/catalogVi';
import { labLabel } from '../../i18n/labText';
import { tr } from '../../i18n/locale';
import { t } from '../../i18n/t';
import { factsNotYetSet, upstreamCapabilities } from '../../store/graphAnalysis';
import type { ProcessFlowEdge } from '../../store/graphConversion';
import { useWorkflowStore } from '../../store/workflowStore';
import type { ConditionVariable } from '../../types/processLearning';

const OPERATORS: Record<ConditionVariable['type'], string[]> = {
  number: ['<', '<=', '>', '>=', '==', '!='],
  string: ['==', '!='],
  boolean: ['==', '!='],
};

const inputClass =
  'w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-[12px] text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50';

function appendTo(current: string, addition: string, joiner = '&&'): string {
  const trimmed = current.trimEnd();
  if (trimmed === '') return addition;
  return /[(!]$|&&$|\|\|$/.test(trimmed) ? `${trimmed} ${addition}` : `${trimmed} ${joiner} ${addition}`;
}

function clause(v: ConditionVariable, op: string, value: string): string {
  return v.type === 'string' ? `${v.name} ${op} '${value}'` : `${v.name} ${op} ${value}`;
}

/**
 * Edits the routing rule on one branch leaving an XOR gateway.
 * The learner can type the expression, click a variable to drop its name in, or build a clause
 * from three dropdowns. The text is checked as they type with the same checker the grader uses, so
 * "Unknown variable 'riskscor'. Did you mean 'riskScore'?" appears before they ever submit.
 */
export function ConditionEditor({ edge }: { edge: ProcessFlowEdge }) {
  const variables = useWorkflowStore((s) => s.conditionVariables);
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const updateEdge = useWorkflowStore((s) => s.updateEdge);
  const selectEdge = useWorkflowStore((s) => s.selectEdge);

  const condition = edge.data?.conditionExpression ?? '';
  const isDefault = edge.data?.isDefault === true;
  const visible = useMemo(() => variables.filter((v) => v.learnerVisible), [variables]);

  const check = useMemo(() => (condition.trim() ? checkExpression(condition, variables) : null), [condition, variables]);
  const upstream = useMemo(() => upstreamCapabilities(nodes, edges, edge.source), [nodes, edges, edge.source]);
  const unset = useMemo(() => (check ? factsNotYetSet(check.identifiers, variables, upstream) : []), [check, variables, upstream]);

  const [varName, setVarName] = useState('');
  const [op, setOp] = useState('==');
  const [value, setValue] = useState('');
  const picked = visible.find((v) => v.name === varName);

  const set = (text: string): void => {
    updateEdge(edge.id, { conditionExpression: text });
  };
  const pickVariable = (name: string): void => {
    const v = visible.find((x) => x.name === name);
    setVarName(name);
    setValue(v?.allowedValues?.[0] ?? (v?.type === 'boolean' ? 'true' : ''));
    setOp(v ? (OPERATORS[v.type].includes(op) ? op : '==') : '==');
  };

  const siblings = useMemo(
    () =>
      edges
        .filter((e) => e.source === edge.source)
        .sort((a, b) => (a.data?.priority ?? Infinity) - (b.data?.priority ?? Infinity) || (a.id < b.id ? -1 : 1)),
    [edges, edge.source],
  );
  const labelOf = (id: string): string => {
    const label = nodes.find((n) => n.id === id)?.data.node.label;
    return label === undefined ? id : labLabel(label);
  };

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-700 bg-slate-900 p-2.5">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => updateEdge(edge.id, { isDefault: e.target.checked })}
          className="mt-0.5 h-4 w-4 accent-sky-500"
        />
        <span>
          <span className="block text-[12px] font-medium text-slate-100">{t('Default branch (else)')}</span>
          <span className="block text-[11px] leading-snug text-slate-400">
            {t('Taken only when no other branch matches. Every decision needs one, or a token can get stuck.')}
          </span>
        </span>
      </label>

      <div>
        <label htmlFor={`cond-${edge.id}`} className="mb-1 block text-[12px] font-medium text-slate-200">
          {t('Condition')}
        </label>
        <textarea
          id={`cond-${edge.id}`}
          rows={2}
          spellCheck={false}
          value={condition}
          disabled={isDefault}
          placeholder={isDefault ? t('A default branch has no condition') : "riskScore < 40 && dcvvStatus == 'VALID'"}
          onChange={(e) => set(e.target.value)}
          className={`${inputClass} resize-none font-mono ${check?.errors.length ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500' : ''}`}
          aria-invalid={Boolean(check?.errors.length)}
          aria-describedby={`cond-help-${edge.id}`}
        />
        <div id={`cond-help-${edge.id}`} className="mt-1.5 space-y-1 text-[11px]" aria-live="polite">
          {!isDefault && !condition.trim() && (
            <p className="text-amber-300">{t('An empty condition always matches, so this branch would swallow every token that reaches it.')}</p>
          )}
          {check?.errors.map((m) => (
            <p key={m} className="flex gap-1.5 text-rose-300">
              <span aria-hidden="true">✕</span>
              {m}
            </p>
          ))}
          {check && check.errors.length === 0 && (
            <p className="flex gap-1.5 text-emerald-300">
              <span aria-hidden="true">✓</span>
              Valid condition
            </p>
          )}
          {unset.map((w) => (
            <p key={w.name} className="flex gap-1.5 text-amber-300">
              <span aria-hidden="true">!</span>
              <span>
                <code className="font-mono">{w.name}</code> is set by the {w.producedBy.replace(/_/g, ' ').toLowerCase()}, which does not run before this decision on every path yet.
              </span>
            </p>
          ))}
        </div>
      </div>

      {!isDefault && (
        <>
          <fieldset className="space-y-2 rounded-lg border border-slate-700 bg-slate-900 p-2.5">
            <legend className="px-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">{t('Build a clause')}</legend>
            <div className="grid grid-cols-[1fr_64px] gap-1.5">
              <select aria-label={t('Variable')} value={varName} onChange={(e) => pickVariable(e.target.value)} className={inputClass}>
                <option value="">{t('Variable…')}</option>
                {visible.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </select>
              <select aria-label={t('Operator')} value={op} onChange={(e) => setOp(e.target.value)} className={inputClass} disabled={!picked}>
                {(picked ? OPERATORS[picked.type] : OPERATORS.number).map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
            {picked?.allowedValues ? (
              <select aria-label={t('Value')} value={value} onChange={(e) => setValue(e.target.value)} className={inputClass}>
                {picked.allowedValues.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            ) : picked?.type === 'boolean' ? (
              <select aria-label={t('Value')} value={value} onChange={(e) => setValue(e.target.value)} className={inputClass}>
                <option>true</option>
                <option>false</option>
              </select>
            ) : (
              <input
                aria-label={t('Value')}
                type={picked?.type === 'number' ? 'number' : 'text'}
                value={value}
                disabled={!picked}
                onChange={(e) => setValue(e.target.value)}
                placeholder={picked ? '' : t('Pick a variable first')}
                className={inputClass}
              />
            )}
            {picked && <p className="text-[11px] leading-snug text-slate-400">{picked.description}</p>}
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={!picked || value === ''}
                onClick={() => picked && set(appendTo(condition, clause(picked, op, value), '&&'))}
                className="flex-1 rounded-md bg-sky-600 px-2 py-1.5 text-[12px] font-medium text-white hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500"
              >
                {condition.trim() ? t('Add with AND') : t('Use this clause')}
              </button>
              {condition.trim() !== '' && (
                <button
                  type="button"
                  disabled={!picked || value === ''}
                  onClick={() => picked && set(appendTo(condition, clause(picked, op, value), '||'))}
                  className="rounded-md bg-slate-700 px-2 py-1.5 text-[12px] font-medium text-slate-100 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500"
                >
                  OR
                </button>
              )}
            </div>
          </fieldset>

          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">{t('Variables (click to insert)')}</p>
            <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto pr-1">
              {visible.map((v) => {
                const ready = v.producedBy === null || upstream.has(v.producedBy);
                return (
                  <button
                    key={v.name}
                    type="button"
                    onClick={() => set(appendTo(condition, v.name))}
                    title={`${variableDescription(v.name, v.description)}${v.producedBy ? tr({ en: ` (set by ${v.producedBy.replace(/_/g, ' ').toLowerCase()})`, vi: ` (do ${v.producedBy} đặt)` }) : ''}${v.allowedValues ? tr({ en: ` Values: ${v.allowedValues.join(', ')}.`, vi: ` Giá trị: ${v.allowedValues.join(', ')}.` }) : ''}`}
                    className={`rounded border px-1.5 py-0.5 font-mono text-[11px] ${ready ? 'border-slate-600 bg-slate-800 text-slate-200 hover:border-sky-500' : 'border-dashed border-slate-700 bg-slate-900 text-slate-500 hover:border-amber-400'}`}
                  >
                    {v.name}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[10px] text-slate-500">{t('Dashed names are not set yet on every path into this decision.')}</p>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`prio-${edge.id}`} className="mb-1 block text-[12px] font-medium text-slate-200">
            {t('Order')}
          </label>
          <input
            id={`prio-${edge.id}`}
            type="number"
            min={1}
            value={edge.data?.priority ?? ''}
            onChange={(e) => updateEdge(edge.id, { priority: e.target.value === '' ? null : Number(e.target.value) })}
            className={inputClass}
            title={t('Branches are tried from the lowest number to the highest. The first true condition wins.')}
          />
        </div>
        <div>
          <label htmlFor={`label-${edge.id}`} className="mb-1 block text-[12px] font-medium text-slate-200">
            {t('Note')}
          </label>
          <input
            id={`label-${edge.id}`}
            value={edge.data?.label ?? ''}
            placeholder={t('optional')}
            onChange={(e) => updateEdge(edge.id, { label: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>

      {siblings.length > 1 && (
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">{t('Branches, in the order they are tried')}</p>
          <ol className="space-y-1">
            {siblings.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => selectEdge(s.id)}
                  className={`flex w-full items-center gap-2 rounded-md border px-2 py-1 text-left text-[11px] ${s.id === edge.id ? 'border-sky-500 bg-sky-500/10' : 'border-slate-700 bg-slate-900 hover:border-slate-500'}`}
                >
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-slate-700 text-[9px] font-bold">{s.data?.isDefault ? 'else' : (s.data?.priority ?? '?')}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-slate-300">{s.data?.isDefault ? t('default') : s.data?.conditionExpression?.trim() || t('no condition')}</span>
                  <span className="max-w-[90px] shrink-0 truncate text-slate-500">→ {labelOf(s.target)}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
