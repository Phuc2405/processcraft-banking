/**
 * Colours, categories and worker personas shared by the node components, the palette and the minimap.
 * Tailwind only generates classes it can see as whole strings, so every class below is written out in full.
 */

import type { NodeRunStatus } from '../../store/liveSimulation';
import type { BankingCapability, NodeType, Outcome } from '../../types/processLearning';

export type NodeCategory = 'EVENT' | 'ROUTING' | 'VAULT' | 'AUTH' | 'LEDGER' | 'RECON' | 'CREDIT' | 'NETWORK' | 'COMPLIANCE' | 'DISPUTE';

export interface CategoryTheme {
  label: string;
  /** Hex, for SVG strokes, handles and the minimap. */
  accent: string;
  /** Classes for the small category badge in a node header or palette row. */
  badge: string;
}

export const CATEGORY_THEME: Record<NodeCategory, CategoryTheme> = {
  EVENT: { label: 'Event', accent: '#a3e635', badge: 'bg-lime-400/10 text-lime-300 ring-lime-400/30' },
  ROUTING: { label: 'Routing', accent: '#818cf8', badge: 'bg-indigo-400/10 text-indigo-300 ring-indigo-400/30' },
  VAULT: { label: 'Tokenisation', accent: '#22d3ee', badge: 'bg-cyan-400/10 text-cyan-300 ring-cyan-400/30' },
  AUTH: { label: 'Authentication', accent: '#a78bfa', badge: 'bg-violet-400/10 text-violet-300 ring-violet-400/30' },
  LEDGER: { label: 'Ledger', accent: '#34d399', badge: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/30' },
  RECON: { label: 'Reconciliation', accent: '#fbbf24', badge: 'bg-amber-400/10 text-amber-300 ring-amber-400/30' },
  CREDIT: { label: 'Credit', accent: '#f472b6', badge: 'bg-pink-400/10 text-pink-300 ring-pink-400/30' },
  NETWORK: { label: 'Payment network', accent: '#2dd4bf', badge: 'bg-teal-400/10 text-teal-300 ring-teal-400/30' },
  COMPLIANCE: { label: 'Compliance', accent: '#fb923c', badge: 'bg-orange-400/10 text-orange-300 ring-orange-400/30' },
  DISPUTE: { label: 'Disputes', accent: '#f87171', badge: 'bg-red-400/10 text-red-300 ring-red-400/30' },
};

const CAPABILITY_CATEGORY: Record<BankingCapability, NodeCategory> = {
  TOKEN_VAULT: 'VAULT',
  DCVV_VERIFIER: 'AUTH',
  THREE_DS_EVALUATOR: 'AUTH',
  CORE_LEDGER_CHECK: 'LEDGER',
  RECON_DESK: 'RECON',
  BNPL_UNDERWRITER: 'CREDIT',
  A2A_GATEWAY: 'NETWORK',
  AML_SCREENING: 'COMPLIANCE',
  CASE_INVESTIGATION: 'COMPLIANCE',
  CHARGEBACK_DESK: 'DISPUTE',
};

export function categoryOf(node: { type: NodeType; bankingCapability: BankingCapability | null }): NodeCategory {
  if (node.bankingCapability) return CAPABILITY_CATEGORY[node.bankingCapability];
  return node.type === 'GATEWAY_XOR' || node.type === 'GATEWAY_AND' ? 'ROUTING' : 'EVENT';
}

// ─────────────────────────────────────────────────────────────────────────────
// The people behind the desks
// ─────────────────────────────────────────────────────────────────────────────

export type Accessory = 'glasses' | 'tie' | 'headset' | 'badge';

export interface WorkerProfile {
  /** Job title shown under the avatar. */
  role: string;
  /** Short line about the desk, used as a tooltip. */
  desk: string;
  skin: string;
  hair: string;
  shirt: string;
  accessory: Accessory;
}

export const WORKER_PROFILE: Record<BankingCapability, WorkerProfile> = {
  TOKEN_VAULT: { role: 'Vault Clerk', desk: 'Token vault terminal', skin: '#e0ac86', hair: '#2b2118', shirt: '#0e7490', accessory: 'badge' },
  DCVV_VERIFIER: { role: 'Card Security Teller', desk: 'dCVV verification desk', skin: '#c68863', hair: '#171717', shirt: '#6d28d9', accessory: 'headset' },
  THREE_DS_EVALUATOR: { role: 'Fraud Analyst', desk: '3-D Secure risk desk', skin: '#f1c9a5', hair: '#7c4a21', shirt: '#4f46e5', accessory: 'headset' },
  CORE_LEDGER_CHECK: { role: 'Ledger Accountant', desk: 'Core ledger workstation', skin: '#f1c9a5', hair: '#3b2f2f', shirt: '#047857', accessory: 'glasses' },
  RECON_DESK: { role: 'Reconciliation Officer', desk: '3-way match desk', skin: '#8d5a3b', hair: '#0f0f0f', shirt: '#b45309', accessory: 'glasses' },
  BNPL_UNDERWRITER: { role: 'Underwriter', desk: 'Credit decision desk', skin: '#e0ac86', hair: '#5b3a1e', shirt: '#be185d', accessory: 'tie' },
  A2A_GATEWAY: { role: 'Payments Gateway Operator', desk: 'ISO 20022 gateway console', skin: '#f1c9a5', hair: '#1f2937', shirt: '#0f766e', accessory: 'headset' },
  AML_SCREENING: { role: 'Compliance Screener', desk: 'AML watchlist desk', skin: '#c68863', hair: '#2b2118', shirt: '#c2410c', accessory: 'badge' },
  CASE_INVESTIGATION: { role: 'Financial Crime Investigator', desk: 'Case file desk', skin: '#e0ac86', hair: '#6b7280', shirt: '#9a3412', accessory: 'glasses' },
  CHARGEBACK_DESK: { role: 'Disputes Analyst', desk: 'Chargeback desk', skin: '#8d5a3b', hair: '#171717', shirt: '#b91c1c', accessory: 'tie' },
};

// ─────────────────────────────────────────────────────────────────────────────
// End-event outcomes
// ─────────────────────────────────────────────────────────────────────────────

export interface OutcomeTheme {
  label: string;
  accent: string;
  badge: string;
}

export const OUTCOME_THEME: Record<Outcome, OutcomeTheme> = {
  APPROVED: { label: 'Approved', accent: '#34d399', badge: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/30' },
  DECLINED: { label: 'Declined', accent: '#fb7185', badge: 'bg-rose-400/10 text-rose-300 ring-rose-400/30' },
  ROUTED_TO_SUSPENSE: { label: 'To suspense', accent: '#fbbf24', badge: 'bg-amber-400/10 text-amber-300 ring-amber-400/30' },
  CHALLENGE_REQUIRED: { label: 'Challenge', accent: '#38bdf8', badge: 'bg-sky-400/10 text-sky-300 ring-sky-400/30' },
};

export function isOutcome(value: unknown): value is Outcome {
  return typeof value === 'string' && value in OUTCOME_THEME;
}

/** What colour a node shows on the minimap, so the overview matches the canvas. */
export function minimapColor(node: { type: NodeType; bankingCapability: BankingCapability | null; outcome?: unknown }): string {
  if (node.type === 'EVENT_END' && isOutcome(node.outcome)) return OUTCOME_THEME[node.outcome].accent;
  return CATEGORY_THEME[categoryOf(node)].accent;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime status
// ─────────────────────────────────────────────────────────────────────────────

export const STATUS_TEXT: Record<NodeRunStatus, { label: string; dot: string; text: string }> = {
  IDLE: { label: 'Idle', dot: 'bg-slate-600', text: 'text-slate-400' },
  QUEUED: { label: 'Next up', dot: 'bg-sky-400', text: 'text-sky-300' },
  PROCESSING: { label: 'Processing', dot: 'bg-amber-400 animate-pulse', text: 'text-amber-300' },
  WAITING: { label: 'Waiting', dot: 'bg-orange-400 animate-pulse', text: 'text-orange-300' },
  DONE: { label: 'Done', dot: 'bg-emerald-400', text: 'text-emerald-300' },
  FAULTED: { label: 'Stuck', dot: 'bg-rose-500 animate-pulse', text: 'text-rose-300' },
  FROZEN: { label: 'Frozen', dot: 'bg-sky-300 animate-pulse', text: 'text-sky-200' },
};
