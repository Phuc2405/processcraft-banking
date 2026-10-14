/**
 * The Academy split view's catalog: six chapters, each a short run of levels. A level is one step of a payment story, and it
 * points at the node of the Living Bank where that step happens, so choosing it can light and focus that node.
 *
 * A level with a `flow` borrows the Phase 1 guided flow (GUIDED_FLOWS) of that number: the flow is lit, the rest of the bank
 * fades, and `node` names the step inside it. A level with `flow: null` happens at a desk no guided flow covers (the BNPL desk,
 * the A2A gate), so it is shown in the Advanced scope with just its own desk highlighted.
 *
 * Pure data and pure functions, shared by the store, the panel and the tests.
 */

import type { FlowId } from '../types/viewport';
import { flowPlaces, GUIDED_FLOWS, type FlowNodeId, type FlowStep } from './guidedFlows';
import type { PlaceId } from './topology';

export const CHAPTER_IDS = [1, 2, 3, 4, 5, 6] as const;
export type ChapterId = (typeof CHAPTER_IDS)[number];
export const isChapterId = (v: unknown): v is ChapterId => typeof v === 'number' && (CHAPTER_IDS as readonly number[]).includes(v);

/** "2.3": chapter 2, level 3. */
export type LevelId = string;

export interface AcademyLevel {
  id: LevelId;
  chapter: ChapterId;
  title: string;
  /** What the learner should take away, in one or two plain sentences. */
  goal: string;
  /** The Phase 1 guided flow this level lights, or null when no guided flow covers its desk. */
  flow: FlowId | null;
  /** The step of that flow (its logical node). Null exactly when `flow` is null. */
  node: FlowNodeId | null;
  /** The place on the map the camera and the highlight go to. */
  place: PlaceId;
}

export interface AcademyChapter {
  id: ChapterId;
  title: string;
  /** What the chapter covers, as the brief words it. */
  topic: string;
  accent: string;
  /** The flow the chapter lights when it is opened before any level is chosen. Null in the Advanced scope. */
  flow: FlowId | null;
  levels: readonly AcademyLevel[];
}

type LevelInput = Omit<AcademyLevel, 'id' | 'chapter'>;

const chapter = (id: ChapterId, title: string, topic: string, accent: string, flow: FlowId | null, levels: readonly LevelInput[]): AcademyChapter => ({
  id,
  title,
  topic,
  accent,
  flow,
  levels: levels.map((l, i) => ({ ...l, id: `${id}.${i + 1}`, chapter: id })),
});

export const ACADEMY_CHAPTERS: readonly AcademyChapter[] = [
  chapter(1, 'First Swipes', 'POS & NSF declined flows', '#a3e635', 1, [
    { title: 'Tap at the terminal', goal: 'A card tap becomes a message to the bank. Nothing is spent yet: the shop is only asking.', flow: 1, node: 'pos_terminal', place: 'GATE_POS' },
    { title: 'Check and hold the money', goal: 'The bank looks at the available balance and, if it is enough, sets the amount aside for the shop.', flow: 1, node: 'casa_desk', place: 'LEDGER_DEBIT' },
    { title: 'Approved', goal: 'Enough money: the terminal gets the approval and the customer walks out with their coffee.', flow: 1, node: 'auth_engine', place: 'OUT_APPROVED' },
    { title: 'Declined for NSF', goal: 'Not enough money (NSF, response code 51): the same desk answers Declined and nothing is held.', flow: 1, node: 'auth_engine', place: 'OUT_DECLINED' },
  ]),
  chapter(2, 'Virtual Card & 3DS Routing', 'Web checkout, tokenization, OTP', '#a78bfa', 2, [
    { title: 'The checkout arrives', goal: 'An online payment has no card in hand, so the bank has to be more careful about who is really paying.', flow: 2, node: 'web_checkout', place: 'GATE_ECOM' },
    { title: 'Tokenization and dCVV', goal: 'The shop only ever sees a stand-in card number. The vault swaps it for the real one and checks the changing security code.', flow: 2, node: 'token_vault', place: 'SEC_VAULT' },
    { title: '3DS risk routing', goal: 'Low risk goes straight through, medium risk is asked for proof, high risk is turned away.', flow: 2, node: 'fraud_desk', place: 'SEC_3DS' },
    { title: 'The OTP challenge', goal: 'The customer types the code texted to their phone. A completed challenge moves the fraud liability to the bank.', flow: 2, node: 'otp_service', place: 'CUSTOMER_OTP' },
  ]),
  chapter(3, 'Card-Testing & Fraud Detection', 'Velocity rules, risk scores', '#fb7185', 2, [
    { title: 'Spot the probe', goal: 'Card-testers fire many tiny payments to find a live card. A velocity rule counts attempts per card in a short window.', flow: 2, node: 'web_checkout', place: 'GATE_ECOM' },
    { title: 'Score the risk', goal: 'Each attempt gets a risk score from its device, speed and history. The score decides between pass, challenge and reject.', flow: 2, node: 'fraud_desk', place: 'SEC_3DS' },
    { title: 'Block and decline', goal: 'A rejected attempt ends at the Declined tally, with no hold on the account, and the pattern is kept for the next rule.', flow: 2, node: 'auth_engine', place: 'OUT_DECLINED' },
  ]),
  chapter(4, 'BNPL & Installment Approvals', 'Underwriting & credit checks', '#f472b6', null, [
    { title: 'The plan request', goal: 'At checkout the customer picks Pay-in-4 instead of paying all at once. The request goes to underwriting, not to the card network.', flow: null, node: null, place: 'GATE_ECOM' },
    { title: 'Underwriting', goal: 'The desk reads the customer’s underwriting score and decides whether a four-instalment plan can be offered, and the down payment.', flow: null, node: null, place: 'BNPL' },
    { title: 'Credit check and down payment', goal: 'The first instalment is taken from the account or the credit line. If the check says no, the card is the fallback.', flow: null, node: null, place: 'LEDGER_CREDIT' },
  ]),
  chapter(5, 'Account-to-Account & ISO 20022', 'CDM cash-in & liquidity', '#38bdf8', 3, [
    { title: 'An instant transfer arrives', goal: 'A bank-to-bank transfer comes in as a pacs.008 message. The gate checks the message is well formed before any money moves.', flow: null, node: null, place: 'GATE_A2A' },
    { title: 'Cash in at the CDM', goal: 'The customer puts their card and PIN into the sidewalk machine to pay cash into their account.', flow: 3, node: 'cdm_kiosk', place: 'GATE_ATM' },
    { title: 'Count and liquidity', goal: 'The machine counts and checks the notes. The cash joins the machine’s cassette, which is the bank’s cash on the street.', flow: 3, node: 'cash_sorter', place: 'ATM_CASH' },
    { title: 'Credit to the account', goal: 'The account is credited at once while the cash sits in the machine: one posting moves the money from cash to the customer.', flow: 3, node: 'casa_desk', place: 'LEDGER_DEBIT' },
  ]),
  chapter(6, 'Overnight EOD Clearing & Settlement', 'Core banking GL postings', '#fbbf24', 4, [
    { title: 'Approved today', goal: 'Every payment approved during the day is only a promise. They wait for the night run.', flow: 4, node: 'batch_processor', place: 'OUT_APPROVED' },
    { title: 'Batch clearing', goal: 'At 23:00 the day’s payments are packed into one clearing file.', flow: 4, node: 'clearing_house', place: 'EOD_BATCH' },
    { title: 'Scheme settlement', goal: 'Visa nets out who owes whom, the money moves, and the holds are turned into real postings in the ledger.', flow: 4, node: 'settlement_desk', place: 'EOD_VISA' },
    { title: '3-way reconciliation', goal: 'Ledger, clearing file and switch must agree. A match is settled; a break waits in the suspense account for a person.', flow: 4, node: 'reconciliation_desk', place: 'RECON' },
  ]),
];

export const ACADEMY_LEVELS: readonly AcademyLevel[] = ACADEMY_CHAPTERS.flatMap((c) => c.levels);
export const LESSON_COUNT = ACADEMY_LEVELS.length;

const CHAPTER_BY_ID = new Map<ChapterId, AcademyChapter>(ACADEMY_CHAPTERS.map((c) => [c.id, c]));
const LEVEL_BY_ID = new Map<LevelId, AcademyLevel>(ACADEMY_LEVELS.map((l) => [l.id, l]));

export const chapterById = (id: ChapterId): AcademyChapter => CHAPTER_BY_ID.get(id) as AcademyChapter;
export const levelById = (id: LevelId | null): AcademyLevel | null => (id === null ? null : (LEVEL_BY_ID.get(id) ?? null));

/** The level after this one in the whole course, or null after the last. */
export function nextLevel(id: LevelId): AcademyLevel | null {
  const i = ACADEMY_LEVELS.findIndex((l) => l.id === id);
  return i >= 0 ? (ACADEMY_LEVELS[i + 1] ?? null) : null;
}

/** The step of the guided flow a level stands for, for its wording. Null for a level outside the guided flows. */
export function flowStepOf(level: AcademyLevel): FlowStep | null {
  if (level.flow === null || level.node === null) return null;
  return GUIDED_FLOWS[level.flow].steps.find((s) => s.node === level.node) ?? null;
}

/** True when a level's flow, node and place agree with the Phase 1 mapping. */
export function levelMatchesFlow(level: AcademyLevel): boolean {
  if (level.flow === null || level.node === null) return level.flow === null && level.node === null;
  const step = flowStepOf(level);
  return step !== null && step.places.includes(level.place) && flowPlaces(level.flow).has(level.place);
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress
// ─────────────────────────────────────────────────────────────────────────────

export type ChapterStatus = 'not-started' | 'in-progress' | 'completed';

export const CHAPTER_STATUS_BADGE: Record<ChapterStatus, string> = {
  'not-started': '[Not Started]',
  'in-progress': '[In Progress]',
  completed: '[Completed ✓]',
};

/** How far a chapter is: all its levels done, any done or opened, or none. */
export function chapterStatus(c: AcademyChapter, completed: Readonly<Record<string, true>>, started: Readonly<Record<string, true>>): ChapterStatus {
  const done = c.levels.filter((l) => completed[l.id]).length;
  if (done === c.levels.length) return 'completed';
  return done > 0 || c.levels.some((l) => started[l.id]) ? 'in-progress' : 'not-started';
}
