import { demoActionById, demoBlocked, type DemoActionId } from '../../sim/demoActions';
import { demoGroup, type DemoGroupId } from '../../sim/demoGroups';
import { inWindow, modeOf, shiftOf, shiftSnap, slotLabel } from '../../sim/demoSchedule';
import { shiftQueueStore } from '../../store/shiftQueueStore';
import { DESK_VISITS } from '../../sim/deskVisit';
import { simStamp } from '../../sim/ledgerStreams';
import { opsCustomer, presetById, presetCustomer, type PresetId } from '../../sim/presets';
import { formatAud } from '../../engine/money';
import { opsAccount, type OpsActionId } from '../../sim/retailOps';
import { opsStpVerdict } from '../../sim/stpEngine';
import { notificationStore } from '../../store/notificationStore';
import { bankStore } from '../../store/bankStore';
import { deskVisitStore } from '../../store/deskVisitStore';
import { retailOpsStore } from '../../store/retailOpsStore';
import { demoSessionStore } from '../../store/demoSessionStore';
import { hopPlayerStore } from '../../store/hopPlayerStore';
import { vaultFlowStore } from '../../store/vaultFlowStore';
import { demoLocked } from './DemoSession';
import { simulateFlow } from '../../store/academySync';
import { academyStore } from '../../store/academyStore';
import type { FlowId } from '../../types/viewport';

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
  // A counter preset (the teller, the disputes desk) brings its case customer to the counter, on both maps.
  if (DESK_VISITS[id] && modeOf(id) === 'human') deskVisitStore.getState().start(id);
  const retail = retailOpsStore.getState();
  if (id === 'eod') {
    retail.settleEod(opsStamp());
    retail.setLastTx(null);
    announce();
    demoSessionStore.getState().start({ kind: 'eod' });
    return;
  }
  const trace = bankStore.getState().presetTrace;
  if (!trace) return;
  retail.applyPreset(id, trace.plan.outcome, opsStamp());
  retail.setLastTx(trace.id);
  startPaymentSession();
}

/** The learner's payment is now the running demo: the navigation locks until it (and its hop replay) is over. */
function startPaymentSession(): void {
  const id = bankStore.getState().presetTxId;
  if (id) demoSessionStore.getState().start({ kind: 'payment', id });
}

/**
 * "[▶ Simulate this Flow]" from the Academy, under the one execution lock: refused while a demo runs; otherwise it closes the lessons,
 * plays the flow's main payment (paused first, like every demo) and opens its session, so the navigation locks until it is over.
 */
export function simulateGuidedFlow(flow: FlowId): void {
  if (demoLocked()) return;
  simulateFlow(academyStore, bankStore, flow);
  startPaymentSession();
}

/**
 * Before the night cycle: everything earlier flows left on screen goes (the learner's payment, the hop replay, the vault's cash
 * echoes, the counter visitors, the buttons waiting for a shift), so EoD plays as one stream. The simulation's own queues are not
 * touched: the day's customers are real and the night batch settles them.
 */
export function purgeForEod(): void {
  bankStore.getState().clearDemo();
  hopPlayerStore.getState().reset();
  vaultFlowStore.getState().clear();
  deskVisitStore.getState().clear();
  shiftQueueStore.getState().clear();
}

function runOpsDemo(id: OpsActionId): void {
  const retail = retailOpsStore.getState();
  retail.runAction(id, opsStamp());
  const outcome = retailOpsStore.getState().last;
  const bank = bankStore.getState();
  const customer = outcome?.status === 'BLOCKED' ? null : opsCustomer(id, outcome?.journal?.lines[0]?.dr, bank.stp);
  if (!customer) {
    retail.setLastTx(null);
    announce();
    return;
  }
  bank.runDemoCustomer(customer);
  retail.setLastTx(bankStore.getState().presetTxId);
  startPaymentSession();
  // A savings or collateral case brings people to those desks, on both maps. A system flow never does, nor a case the STP engine takes.
  const route = opsStpVerdict(id, bank.stp)?.route;
  const straight = route === 'STP' || route === 'REJECT';
  if (modeOf(id) === 'human' && !straight) deskVisitStore.getState().start(id);
  // The 3D camera does not re-frame round the inspector, which would cover these far-right desks: the journal comes up as a toast and a click on the desk or payment opens the detail.
  if (DESK_VISITS[id] && bankStore.getState().viewMode === '3d') {
    bankStore.getState().clearSelection();
    announce();
  }
}

/** Runs a button now, whatever the clock says: light the flow, send the payment to the inspector, post the retail journal. */
export function executeDemo(id: DemoActionId): void {
  const def = demoActionById(id);
  const bank = bankStore.getState();
  if (demoLocked() || demoBlocked(id, { dayOver: bank.view.dayOver, minute: bank.view.minute })) return;
  // Every demo pauses the bank first: its payment plays alone (a solo run) and the clock stays paused after it until Play.
  if (bank.playing) bank.pause();
  if (id === 'eod') purgeForEod();
  // Run once: a copy still waiting for its shift is now done.
  shiftQueueStore.getState().unqueue(id);
  if (bank.scope !== 'beginner' || bank.flow !== def.flow) bank.setActiveFlow(def.flow);
  if (presetById(id)) runPresetDemo(id as PresetId);
  else runOpsDemo(id as OpsActionId);
}

/**
 * The one pipeline behind every demo button (and Ctrl+K). A 24/7 channel runs at once. A counter or night-batch button outside its
 * window asks first (the prompt of ShiftPrompt.tsx): move the clock to its slot the same day, or wait in the queue for the shift.
 */
export function runDemo(id: DemoActionId): void {
  if (demoLocked()) return;
  let bank = bankStore.getState();
  // A 24/7 digital channel (VietQR, FacePay, cards, 3DS, wallets, eKYC, instant transfers) is never refused for the hour. Even once
  // today has closed at midnight it runs at once: the bank rolls into the next day (the clock restarts at 07:00) and serves it.
  if (shiftOf(id) === 'always' && bank.view.dayOver && id !== 'cassette-low' && id !== 'cassette-refill') {
    bank.startNextDay();
    bank = bankStore.getState();
    notificationStore.getState().push({
      tone: 'info',
      icon: '🌙',
      title: { en: 'Digital channel, 24/7', vi: 'Kênh số, 24/7' },
      body: { en: 'Today had closed, so the bank rolled into the next day to serve this digital payment at once.', vi: 'Ngày hôm nay đã khép sổ, nên ngân hàng chuyển sang ngày mới để xử lý ngay giao dịch số này.' },
      deferred: false,
      source: `always:${id}`,
    });
  }
  const snap = shiftSnap(id, bank.view.minute);
  // A day that is over stops everything but a counter button, which can still replay today up to 16:30.
  if (snap?.direction !== 'back' && demoBlocked(id, { dayOver: bank.view.dayOver, minute: bank.view.minute })) return;
  if (snap) {
    shiftQueueStore.getState().ask({ id, snap });
    return;
  }
  executeDemo(id);
}

/**
 * The sheet's "▶ Run this scenario": a manual demo override that runs at any hour, never waiting for a shift and never moving the
 * clock. It plays as an isolated solo run (the bank paused, only this payment moving). On a day already closed, which takes no more
 * payments, it plays in a sandbox instead: a throwaway copy of today runs the payment and the hop player shows its route, while the
 * bank stays on its closed day with its books untouched.
 */
export function runDemoAnytime(id: DemoActionId): void {
  if (demoLocked()) return;
  const bank = bankStore.getState();
  if (bank.view.dayOver && demoBlocked(id, { dayOver: true, minute: bank.view.minute })) {
    runSandboxDemo(id);
    return;
  }
  executeDemo(id);
}

/** A closed day's demo, played in the sandbox: nothing of the bank moves, and the session locks until its replay is over. */
function runSandboxDemo(id: DemoActionId): void {
  const bank = bankStore.getState();
  const customer = presetById(id) ? presetCustomer(id as PresetId, bank.sim.rules) : opsCustomer(id as OpsActionId, undefined, bank.stp);
  const def = demoActionById(id);
  if (bank.scope !== 'beginner' || bank.flow !== def.flow) bank.setActiveFlow(def.flow);
  const trace = customer ? bankStore.getState().runSandbox(customer) : null;
  if (trace) demoSessionStore.getState().start({ kind: 'sandbox', id: trace.id });
  notificationStore.getState().push({
    tone: 'info',
    icon: '🧪',
    title: { en: 'Sandbox replay', vi: 'Chạy thử trong sandbox' },
    body: { en: 'Today has closed, so this scenario plays in an isolated sandbox: the bank stays on its closed day and its books are untouched.', vi: 'Hôm nay đã khép sổ, nên kịch bản chạy trong sandbox tách biệt: ngân hàng giữ nguyên ngày đã đóng và sổ sách không thay đổi.' },
    deferred: false,
    source: `sandbox:${id}`,
  });
}

/** The prompt's Confirm: move the clock to the button's slot (forward, or a same-day replay back to 16:30), then run it. */
export function confirmShiftSnap(): void {
  const prompt = shiftQueueStore.getState().prompt;
  if (!prompt) return;
  shiftQueueStore.getState().dismiss();
  const { id, snap } = prompt;
  const bank = bankStore.getState();
  if (snap.direction === 'back') {
    // The clock only runs forward, so "back to 16:30" replays today from 07:00: the same customers arrive again.
    bank.resetDay();
    bankStore.getState().skipTo(snap.target);
  } else if (id !== 'eod') {
    // The night cycle moves the clock to 23:00 itself, and starts it playing.
    bank.skipTo(snap.target);
  }
  executeDemo(id);
  notificationStore.getState().push({
    tone: 'info',
    icon: '🕘',
    title: { en: 'Clock moved', vi: 'Đã chuyển giờ' },
    body: { en: `The clock is at ${slotLabel(snap.target)} the same day, and the scenario has started.`, vi: `Đồng hồ đã ở ${slotLabel(snap.target)} cùng ngày, và tình huống đã bắt đầu.` },
    deferred: false,
    source: `shift:${id}`,
  });
}

/** The prompt's Cancel: the clock stays, and the button waits in the queue for its shift. */
export function stayForShift(): void {
  shiftQueueStore.getState().stay();
}

/**
 * Runs every queued button whose shift has opened (one per clock change, so two payments never start on the same beat). Only while the
 * bank is playing: a paused bank is frozen, so moving its clock into a shift (or anything else done while paused) never starts a
 * queued scenario behind the learner's back. It runs once they press Play.
 */
export function releaseDueDemos(): void {
  const { view, playing, solo } = bankStore.getState();
  if (view.dayOver || !playing || solo || demoLocked()) return;
  const [next] = shiftQueueStore.getState().release((w) => inWindow(w.shift, view.minute)).slice(0, 1);
  if (!next) return;
  // Others that are due wait for the next clock change.
  executeDemo(next.id);
  notificationStore.getState().push({
    tone: 'info',
    icon: '⏰',
    title: { en: 'Scheduled shift started', vi: 'Ca làm việc đã bắt đầu' },
    body: { en: `${demoActionById(next.id).label()} is running now that its shift has opened.`, vi: `${demoActionById(next.id).label()} đang chạy vì ca của nó đã mở.` },
    deferred: false,
    source: `shift-run:${next.id}`,
  });
}

/** Lights a sub-group's own path and narrows the dock to its buttons. */
export function selectSubProcess(group: DemoGroupId): void {
  if (demoLocked()) return;
  bankStore.getState().selectSubProcess(group, demoGroup(group).flow);
}
