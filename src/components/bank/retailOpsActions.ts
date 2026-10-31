import { demoActionById, demoBlocked, type DemoActionId } from '../../sim/demoActions';
import { simStamp } from '../../sim/ledgerStreams';
import { opsCustomer, presetById, type PresetId } from '../../sim/presets';
import { formatAud } from '../../engine/money';
import { opsAccount, opsSubProcess, type OpsActionId, type OpsSubProcessId } from '../../sim/retailOps';
import { notificationStore } from '../../store/notificationStore';
import { bankStore } from '../../store/bankStore';
import { retailOpsStore } from '../../store/retailOpsStore';

/** The bank's time for a journal of the retail book. */
export function opsStamp(): string {
  const { day, minute } = bankStore.getState().view;
  return simStamp(day, minute);
}

/** A refusal, an alert or the night cycle has no payment for the inspector to open on, so its result comes up as a toast. */
function announce(): void {
  const last = retailOpsStore.getState().last;
  if (!last) return;
  const entry = last.journal ? last.journal.lines.map((l) => `${l.dr > 0 ? 'Dr' : 'Cr'} ${opsAccount(l.account).code} ${formatAud(l.dr || l.cr)}`).join(' · ') : '';
  const withEntry = (text: string, vi: boolean): string => (entry ? `${text} ${vi ? entry.replace(/Dr /g, 'Nợ ').replace(/Cr /g, 'Có ') : entry}` : text);
  notificationStore.getState().push({
    tone: last.status === 'BLOCKED' ? 'danger' : last.status === 'ALERT' ? 'warning' : 'info',
    icon: last.status === 'ALERT' ? '🔔' : last.status === 'BLOCKED' ? '⛔' : '🏦',
    title: { en: 'Retail operations', vi: 'Nghiệp vụ bán lẻ' },
    body: { en: withEntry(last.message.en, false), vi: withEntry(last.message.vi, true) },
    deferred: false,
    source: String(last.action),
  });
}

function runPresetDemo(id: PresetId): void {
  bankStore.getState().runPreset(id);
  const retail = retailOpsStore.getState();
  if (id === 'eod') {
    retail.settleEod(opsStamp());
    retail.setLastTx(null);
    announce();
    return;
  }
  const trace = bankStore.getState().presetTrace;
  if (!trace) return;
  retail.applyPreset(id, trace.plan.outcome, opsStamp());
  retail.setLastTx(trace.id);
}

function runOpsDemo(id: OpsActionId): void {
  const retail = retailOpsStore.getState();
  retail.runAction(id, opsStamp());
  const outcome = retailOpsStore.getState().last;
  const bank = bankStore.getState();
  const customer = outcome?.status === 'BLOCKED' ? null : opsCustomer(id, outcome?.journal?.lines[0]?.dr);
  if (!customer) {
    retail.setLastTx(null);
    announce();
    return;
  }
  bank.runDemoCustomer(customer);
  retail.setLastTx(bankStore.getState().presetTxId);
}

/** The one pipeline behind every demo button (and Ctrl+K): light the flow, send the payment to the inspector, post the retail journal. */
export function runDemo(id: DemoActionId): void {
  const def = demoActionById(id);
  const bank = bankStore.getState();
  if (demoBlocked(id, { dayOver: bank.view.dayOver, minute: bank.view.minute })) return;
  if (bank.scope !== 'beginner' || bank.flow !== def.flow) bank.setActiveFlow(def.flow);
  if (presetById(id)) runPresetDemo(id as PresetId);
  else runOpsDemo(id as OpsActionId);
}

/** Lights a sub-process's own path and narrows the dock to its buttons. */
export function selectSubProcess(sub: OpsSubProcessId): void {
  bankStore.getState().selectSubProcess(sub, opsSubProcess(sub).flow);
}
