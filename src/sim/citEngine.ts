/**
 * Cash-in-transit (CIT) and vault operations: the four armoured-van scenarios, the vault's cash-fitness sort and the double-entry
 * book they post to. A run's lifecycle is a State pattern (EN_ROUTE → ARRIVED → IN_COUNT → DELIVERED → SETTLED, each state
 * owning its guard and its posting); each scenario's GL legs are a Strategy. Pure: the day's runs are derived from the day number
 * and the clock, so pausing, replaying or reloading can never post a run twice.
 *
 * A book of its own, like the retail book: its GL numbers are the ones the CIT brief names (1111 vault, 1112 unfit cash, 1113 ATM,
 * 1121 SBV, 1131 cash in transit, 4211 corporate deposits). 1111 is split by where the cash physically is (branch vault, HQ vault).
 */

import type { Localized } from '../i18n/localeCore';
import { hashSeed, Rng } from './prng';

const L = (en: string, vi: string): Localized<string> => ({ en, vi });

export const CIT_ACCOUNTS = [
  { id: 'VAULT', code: '1111', name: L('Main vault · Branch A', 'Quỹ chính · Chi nhánh A') },
  { id: 'HQ_VAULT', code: '1111', name: L('Central vault · HQ', 'Quỹ Kho trung tâm · Hội sở') },
  { id: 'UNFIT', code: '1112', name: L('Unfit cash awaiting the SBV', 'Tiền không đủ tiêu chuẩn lưu thông chờ nộp NHNN') },
  { id: 'ATM', code: '1113', name: L('Cash at ATM / CDM', 'Tiền mặt tại ATM / CDM') },
  { id: 'SBV', code: '1121', name: L('Deposits at the SBV', 'Tiền gửi tại NHNN') },
  { id: 'TRANSIT', code: '1131', name: L('Cash in transit (CIT)', 'Tiền mặt đang chuyển (CIT)') },
  { id: 'CORP', code: '4211', name: L('Corporate deposits (provisional)', 'Tiền gửi DN (tạm tính)') },
] as const;

export type CitAccountId = (typeof CIT_ACCOUNTS)[number]['id'];
export const CIT_ACCOUNT_IDS: readonly CitAccountId[] = CIT_ACCOUNTS.map((a) => a.id);
export const citAccount = (id: CitAccountId): (typeof CIT_ACCOUNTS)[number] => CIT_ACCOUNTS.find((a) => a.id === id)!;

/** The simulator's cash policy (a real bank sets these in its treasury policy). */
export const CIT_LIMITS = {
  atmMinCents: 1_000_000,
  atmTargetCents: 6_000_000,
  cdmFullPct: 95,
  cdmCassetteCents: 4_000_000,
  branchMaxCents: 500_000_000,
  branchFloorCents: 100_000_000,
  branchTargetCents: 300_000_000,
  /** Above this the vault deposits its surplus at the SBV; unfit notes at or above `unfitSurrenderCents` go with it. */
  sbvLineCents: 520_000_000,
  unfitSurrenderCents: 1_000_000,
  holidayWithdrawCents: 150_000_000,
  noteCents: 1_000,
} as const;

/** Debit-positive opening balances of the day book; corporate deposits are the balancing figure. */
export const CIT_OPENING: Readonly<Record<CitAccountId, number>> = (() => {
  const b: Record<CitAccountId, number> = { VAULT: 460_000_000, HQ_VAULT: 2_000_000_000, UNFIT: 1_200_000, ATM: 800_000, SBV: 5_000_000_000, TRANSIT: 0, CORP: 0 };
  b.CORP = -CIT_ACCOUNT_IDS.reduce((s, id) => s + b[id], 0);
  return b;
})();

// Scenarios (Strategy)

export type CitScenario = 'ATM_CDM' | 'BRANCH_BALANCING' | 'DOORSTEP' | 'SBV';
/** Relative to the branch vault: OUT leaves it (or the CDM's cassette, for a collection: IN), IN arrives at it. */
export type CitDirection = 'OUT' | 'IN';

interface CitStrategy {
  icon: string;
  label: Localized<string>;
  route: (d: CitDirection) => { from: CitAccountId; to: CitAccountId };
  /** The vault's count sorts fit from unfit notes. */
  sorts: (d: CitDirection) => boolean;
}

export const CIT_STRATEGIES: Readonly<Record<CitScenario, CitStrategy>> = {
  ATM_CDM: {
    icon: '🏧',
    label: L('ATM / CDM replenishment', 'Tiếp quỹ ATM / CDM'),
    route: (d) => (d === 'OUT' ? { from: 'VAULT', to: 'ATM' } : { from: 'ATM', to: 'VAULT' }),
    sorts: (d) => d === 'IN',
  },
  BRANCH_BALANCING: {
    icon: '🏛️',
    label: L('Branch ↔ HQ vault balancing', 'Điều chuyển tồn quỹ Chi nhánh ↔ Kho Trung ương'),
    route: (d) => (d === 'OUT' ? { from: 'VAULT', to: 'HQ_VAULT' } : { from: 'HQ_VAULT', to: 'VAULT' }),
    sorts: () => false,
  },
  DOORSTEP: {
    icon: '🔐',
    label: L('Doorstep banking (corporate pickup)', 'Thu tiền mặt tận nơi (Khách hàng DN)'),
    route: () => ({ from: 'CORP', to: 'VAULT' }),
    sorts: () => true,
  },
  SBV: {
    icon: '🏦',
    label: L('SBV vault operation', 'Nộp / Rút tiền mặt tại NHNN'),
    route: (d) => (d === 'OUT' ? { from: 'VAULT', to: 'SBV' } : { from: 'SBV', to: 'VAULT' }),
    sorts: () => false,
  },
};

export interface CitOrder {
  id: string;
  scenario: CitScenario;
  direction: CitDirection;
  /** Declared on the manifest and dispatched. */
  amountCents: number;
  sealId: string;
  /** The seal the receiving custodians find on the bag: a mismatch is a tampered seal. */
  presentedSealId: string;
  /** Maker and checker: the two custodians who must both sign (4-eye). */
  custodians: readonly [string, string];
  client?: string;
  /** Share of the received notes the count finds unfit, in basis points (only where the strategy sorts). */
  unfitBp: number;
  /** Cash short against the declaration, found at the count (doorstep only: the customer is credited what was counted). */
  shortCents: number;
  /** Unfit notes surrendered with an SBV deposit. */
  unfitSurrenderCents: number;
  trigger: Localized<string>;
}

export type CitOrderInput = Pick<CitOrder, 'scenario' | 'direction' | 'amountCents'> & Partial<Omit<CitOrder, 'scenario' | 'direction' | 'amountCents'>>;

const note = (cents: number): number => Math.max(0, Math.round(cents / CIT_LIMITS.noteCents) * CIT_LIMITS.noteCents);

/** A complete, valid order: notes rounded, shortfalls only where a customer declared the cash, surrenders only on an SBV deposit. */
export function citOrder(i: CitOrderInput): CitOrder {
  const amountCents = note(i.amountCents);
  const sealId = i.sealId ?? `SEAL-${(hashSeed(i.scenario, i.direction, amountCents) % 1e7).toString().padStart(7, '0')}`;
  return {
    id: i.id ?? sealId,
    scenario: i.scenario,
    direction: i.scenario === 'DOORSTEP' ? 'IN' : i.direction,
    amountCents,
    sealId,
    presentedSealId: i.presentedSealId ?? sealId,
    custodians: i.custodians ?? ['Custodian A', 'Custodian B'],
    ...(i.client ? { client: i.client } : {}),
    unfitBp: Math.min(10_000, Math.max(0, Math.round(i.unfitBp ?? 0))),
    shortCents: i.scenario === 'DOORSTEP' ? Math.min(amountCents, note(i.shortCents ?? 0)) : 0,
    unfitSurrenderCents: i.scenario === 'SBV' && i.direction === 'OUT' ? note(i.unfitSurrenderCents ?? 0) : 0,
    trigger: i.trigger ?? L('Manual order', 'Lệnh điều quỹ thủ công'),
  };
}

// Count, seal and journal

export interface CitCount {
  receivedCents: number;
  fitCents: number;
  unfitCents: number;
  shortCents: number;
}

/** The count at the receiving end: what arrived, and how much of it is fit for circulation. */
export function countCash(o: CitOrder): CitCount {
  const received = o.amountCents + o.unfitSurrenderCents - o.shortCents;
  const unfit = CIT_STRATEGIES[o.scenario].sorts(o.direction) ? Math.min(received, note((received * o.unfitBp) / 10_000)) : 0;
  return { receivedCents: received, fitCents: received - unfit, unfitCents: unfit, shortCents: o.shortCents };
}

export interface SealCheck {
  ok: boolean;
  sealMatches: boolean;
  fourEyes: boolean;
}

/** 4-eye seal validation: the seal on the bag matches the manifest, and two different custodians sign for it. */
export function verifySeal(o: CitOrder): SealCheck {
  const [a, b] = o.custodians;
  const sealMatches = o.presentedSealId === o.sealId;
  const fourEyes = a.trim() !== '' && b.trim() !== '' && a.trim() !== b.trim();
  return { ok: sealMatches && fourEyes, sealMatches, fourEyes };
}

export interface CitLine {
  account: CitAccountId;
  dr: number;
  cr: number;
}

export interface CitEntry {
  runId: string;
  status: CitStatus;
  memo: Localized<string>;
  lines: readonly CitLine[];
}

const dr = (account: CitAccountId, cents: number): CitLine[] => (cents > 0 ? [{ account, dr: cents, cr: 0 }] : []);
const cr = (account: CitAccountId, cents: number): CitLine[] => (cents > 0 ? [{ account, dr: 0, cr: cents }] : []);

/** Cash leaves its source into transit: Dr 1131 / Cr source (an SBV deposit also takes the unfit notes off 1112). */
export function dispatchEntry(o: CitOrder): CitEntry {
  const { from } = CIT_STRATEGIES[o.scenario].route(o.direction);
  return {
    runId: o.id,
    status: 'EN_ROUTE',
    memo: o.scenario === 'DOORSTEP' ? L('Sealed bag picked up at the client', 'Nhận túi niêm phong tại khách hàng') : L('Cash dispatched into transit', 'Xuất quỹ đưa vào vận chuyển'),
    lines: [...dr('TRANSIT', o.amountCents + o.unfitSurrenderCents), ...cr(from, o.amountCents), ...cr('UNFIT', o.unfitSurrenderCents)],
  };
}

/** The count passes and transit clears: Dr destination (fit) / Dr 1112 (unfit) / Dr 4211 (shortfall reverses the provisional credit) / Cr 1131. */
export function receiptEntry(o: CitOrder): CitEntry {
  const { to, from } = CIT_STRATEGIES[o.scenario].route(o.direction);
  const c = countCash(o);
  return {
    runId: o.id,
    status: 'DELIVERED',
    memo: L('Count passed: cash received, transit cleared', 'Kiểm đếm đạt: nhập quỹ, tất toán tiền đang chuyển'),
    lines: [...dr(to, c.fitCents), ...dr('UNFIT', c.unfitCents), ...dr(from, c.shortCents), ...cr('TRANSIT', o.amountCents + o.unfitSurrenderCents)],
  };
}

export const entryBalanced = (e: CitEntry): boolean => e.lines.reduce((s, l) => s + l.dr, 0) === e.lines.reduce((s, l) => s + l.cr, 0);

/** Posts an entry to a debit-positive book; refuses an unbalanced one. */
export function postEntry(book: Readonly<Record<CitAccountId, number>>, e: CitEntry): Record<CitAccountId, number> {
  if (!entryBalanced(e)) throw new Error(`CIT entry for ${e.runId} does not balance`);
  const next = { ...book };
  for (const l of e.lines) next[l.account] += l.dr - l.cr;
  return next;
}

export const bookAfter = (entries: readonly CitEntry[], opening: Readonly<Record<CitAccountId, number>> = CIT_OPENING): Record<CitAccountId, number> => entries.reduce(postEntry, { ...opening });

/** Both legs of a scenario, for the flashcards and the Knowledge Base. */
export const citExampleJournal = (o: CitOrder): CitLine[] => [...dispatchEntry(o).lines, ...receiptEntry(o).lines];

// Lifecycle (State)

export const CIT_STATUSES = ['EN_ROUTE', 'ARRIVED', 'IN_COUNT', 'DELIVERED', 'SETTLED'] as const;
export type CitStatus = (typeof CIT_STATUSES)[number];
export type CitBlock = 'SEAL_MISMATCH' | 'NO_FOUR_EYES' | 'TRANSIT_OPEN';

export interface CitRun {
  order: CitOrder;
  status: CitStatus;
  entries: readonly CitEntry[];
  /** A broken seal was minuted and the bag recounted in full under dual control with the client's representative. */
  incident: boolean;
  blocked: CitBlock | null;
}

interface CitState {
  next: CitStatus | null;
  /** Why the run may not leave this state yet. */
  guard?: (run: CitRun) => CitBlock | null;
  /** What entering the state posts. */
  post?: (o: CitOrder) => CitEntry;
}

const transitNet = (run: CitRun): number => run.entries.flatMap((e) => e.lines).reduce((s, l) => s + (l.account === 'TRANSIT' ? l.dr - l.cr : 0), 0);

export const CIT_STATES: Readonly<Record<CitStatus, CitState>> = {
  EN_ROUTE: { next: 'ARRIVED', post: dispatchEntry },
  ARRIVED: {
    next: 'IN_COUNT',
    guard: (run) => {
      const s = verifySeal(run.order);
      return !s.fourEyes ? 'NO_FOUR_EYES' : !s.sealMatches && !run.incident ? 'SEAL_MISMATCH' : null;
    },
  },
  IN_COUNT: { next: 'DELIVERED' },
  DELIVERED: { next: 'SETTLED', post: receiptEntry, guard: (run) => (transitNet(run) !== 0 ? 'TRANSIT_OPEN' : null) },
  SETTLED: { next: null },
};

export function startRun(order: CitOrder): CitRun {
  return { order, status: 'EN_ROUTE', entries: [CIT_STATES.EN_ROUTE.post!(order)], incident: false, blocked: null };
}

/** One step along the lifecycle; a guard that fails leaves the run where it is with the reason. */
export function advance(run: CitRun): CitRun {
  const state = CIT_STATES[run.status];
  const blocked = state.guard?.(run) ?? null;
  if (blocked || !state.next) return { ...run, blocked };
  const post = CIT_STATES[state.next].post;
  return { ...run, status: state.next, entries: post ? [...run.entries, post(run.order)] : run.entries, blocked: null };
}

/** The broken-seal procedure: minutes signed, then the bag is counted in full under dual control. */
export const logIncident = (run: CitRun): CitRun => ({ ...run, incident: true, blocked: null });

// Triggers

export type CitTrigger = { direction: CitDirection; amountCents: number; trigger: Localized<string> } | null;

export function atmTrigger(atmCents: number, cdmFillPct: number): CitTrigger {
  if (atmCents < CIT_LIMITS.atmMinCents) return { direction: 'OUT', amountCents: CIT_LIMITS.atmTargetCents - atmCents, trigger: L('ATM cash under the $10,000 minimum', 'Tiền mặt ATM dưới mức tối thiểu $10,000') };
  if (cdmFillPct >= CIT_LIMITS.cdmFullPct) return { direction: 'IN', amountCents: Math.min(atmCents, Math.round((CIT_LIMITS.cdmCassetteCents * cdmFillPct) / 100)), trigger: L('CDM deposit cassette full', 'Hộp tiền nộp CDM đầy') };
  return null;
}

export function branchTrigger(vaultCents: number): CitTrigger {
  if (vaultCents > CIT_LIMITS.branchMaxCents) return { direction: 'OUT', amountCents: vaultCents - CIT_LIMITS.branchTargetCents, trigger: L('End-of-day excess over the $5M vault limit', 'Tồn quỹ cuối ngày vượt hạn mức $5M') };
  if (vaultCents < CIT_LIMITS.branchFloorCents) return { direction: 'IN', amountCents: CIT_LIMITS.branchTargetCents - vaultCents, trigger: L('Vault under its $1M floor', 'Tồn quỹ dưới mức sàn $1M') };
  return null;
}

export function sbvTrigger(vaultCents: number, unfitCents: number, holiday: boolean): (CitTrigger & { unfitSurrenderCents: number }) | null {
  if (holiday) return { direction: 'IN', amountCents: CIT_LIMITS.holidayWithdrawCents, unfitSurrenderCents: 0, trigger: L('Holiday cash withdrawal', 'Rút tiền mặt dự phòng dịp lễ') };
  const surplus = Math.max(0, vaultCents - CIT_LIMITS.sbvLineCents);
  const surrender = unfitCents >= CIT_LIMITS.unfitSurrenderCents ? unfitCents : 0;
  if (surplus === 0 && surrender === 0) return null;
  return { direction: 'OUT', amountCents: surplus, unfitSurrenderCents: surrender, trigger: L('Deposit surplus and unfit notes at the SBV', 'Nộp tiền thừa và tiền không đủ tiêu chuẩn vào NHNN') };
}

// The day's runs

/** Minutes after dispatch at which a run enters each state; a minuted seal incident adds `incident` before the count. */
export const CIT_TIMING = { ARRIVED: 25, IN_COUNT: 35, DELIVERED: 55, SETTLED: 65, incident: 15 } as const;
export const DOORSTEP_CLIENTS = ['WinMart', 'Go!'] as const;
const CUSTODIANS = ['Nguyễn Văn An', 'Trần Thị Bình', 'Lê Minh Châu', 'Phạm Quốc Dũng'] as const;
const SLOTS: ReadonlyArray<{ at: number; kind: 'ATM' | 'CDM' | 'DOORSTEP' | 'SBV' | 'BRANCH'; client?: string }> = [
  { at: 9 * 60 + 10, kind: 'ATM' },
  { at: 10 * 60, kind: 'DOORSTEP', client: DOORSTEP_CLIENTS[0] },
  { at: 11 * 60 + 20, kind: 'CDM' },
  { at: 13 * 60, kind: 'DOORSTEP', client: DOORSTEP_CLIENTS[1] },
  { at: 14 * 60 + 20, kind: 'SBV' },
  { at: 15 * 60 + 40, kind: 'BRANCH' },
];

/** Every seventh day is the eve of a holiday: the bank withdraws cash from the SBV instead of depositing. */
export const isHolidayEve = (day: number): boolean => day % 7 === 0;

export interface CitPlanned {
  order: CitOrder;
  start: number;
}

const planCache = new Map<number, readonly CitPlanned[]>();

/** The day's runs, each raised by its trigger against the book as the earlier runs leave it. Deterministic per day. */
export function citDay(day: number): readonly CitPlanned[] {
  const hit = planCache.get(day);
  if (hit) return hit;
  const rng = new Rng(hashSeed('cit', day));
  let book: Record<CitAccountId, number> = { ...CIT_OPENING, ATM: rng.int(6, 14) * 100_000 };
  const out: CitPlanned[] = [];
  for (const slot of SLOTS) {
    const n = out.length + 1;
    const pair = rng.int(0, CUSTODIANS.length - 1);
    const base = { id: `CIT-${day}-${n}`, sealId: `SEAL-${day}${String(rng.int(10_000, 99_999))}`, custodians: [CUSTODIANS[pair]!, CUSTODIANS[(pair + 1) % CUSTODIANS.length]!] as const };
    let order: CitOrder | null = null;
    if (slot.kind === 'ATM' || slot.kind === 'CDM') {
      const t = atmTrigger(slot.kind === 'ATM' ? book.ATM : Math.max(book.ATM, CIT_LIMITS.atmMinCents), slot.kind === 'CDM' ? rng.int(85, 100) : 0);
      if (t && (slot.kind === 'ATM' ? t.direction === 'OUT' : t.direction === 'IN')) order = citOrder({ ...base, scenario: 'ATM_CDM', ...t, unfitBp: rng.int(50, 400) });
    } else if (slot.kind === 'DOORSTEP') {
      const tampered = rng.next() < 0.12;
      order = citOrder({
        ...base,
        scenario: 'DOORSTEP',
        direction: 'IN',
        client: slot.client!,
        amountCents: rng.int(25, 45) * 1_000_000,
        unfitBp: rng.int(20, 300),
        shortCents: rng.next() < 0.2 ? rng.int(1, 5) * 10_000 : 0,
        ...(tampered ? { presentedSealId: `${base.sealId}-X` } : {}),
        trigger: L(`Scheduled bulk cash pickup: ${slot.client}`, `Lịch thu tiền mặt định kỳ: ${slot.client}`),
      });
    } else if (slot.kind === 'SBV') {
      const t = sbvTrigger(book.VAULT, book.UNFIT, isHolidayEve(day));
      if (t) order = citOrder({ ...base, scenario: 'SBV', ...t });
    } else {
      const t = branchTrigger(book.VAULT);
      if (t) order = citOrder({ ...base, scenario: 'BRANCH_BALANCING', ...t });
    }
    if (!order || order.amountCents + order.unfitSurrenderCents === 0) continue;
    out.push({ order, start: slot.at });
    book = bookAfter([dispatchEntry(order), receiptEntry(order)], book);
  }
  if (planCache.size > 16) planCache.clear();
  planCache.set(day, out);
  return out;
}

const tampered = (o: CitOrder): boolean => !verifySeal(o).sealMatches;

/** When a planned run enters each state. */
export function citSchedule(p: CitPlanned): Record<CitStatus, number> {
  const delay = tampered(p.order) ? CIT_TIMING.incident : 0;
  return { EN_ROUTE: p.start, ARRIVED: p.start + CIT_TIMING.ARRIVED, IN_COUNT: p.start + CIT_TIMING.IN_COUNT + delay, DELIVERED: p.start + CIT_TIMING.DELIVERED + delay, SETTLED: p.start + CIT_TIMING.SETTLED + delay };
}

/** A planned run as it stands at `minute`, walked through the state machine; null before dispatch. */
export function runAt(p: CitPlanned, minute: number): CitRun | null {
  const at = citSchedule(p);
  if (minute < at.EN_ROUTE) return null;
  let run = startRun(p.order);
  while (run.status !== 'SETTLED') {
    // A broken seal holds the bag at ARRIVED until the incident minutes are signed.
    if (run.status === 'ARRIVED' && !run.incident && tampered(run.order) && minute >= at.ARRIVED + CIT_TIMING.incident) run = logIncident(run);
    if (minute < at[CIT_STATES[run.status].next!]) break;
    run = advance(run);
    if (run.blocked) return run;
  }
  return run.status === 'ARRIVED' ? { ...run, blocked: CIT_STATES.ARRIVED.guard!(run) } : run;
}

export type VaultFlow = 'OUT' | 'IN' | null;

export interface CitSnapshot {
  runs: ReadonlyArray<{ planned: CitPlanned; run: CitRun | null }>;
  /** The run to show: the latest dispatched that is not settled, else the latest dispatched. */
  active: { planned: CitPlanned; run: CitRun } | null;
  journal: readonly CitEntry[];
  book: Record<CitAccountId, number>;
  /** Cash moving out of (Cr 1111) or into (Dr 1111) the branch vault right now. */
  vaultFlow: VaultFlow;
  /** The run stopped at the vault's loading bay and how far through that stop it is (0-1): what the crew's walk follows (citCrew.ts). */
  bay: { id: string; flow: 'IN' | 'OUT'; u: number } | null;
}

// Manual demo dispatches

export type CitDemo = 'ATM' | 'DOORSTEP' | 'SBV';
export const CIT_DEMOS: readonly CitDemo[] = ['ATM', 'DOORSTEP', 'SBV'];
/** At most this many manual runs a day, so the derived plan stays small. */
export const CIT_DEMO_CAP = 12;

/**
 * A van the learner dispatched by hand at `at`. `refillCents` is the retail ATM cassette's shortfall at that moment, which sizes an
 * ATM run. `lead` is how many minutes the run has played on its own while the bank was paused (a pause-isolated demo): the run is
 * that far ahead of the bank's clock, and nothing else moved.
 */
export interface CitManual {
  kind: CitDemo;
  at: number;
  refillCents?: number;
  lead?: number;
}

/** A manual run's order, raised against the book as it stands at dispatch; a trigger that would not fire still sends a sensible demo amount. */
export function manualOrder(day: number, n: number, m: CitManual, book: Readonly<Record<CitAccountId, number>>): CitOrder {
  const base = { id: `CIT-${day}-M${n}`, sealId: `SEAL-${day}M${String(n).padStart(4, '0')}`, custodians: [CUSTODIANS[n % CUSTODIANS.length]!, CUSTODIANS[(n + 1) % CUSTODIANS.length]!] as const };
  const manual = (en: string, vi: string): Localized<string> => L(`Manual dispatch: ${en}`, `Điều xe thủ công: ${vi}`);
  if (m.kind === 'ATM') {
    const amountCents = m.refillCents && m.refillCents > 0 ? m.refillCents : (atmTrigger(book.ATM, 0)?.amountCents ?? Math.max(CIT_LIMITS.atmTargetCents - book.ATM, 2_000_000));
    return citOrder({ ...base, scenario: 'ATM_CDM', direction: 'OUT', amountCents, trigger: manual(m.refillCents ? 'retail ATM cassette shortfall' : 'ATM top-up', m.refillCents ? 'bù hộp tiền ATM bán lẻ' : 'tiếp quỹ ATM') });
  }
  if (m.kind === 'DOORSTEP') return citOrder({ ...base, scenario: 'DOORSTEP', direction: 'IN', client: DOORSTEP_CLIENTS[0], amountCents: 30_000_000, unfitBp: 150, trigger: manual(`bulk cash pickup at ${DOORSTEP_CLIENTS[0]}`, `thu tiền mặt tại ${DOORSTEP_CLIENTS[0]}`) });
  const t = sbvTrigger(book.VAULT, book.UNFIT, isHolidayEve(day)) ?? { direction: 'IN' as const, amountCents: CIT_LIMITS.holidayWithdrawCents, unfitSurrenderCents: 0, trigger: L('', '') };
  return citOrder({ ...base, scenario: 'SBV', ...t, trigger: manual(t.direction === 'OUT' ? 'deposit at the SBV' : 'withdraw from the SBV', t.direction === 'OUT' ? 'nộp tiền vào NHNN' : 'rút tiền từ NHNN') });
}

/** The day's manual runs as planned runs, each sized against the book its dispatch minute saw (earlier manual runs included). */
export function manualPlan(day: number, manual: readonly CitManual[]): CitPlanned[] {
  const out: CitPlanned[] = [];
  manual.slice(0, CIT_DEMO_CAP).forEach((m, i) => {
    const book = snapshotOf(day, m.at, out).book;
    out.push({ order: manualOrder(day, i + 1, m, book), start: m.at - (m.lead ?? 0) });
  });
  return out;
}

export function citAt(day: number, minute: number, manual: readonly CitManual[] = []): CitSnapshot {
  return snapshotOf(day, minute, manualPlan(day, manual));
}

/** The run the van is standing at the loading bay for: loading an outflow, or arrived with an inflow. */
export function citBayRun(cit: CitSnapshot): CitRun | null {
  const run = cit.active?.run;
  if (!run || run.status === 'SETTLED') return null;
  return cit.vaultFlow !== null || run.status !== 'EN_ROUTE' ? run : null;
}

/** The states in which a van is on the road or at a counting table: a demo dispatch waits until none of the learner's vans is in one. */
export const CIT_BUSY: readonly CitStatus[] = ['EN_ROUTE', 'ARRIVED', 'IN_COUNT'];
const isManual = (o: CitOrder): boolean => o.id.includes('-M');

/** The learner's van still on its run (en route, arrived or in count), or null: the one mutex for every demo dispatch. */
export const citDemoBusy = (cit: CitSnapshot): CitRun | null => cit.runs.find((r) => r.run && isManual(r.run.order) && CIT_BUSY.includes(r.run.status))?.run ?? null;

/** The learner's van that has not settled yet: a paused bank plays it on its own until it does. */
export const citDemoOpen = (cit: CitSnapshot): CitRun | null => cit.runs.find((r) => r.run && isManual(r.run.order) && r.run.status !== 'SETTLED')?.run ?? null;

/** Which way cash crosses the vault's loading bay on a run: out of the vault into the van, or in from the van. */
export const bayFlow = (o: CitOrder): 'IN' | 'OUT' => (CIT_STRATEGIES[o.scenario].route(o.direction).from === 'VAULT' ? 'OUT' : 'IN');

/** How far through its stop at the vault's bay a run is at `minute`, 0-1, or null when the van is not at the bay (citCrew.ts walks the crew by it). */
export function bayProgress(p: CitPlanned, minute: number): number | null {
  const at = citSchedule(p);
  const [from, to] = bayFlow(p.order) === 'OUT' ? [at.EN_ROUTE, at.ARRIVED] : [at.IN_COUNT, at.SETTLED];
  return minute >= from && minute < to ? (minute - from) / (to - from) : null;
}

function snapshotOf(day: number, minute: number, extra: readonly CitPlanned[]): CitSnapshot {
  const plan = extra.length ? [...citDay(day), ...extra].sort((a, b) => a.start - b.start) : citDay(day);
  const runs = plan.map((planned) => ({ planned, run: runAt(planned, minute) }));
  const started = runs.filter((r): r is { planned: CitPlanned; run: CitRun } => r.run !== null);
  const active = [...started].reverse().find((r) => r.run.status !== 'SETTLED') ?? started[started.length - 1] ?? null;
  const journal = started.flatMap((r) => r.run.entries);
  let vaultFlow: VaultFlow = null;
  for (const { run } of started) {
    const { from, to } = CIT_STRATEGIES[run.order.scenario].route(run.order.direction);
    if (run.status === 'EN_ROUTE' && from === 'VAULT') vaultFlow = 'OUT';
    if ((run.status === 'IN_COUNT' || run.status === 'DELIVERED') && to === 'VAULT') vaultFlow = 'IN';
  }
  let bay: CitSnapshot['bay'] = null;
  for (const { planned } of runs) {
    const u = bayProgress(planned, minute);
    if (u !== null) bay = { id: planned.order.id, flow: bayFlow(planned.order), u };
  }
  return { runs, active, journal, book: bookAfter(journal), vaultFlow, bay };
}
