/**
 * Anti-money-laundering screening: the maths behind the AML nodes.
 *
 * Three questions a bank asks about a payment, in the order it asks them:
 *   1. Is the customer on a sanctions list (OFAC) or a list of politically exposed persons (PEP)?  Fuzzy name matching.
 *   2. Is the customer cutting cash into pieces just under the reporting line?                     Structuring.
 *   3. If a name matched, is it the same person?                                                  Investigation.
 *
 * Name matching is fuzzy on purpose: lists transliterate names, so "Aleksandr" and "Alexander" must score high. The
 * price is false positives, which is why step 3 exists. Everything is pure and deterministic.
 */

import type { AmlContext, AuditEvent, CustomerProfile, MinorUnits, WatchlistEntry } from '../types/processLearning';

// ─────────────────────────────────────────────────────────────────────────────
// Names
// ─────────────────────────────────────────────────────────────────────────────

/** Lower case, accents removed, punctuation gone, single spaces: "Nguyễn  Văn-An" becomes "nguyen van an". */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min((prev[j] as number) + 1, (cur[j - 1] as number) + 1, (prev[j - 1] as number) + cost);
    }
    prev = cur;
  }
  return prev[b.length] as number;
}

/**
 * Jaro-Winkler similarity, 0 to 1. The standard measure for matching names: it forgives the small slips transliteration
 * makes ("Alexander" and "Aleksandr" score 0.90) and rewards a shared beginning, which is where names agree most.
 */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const matchedA: boolean[] = new Array<boolean>(a.length).fill(false);
  const matchedB: boolean[] = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - window);
    const hi = Math.min(b.length - 1, i + window);
    for (let j = lo; j <= hi; j++) {
      if (matchedB[j] || a[i] !== b[j]) continue;
      matchedA[i] = true;
      matchedB[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let half = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!matchedA[i]) continue;
    while (!matchedB[k]) k++;
    if (a[i] !== b[k]) half++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - half / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** 0 to 1: how alike two single words are. An initial ("a") matches any word that starts with it, at a discount. */
export function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if ((a.length === 1 || b.length === 1) && (a.startsWith(b) || b.startsWith(a))) return 0.7;
  return jaroWinkler(a, b);
}

/**
 * 0 to 100: how alike two names are. Words are paired off best-first, so the order they are written in does not matter
 * ("Petrov Aleksandr" is "Aleksandr Petrov"); a word with no partner counts against the score. It is the Dice
 * coefficient on letters: 100 means identical after normalising.
 */
export function nameSimilarity(a: string, b: string): number {
  const ta = normalizeName(a).split(' ').filter(Boolean);
  const tb = normalizeName(b).split(' ').filter(Boolean);
  if (ta.length === 0 || tb.length === 0) return 0;

  const pairs: Array<{ i: number; j: number; sim: number }> = [];
  ta.forEach((x, i) => tb.forEach((y, j) => pairs.push({ i, j, sim: tokenSimilarity(x, y) })));
  pairs.sort((p, q) => q.sim - p.sim || p.i - q.i || p.j - q.j);

  const usedA = new Set<number>();
  const usedB = new Set<number>();
  let matched = 0;
  for (const p of pairs) {
    if (usedA.has(p.i) || usedB.has(p.j)) continue;
    usedA.add(p.i);
    usedB.add(p.j);
    matched += p.sim * Math.min((ta[p.i] as string).length, (tb[p.j] as string).length);
  }
  const total = ta.reduce((n, t) => n + t.length, 0) + tb.reduce((n, t) => n + t.length, 0);
  return Math.round((200 * matched) / total);
}

export interface WatchlistMatch {
  entry: WatchlistEntry;
  /** 0 to 100. */
  score: number;
}

/** The closest name on the lists, or null when the lists are empty. A tie goes to the sanctions list: it is the more serious. */
export function bestWatchlistMatch(name: string, watchlist: readonly WatchlistEntry[]): WatchlistMatch | null {
  let best: WatchlistMatch | null = null;
  for (const entry of watchlist) {
    const score = nameSimilarity(name, entry.name);
    if (!best || score > best.score || (score === best.score && entry.list === 'OFAC' && best.entry.list !== 'OFAC')) best = { entry, score };
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Structuring
// ─────────────────────────────────────────────────────────────────────────────

/** A deposit counts as "just under the line" when it is at least this share of the reporting threshold. */
export const NEAR_THRESHOLD_PCT = 80;

export interface StructuringResult {
  suspected: boolean;
  /** The deposits that sit just under the reporting threshold. */
  nearThreshold: MinorUnits[];
  /** Sum of those deposits. */
  total: MinorUnits;
}

/**
 * Structuring (also called smurfing) is splitting cash into deposits that each stay under the reporting threshold so
 * that none is reported. The pattern: several deposits just under the line whose sum is over it.
 */
export function detectStructuring(deposits: readonly MinorUnits[], thresholdMinor: MinorUnits, minDeposits: number): StructuringResult {
  const floor = (thresholdMinor * NEAR_THRESHOLD_PCT) / 100;
  const nearThreshold = deposits.filter((d) => d >= floor && d < thresholdMinor);
  const total = nearThreshold.reduce((n, d) => n + d, 0);
  return { suspected: nearThreshold.length >= minDeposits && total >= thresholdMinor, nearThreshold, total };
}

// ─────────────────────────────────────────────────────────────────────────────
// Screening
// ─────────────────────────────────────────────────────────────────────────────

export interface ScreeningPolicy {
  /** Name-match score from which a name counts as a hit. */
  matchThreshold: number;
  reportingThresholdMinor: MinorUnits;
  minStructuringDeposits: number;
}

export interface ScreeningResult {
  status: 'CLEAR' | 'STRUCTURING' | 'PEP_HIT' | 'SANCTION_HIT';
  /** Best score on any list, 0 when the lists are empty. */
  score: number;
  /** The list of the best match when it reached the threshold, otherwise NONE. */
  list: 'NONE' | 'OFAC' | 'PEP';
  best: WatchlistMatch | null;
  structuring: StructuringResult;
}

/** The most serious finding wins the status: a sanctions hit, then a PEP hit, then structuring. */
export function screen(aml: Readonly<AmlContext>, policy: ScreeningPolicy): ScreeningResult {
  const best = bestWatchlistMatch(aml.customer.name, aml.watchlist);
  const hit = best !== null && best.score >= policy.matchThreshold;
  const list = hit && best ? best.entry.list : 'NONE';
  const structuring = detectStructuring(aml.cashDeposits, policy.reportingThresholdMinor, policy.minStructuringDeposits);
  const status = list === 'OFAC' ? 'SANCTION_HIT' : list === 'PEP' ? 'PEP_HIT' : structuring.suspected ? 'STRUCTURING' : 'CLEAR';
  return { status, score: best?.score ?? 0, list, best, structuring };
}

// ─────────────────────────────────────────────────────────────────────────────
// Investigation
// ─────────────────────────────────────────────────────────────────────────────

export type Agreement = 'MATCH' | 'MISMATCH' | 'UNKNOWN';
export type CaseVerdict = 'FALSE_POSITIVE' | 'TRUE_MATCH' | 'INCONCLUSIVE';

export interface Investigation {
  verdict: CaseVerdict;
  /** Identity events in the audit log that could be set against the listed person. */
  evidence: AuditEvent[];
  dateOfBirth: Agreement;
  nationality: Agreement;
  /** Plain-English steps of the reasoning, for the execution trace. */
  reasons: string[];
}

const IDENTITY_EVENTS: ReadonlySet<AuditEvent['kind']> = new Set(['KYC_VERIFIED', 'ID_DOCUMENT_SCANNED']);

const agree = (known: readonly string[], listed: string): Agreement => (known.length === 0 ? 'UNKNOWN' : known.every((k) => k === listed) ? 'MATCH' : 'MISMATCH');

/**
 * Is the customer the person on the list? The profile alone is not proof, because anyone can type a date of birth, so the
 * comparison uses only what the audit log says was verified from a document. A verdict needs that evidence:
 *   same date of birth and not a different nationality      -> TRUE_MATCH
 *   different date of birth and not the same nationality    -> FALSE_POSITIVE
 *   no identity evidence, conflicting evidence, or mixed signals -> INCONCLUSIVE (escalate, do not guess)
 */
export function investigate(customer: Readonly<CustomerProfile>, listed: Readonly<WatchlistEntry> | null, auditLog: readonly AuditEvent[]): Investigation {
  if (!listed) {
    return { verdict: 'INCONCLUSIVE', evidence: [], dateOfBirth: 'UNKNOWN', nationality: 'UNKNOWN', reasons: ['There is no listed person to compare against.'] };
  }
  const evidence = auditLog.filter((e) => IDENTITY_EVENTS.has(e.kind) && (e.dateOfBirth !== undefined || e.nationality !== undefined));
  const dobs = [...new Set(evidence.flatMap((e) => (e.dateOfBirth ? [e.dateOfBirth] : [])))];
  const nats = [...new Set(evidence.flatMap((e) => (e.nationality ? [e.nationality] : [])))];
  const dateOfBirth = agree(dobs, listed.dateOfBirth);
  const nationality = agree(nats, listed.country);
  const reasons: string[] = [];

  if (evidence.length === 0) {
    reasons.push('The audit log holds no verified identity document, so nothing independent can be compared with the listed person.');
    return { verdict: 'INCONCLUSIVE', evidence, dateOfBirth, nationality, reasons };
  }
  reasons.push(`${evidence.length} verified identity ${evidence.length === 1 ? 'event' : 'events'} in the audit log.`);
  if (dobs.length > 1 || nats.length > 1) {
    reasons.push('The verified documents disagree with each other, so the record cannot be trusted either way.');
    return { verdict: 'INCONCLUSIVE', evidence, dateOfBirth, nationality, reasons };
  }
  if (dobs.length === 1 && dobs[0] !== customer.dateOfBirth) {
    reasons.push(`The profile says ${customer.dateOfBirth} but the verified document says ${dobs[0]}; the document wins.`);
  }
  reasons.push(
    `Date of birth ${dobs[0] ?? 'unknown'} against ${listed.dateOfBirth} on the list: ${dateOfBirth.toLowerCase()}.`,
    `Nationality ${nats[0] ?? 'unknown'} against ${listed.country} on the list: ${nationality.toLowerCase()}.`,
  );

  let verdict: CaseVerdict = 'INCONCLUSIVE';
  if (dateOfBirth === 'MATCH' && nationality !== 'MISMATCH') verdict = 'TRUE_MATCH';
  else if (dateOfBirth === 'MISMATCH' && nationality !== 'MATCH') verdict = 'FALSE_POSITIVE';
  return { verdict, evidence, dateOfBirth, nationality, reasons };
}
