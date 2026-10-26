/**
 * Saving the living bank. What is kept is the state at the START of a day: which day it is, the rules in
 * force, the completed days' reports, and what the last night left behind (the suspense account and any
 * records the night team did not finish). Playing a day is deterministic, so that is all it takes to
 * come back to the same bank.
 *
 * Nothing read back is trusted. Every number is checked, every list is capped, and a report that does
 * not have exactly the shape the screen expects is dropped.
 */

import { isFlowId, isScope, type FlowId, type Scope } from '../types/viewport';
import type { CardType, Id } from '../types/processLearning';
import { emptyKpis } from '../sim/kpis';
import { clampRules, RULE_KEYS, type BankRules } from '../sim/rules';
import { isTermMode, type TermMode } from '../sim/terms';
import { DAY_EVENTS } from '../sim/traffic';
import type { CarryRecord, CarryState, DayEvent, DayReport, NightShiftReport, SuspenseItem } from '../sim/types';
import { STATION_IDS, type StationId } from '../sim/topology';
import {
  BADGES,
  EMPTY_CAREER,
  EMPTY_SHIFT_LOG,
  GL_IDS,
  journalBalanced,
  openingLedger,
  RETAIL_DESK,
  RETAIL_JOURNAL_CAP,
  RETAIL_SCENARIOS,
  RETAIL_SCENES,
  STAFF_ROLES,
  STAFF_SCENES,
  TASK_SCENES,
  type BadgeId,
  type CareerProgress,
  type GlAccount,
  type JournalEntry,
  type LedgerLine,
  type RetailLedger,
  type RetailScenarioId,
  type StaffCase,
  type StaffRoleId,
} from '../sim/staffRoleplay';
import { browserStorage, memoryStorage, STORAGE_VERSION, type KeyValueStorage } from './persistence';

export { browserStorage, memoryStorage };
export type { KeyValueStorage };

export const BANK_KEY = `processcraft:v${STORAGE_VERSION}:bank`;

export const MAX_SAVED_HISTORY = 30;
const MAX_SUSPENSE = 3000;
const MAX_BACKLOG = 4000;

export interface SavedBank {
  version: typeof STORAGE_VERSION;
  seed: number;
  /** The day the bank wakes up on. */
  day: number;
  rules: BankRules;
  history: DayReport[];
  carry: CarryState;
  savedAt: string;
}

export function encodeBank(bank: Omit<SavedBank, 'version' | 'savedAt'>, savedAt: string): string {
  const saved: SavedBank = { version: STORAGE_VERSION, ...bank, history: bank.history.slice(-MAX_SAVED_HISTORY), savedAt };
  return JSON.stringify(saved);
}

// ─────────────────────────────────────────────────────────────────────────────
// Checking what comes back
// ─────────────────────────────────────────────────────────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isCount = (v: unknown): v is number => isFiniteNumber(v) && Number.isInteger(v) && v >= 0 && v < 1e12;

const CARD_TYPES: readonly CardType[] = ['DEBIT', 'CREDIT', 'PREPAID', 'VIRTUAL_DPAN'];
const BACKLOG_PLACES: ReadonlyArray<CarryRecord['place']> = ['EOD_BATCH', 'EOD_VISA', 'RECON'];

/** True when `value` has exactly the numeric leaves `template` has. */
function sameNumericShape(template: unknown, value: unknown): boolean {
  if (typeof template === 'number') return isFiniteNumber(value);
  if (isObject(template)) {
    if (!isObject(value)) return false;
    return Object.keys(template).every((k) => sameNumericShape(template[k], value[k]));
  }
  return false;
}

function decodeReport(raw: unknown): DayReport | null {
  if (!isObject(raw) || !isCount(raw.day) || raw.day < 1) return null;
  if (!sameNumericShape(emptyKpis(), raw.kpis)) return null;
  const event = isObject(raw.event) && typeof raw.event.id === 'string' ? (DAY_EVENTS as Record<string, DayEvent>)[raw.event.id] : undefined;
  if (!event) return null;
  const close = raw.close;
  if (!isObject(close)) return null;
  const { suspenseCents, suspenseItems, reconBacklog, avgFatigue, maxFatigue, nightDoneMinute } = close;
  if (![suspenseCents, suspenseItems, reconBacklog, avgFatigue, maxFatigue].every(isFiniteNumber)) return null;
  if (nightDoneMinute !== null && !isFiniteNumber(nightDoneMinute)) return null;
  const rules = isObject(raw.rules) ? clampRules(pickRules(raw.rules)) : clampRules({});
  return {
    day: raw.day,
    event,
    rules,
    kpis: raw.kpis as DayReport['kpis'],
    close: {
      suspenseCents: suspenseCents as number,
      suspenseItems: suspenseItems as number,
      reconBacklog: reconBacklog as number,
      nightDoneMinute: nightDoneMinute as number | null,
      avgFatigue: avgFatigue as number,
      maxFatigue: maxFatigue as number,
    },
    ...(decodeNightShift(raw.nightShift) ? { nightShift: decodeNightShift(raw.nightShift) as NightShiftReport } : {}),
    ...(decodeBook(raw.book) ? { book: decodeBook(raw.book) as NonNullable<DayReport['book']> } : {}),
  };
}

/** The reserves and customer books of a saved report, or null when missing or malformed. */
function decodeBook(raw: unknown): DayReport['book'] | null {
  if (!isObject(raw)) return null;
  const keys = ['reservesStartCents', 'reservesEndCents', 'customersStart', 'signups', 'churned', 'customersEnd'] as const;
  if (!keys.every((key) => isFiniteNumber(raw[key]))) return null;
  return Object.fromEntries(keys.map((key) => [key, raw[key] as number])) as NonNullable<DayReport['book']>;
}

/** The night shift of a saved report, or null when it is missing (older saves) or not the right shape. */
function decodeNightShift(raw: unknown): NightShiftReport | null {
  if (!isObject(raw) || !Array.isArray(raw.crew) || !Array.isArray(raw.resting)) return null;
  if (![raw.records, raw.left, raw.completion].every(isFiniteNumber)) return null;
  if (raw.finishedAt !== null && !isFiniteNumber(raw.finishedAt)) return null;
  const crew = raw.crew.filter(
    (m): m is NightShiftReport['crew'][number] =>
      isObject(m) && typeof m.id === 'string' && typeof m.name === 'string' && typeof m.role === 'string' && typeof m.station === 'string' && (STATION_IDS as readonly string[]).includes(m.station) && [m.fatigue, m.productivity, m.items].every(isFiniteNumber),
  ).map((m) => ({ ...m, temp: m.temp === true }));
  if (crew.length !== raw.crew.length) return null;
  return {
    crew,
    resting: raw.resting.filter((n): n is string => typeof n === 'string'),
    records: raw.records as number,
    left: raw.left as number,
    completion: raw.completion as number,
    finishedAt: raw.finishedAt as number | null,
  };
}

function pickRules(raw: Record<string, unknown>): Partial<BankRules> {
  const out: Partial<BankRules> = {};
  for (const key of RULE_KEYS) {
    const v = raw[key];
    if (isFiniteNumber(v)) out[key] = v;
  }
  return out;
}

function decodeSuspense(raw: unknown): SuspenseItem | null {
  if (!isObject(raw)) return null;
  const { id, amountCents, reason, day } = raw;
  if (typeof id !== 'string' || id.length === 0 || id.length > 80 || !isCount(amountCents) || typeof reason !== 'string' || !isCount(day) || day < 1) return null;
  return { id: id as Id, amountCents, reason: reason.slice(0, 80), day };
}

function decodeBacklog(raw: unknown): CarryRecord | null {
  if (!isObject(raw)) return null;
  const { txId, cardType, amountCents, heldCents, bornDay, place } = raw;
  if (typeof txId !== 'string' || txId.length === 0 || txId.length > 80) return null;
  if (!CARD_TYPES.includes(cardType as CardType) || !isCount(amountCents) || !isCount(heldCents) || !isCount(bornDay) || bornDay < 1) return null;
  if (!BACKLOG_PLACES.includes(place as CarryRecord['place'])) return null;
  return { txId: txId as Id, cardType: cardType as CardType, amountCents, heldCents, bornDay, place: place as CarryRecord['place'] };
}

export function decodeBank(raw: string | null): SavedBank | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(parsed) || parsed.version !== STORAGE_VERSION) return null;
  if (!isCount(parsed.seed) || !isCount(parsed.day) || parsed.day < 1 || parsed.day > 100_000) return null;

  const history = Array.isArray(parsed.history) ? parsed.history.map(decodeReport).filter((r): r is DayReport => r !== null).slice(-MAX_SAVED_HISTORY) : [];
  const carryRaw = isObject(parsed.carry) ? parsed.carry : {};
  const suspense = Array.isArray(carryRaw.suspense) ? carryRaw.suspense.slice(0, MAX_SUSPENSE).map(decodeSuspense).filter((x): x is SuspenseItem => x !== null) : [];
  const backlog = Array.isArray(carryRaw.backlog) ? carryRaw.backlog.slice(0, MAX_BACKLOG).map(decodeBacklog).filter((x): x is CarryRecord => x !== null) : [];

  return {
    version: STORAGE_VERSION,
    seed: parsed.seed,
    day: parsed.day,
    rules: isObject(parsed.rules) ? clampRules(pickRules(parsed.rules)) : clampRules({}),
    history,
    carry: { suspense, backlog },
    savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt.slice(0, 40) : '',
  };
}

export function loadBank(storage: KeyValueStorage | null): SavedBank | null {
  try {
    return storage ? decodeBank(storage.getItem(BANK_KEY)) : null;
  } catch {
    return null;
  }
}

export type BankSaveResult = 'saved' | 'unavailable' | 'error';

export function saveBank(storage: KeyValueStorage | null, bank: Omit<SavedBank, 'version' | 'savedAt'>, now: () => Date): BankSaveResult {
  if (!storage) return 'unavailable';
  try {
    storage.setItem(BANK_KEY, encodeBank(bank, now().toISOString()));
    return 'saved';
  } catch {
    return 'error';
  }
}

export function clearBank(storage: KeyValueStorage | null): void {
  try {
    storage?.removeItem(BANK_KEY);
  } catch {
    // Nothing to do: if storage is unreachable there is nothing saved to forget.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Preferences: how the learner likes to look at the bank
// ─────────────────────────────────────────────────────────────────────────────

/** The two ways to look at the same bank: the 2D blueprint map, or the 3D isometric office. */
export type ViewMode = '2d' | '3d';

export const isViewMode = (v: unknown): v is ViewMode => v === '2d' || v === '3d';

export interface BankPrefs {
  /** Fintech Expert or Concept Explorer (plain-English) names. */
  terms: TermMode;
  view: ViewMode;
}

export const PREFS_KEY = `processcraft:v${STORAGE_VERSION}:prefs`;

export const DEFAULT_PREFS: BankPrefs = { terms: 'expert', view: '2d' };

/** Anything that is not a known choice falls back to the default for that choice alone. */
export function decodePrefs(raw: string | null): BankPrefs {
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return { ...DEFAULT_PREFS };
    return {
      terms: isTermMode(parsed.terms) ? parsed.terms : DEFAULT_PREFS.terms,
      view: isViewMode(parsed.view) ? parsed.view : DEFAULT_PREFS.view,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function loadPrefs(storage: KeyValueStorage | null): BankPrefs {
  try {
    return decodePrefs(storage ? storage.getItem(PREFS_KEY) : null);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(storage: KeyValueStorage | null, prefs: BankPrefs): void {
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Remembering a preference is a nicety.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout preferences: the 3D label density and how wide the inspector drawer is
// ─────────────────────────────────────────────────────────────────────────────

/** Floating name badges over the 3D workstations: always on, or only for the workstation under the pointer. */
export type LabelMode = 'always' | 'hover';

export const isLabelMode = (v: unknown): v is LabelMode => v === 'always' || v === 'hover';

/** The inspector drawer may be dragged between these widths (pixels). It opens at the default. */
export const INSPECTOR_WIDTH = { min: 360, max: 600, default: 396 } as const;

export const clampInspectorWidth = (px: number): number => (Number.isFinite(px) ? Math.min(INSPECTOR_WIDTH.max, Math.max(INSPECTOR_WIDTH.min, Math.round(px))) : INSPECTOR_WIDTH.default);

export interface UiPrefs {
  labels: LabelMode;
  inspectorWidth: number;
  /** Beginner (one guided flow lit) or Advanced (the whole bank). */
  scope: Scope;
  /** The guided flow last picked in the Beginner scope. */
  flow: FlowId;
}

export const UI_PREFS_KEY = `processcraft:v${STORAGE_VERSION}:ui`;

export const DEFAULT_UI_PREFS: UiPrefs = { labels: 'always', inspectorWidth: INSPECTOR_WIDTH.default, scope: 'advanced', flow: 1 };

/** Anything that is not a known choice falls back to the default for that choice alone. */
export function decodeUiPrefs(raw: string | null): UiPrefs {
  if (!raw) return { ...DEFAULT_UI_PREFS };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return { ...DEFAULT_UI_PREFS };
    return {
      labels: isLabelMode(parsed.labels) ? parsed.labels : DEFAULT_UI_PREFS.labels,
      inspectorWidth: typeof parsed.inspectorWidth === 'number' ? clampInspectorWidth(parsed.inspectorWidth) : DEFAULT_UI_PREFS.inspectorWidth,
      scope: isScope(parsed.scope) ? parsed.scope : DEFAULT_UI_PREFS.scope,
      flow: isFlowId(parsed.flow) ? parsed.flow : DEFAULT_UI_PREFS.flow,
    };
  } catch {
    return { ...DEFAULT_UI_PREFS };
  }
}

export function loadUiPrefs(storage: KeyValueStorage | null): UiPrefs {
  try {
    return decodeUiPrefs(storage ? storage.getItem(UI_PREFS_KEY) : null);
  } catch {
    return { ...DEFAULT_UI_PREFS };
  }
}

export function saveUiPrefs(storage: KeyValueStorage | null, prefs: UiPrefs): void {
  try {
    storage?.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Remembering a preference is a nicety.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Career: lifetime XP, badges and the streaks that lead to them
// ─────────────────────────────────────────────────────────────────────────────

export const CAREER_KEY = `processcraft:v${STORAGE_VERSION}:career`;

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

export function decodeCareer(raw: string | null): CareerProgress {
  if (!raw) return EMPTY_CAREER;
  try {
    const o = JSON.parse(raw) as Partial<Record<keyof CareerProgress, unknown>>;
    const badges = Array.isArray(o.badges) ? BADGES.filter((b) => (o.badges as unknown[]).includes(b)) : [];
    const sh = (o.shift && typeof o.shift === 'object' ? o.shift : {}) as Record<string, unknown>;
    return {
      xp: count(o.xp),
      badges: badges as BadgeId[],
      ekycStreak: count(o.ekycStreak),
      perfectExpertShifts: count(o.perfectExpertShifts),
      shift: {
        reviews: count(sh.reviews),
        correct: count(sh.correct),
        latencySumSec: typeof sh.latencySumSec === 'number' && sh.latencySumSec >= 0 ? sh.latencySumSec : 0,
        allExpert: sh.allExpert === undefined ? EMPTY_SHIFT_LOG.allExpert : sh.allExpert === true,
        amlBlockRun: count(sh.amlBlockRun),
        amlBlockBest: count(sh.amlBlockBest),
      },
    };
  } catch {
    return EMPTY_CAREER;
  }
}

export function loadCareer(storage: KeyValueStorage | null): CareerProgress {
  try {
    return decodeCareer(storage ? storage.getItem(CAREER_KEY) : null);
  } catch {
    return EMPTY_CAREER;
  }
}

export function saveCareer(storage: KeyValueStorage | null, career: CareerProgress): void {
  try {
    storage?.setItem(CAREER_KEY, JSON.stringify(career));
  } catch {
    // A lost badge is a pity, not an error.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Retail core ledger: account balances and the latest journals
// ─────────────────────────────────────────────────────────────────────────────

export const RETAIL_LEDGER_KEY = `processcraft:v${STORAGE_VERSION}:retailLedger`;

const cents = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) ? v : null);

function decodeLine(v: unknown): LedgerLine | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const dr = cents(o.dr);
  const cr = cents(o.cr);
  if (!GL_IDS.includes(o.gl as GlAccount) || dr === null || cr === null || dr < 0 || cr < 0) return null;
  return { gl: o.gl as GlAccount, dr, cr };
}

const SCENES: ReadonlySet<string> = new Set<string>([...STAFF_SCENES, ...TASK_SCENES, ...RETAIL_SCENES]);

/** The role and scene of a journal; a Phase 10 entry only named its retail scenario, so its desk is looked up. */
function sourceOf(o: Record<string, unknown>): { role: StaffRoleId; scene: StaffCase['scene'] } | null {
  if (STAFF_ROLES.includes(o.role as StaffRoleId) && SCENES.has(o.scene as string)) return { role: o.role as StaffRoleId, scene: o.scene as StaffCase['scene'] };
  const legacy = o.scenario as RetailScenarioId;
  if (!RETAIL_SCENARIOS.includes(legacy)) return null;
  const role = STAFF_ROLES.find((r) => RETAIL_DESK[r].includes(legacy));
  return role ? { role, scene: `retail_${legacy}` } : null;
}

function decodeJournal(v: unknown): JournalEntry | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const source = sourceOf(o);
  if (typeof o.caseId !== 'string' || typeof o.statusCode !== 'string' || !source) return null;
  if (o.decision !== 'APPROVE' && o.decision !== 'REJECT') return null;
  if (!Array.isArray(o.lines)) return null;
  const lines = o.lines.map(decodeLine);
  if (lines.some((l) => l === null) || !journalBalanced(lines as LedgerLine[])) return null;
  const stamp = {
    ...(typeof o.station === 'string' && (STATION_IDS as readonly string[]).includes(o.station) ? { station: o.station as StationId } : {}),
    ...(typeof o.at === 'string' && !Number.isNaN(Date.parse(o.at)) ? { at: o.at } : {}),
  };
  return { caseId: o.caseId, ...source, decision: o.decision, statusCode: o.statusCode, lines: lines as LedgerLine[], ...stamp };
}

/**
 * Reads the ledger back. Books that do not sum to zero cannot be trusted, so they restart from the opening balances; that
 * includes books saved before an account was retired from the chart (Phase 11 moved the waterfall onto revenue accounts).
 */
export function decodeRetailLedger(raw: string | null): RetailLedger {
  if (!raw) return openingLedger();
  try {
    const o = JSON.parse(raw) as Partial<Record<keyof RetailLedger, unknown>>;
    const src = (o.balances && typeof o.balances === 'object' ? o.balances : {}) as Record<string, unknown>;
    const balances = Object.fromEntries(GL_IDS.map((gl) => [gl, cents(src[gl]) ?? 0])) as Record<GlAccount, number>;
    if (GL_IDS.reduce((s, gl) => s + balances[gl], 0) !== 0) return openingLedger();
    const journal = (Array.isArray(o.journal) ? o.journal : [])
      .slice(0, RETAIL_JOURNAL_CAP)
      .map(decodeJournal)
      .filter((j): j is JournalEntry => j !== null);
    return { balances, journal, posted: count(o.posted), settledVolume: count(o.settledVolume) };
  } catch {
    return openingLedger();
  }
}

export function loadRetailLedger(storage: KeyValueStorage | null): RetailLedger {
  try {
    return decodeRetailLedger(storage ? storage.getItem(RETAIL_LEDGER_KEY) : null);
  } catch {
    return openingLedger();
  }
}

export function saveRetailLedger(storage: KeyValueStorage | null, ledger: RetailLedger): void {
  try {
    storage?.setItem(RETAIL_LEDGER_KEY, JSON.stringify(ledger));
  } catch {
    // The books reopen at their opening balances.
  }
}
