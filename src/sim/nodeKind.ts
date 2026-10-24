/**
 * How each of the 16 map stations is presented: a machine run by server threads, or a desk run by people.
 *
 * This is the inspector's vocabulary, not the engine's. The engine keeps one strain number per worker (0–100) and one queue
 * per desk for every station, which is what drives the Day 2 and Day 3 scenarios; on an automated node that same number is
 * read as CPU / thread load, on a human desk as fatigue. Only the ATM's two stations are machines in the engine too
 * (`StationDef.automated`), and they are automated here as well.
 */

import type { StationId } from './topology';

/** The 11 stations a bank runs on servers: gateways, the security checks, the core ledger and the ATM. */
export const AUTOMATED_NODES = [
  'GATE_VIRTUAL',
  'GATE_POS',
  'GATE_A2A',
  'GATE_ECOM',
  'SEC_VAULT',
  'SEC_DCVV',
  'SEC_3DS',
  'LEDGER_DEBIT',
  'LEDGER_CREDIT',
  'GATE_ATM',
  'ATM_CASH',
] as const satisfies readonly StationId[];

/** The 5 desks people still run: underwriting and the night back office. */
export const HUMAN_NODES = ['BNPL', 'EOD_BATCH', 'EOD_VISA', 'SUSPENSE', 'RECON'] as const satisfies readonly StationId[];

const AUTOMATED: ReadonlySet<StationId> = new Set(AUTOMATED_NODES);

export const isAutomatedNode = (id: StationId): boolean => AUTOMATED.has(id);

/** Families that share an example in the inspector's tips (what queues there, what goes wrong there). */
export type NodeFamily = 'gateway' | 'token' | 'risk' | 'casa' | 'credit' | 'atm' | 'bnpl' | 'clearing' | 'suspense';

export const NODE_FAMILY: Readonly<Record<StationId, NodeFamily>> = {
  GATE_VIRTUAL: 'gateway',
  GATE_POS: 'gateway',
  GATE_ECOM: 'gateway',
  GATE_A2A: 'gateway',
  SEC_VAULT: 'token',
  SEC_DCVV: 'token',
  SEC_3DS: 'risk',
  LEDGER_DEBIT: 'casa',
  LEDGER_CREDIT: 'credit',
  GATE_ATM: 'atm',
  ATM_CASH: 'atm',
  BNPL: 'bnpl',
  EOD_BATCH: 'clearing',
  EOD_VISA: 'clearing',
  RECON: 'clearing',
  SUSPENSE: 'suspense',
};

const GREEK = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'] as const;

/**
 * The name an automated node's worker goes by: gateways run clusters ("Gateway Cluster Alpha"), everything else runs threads
 * ("Server Thread #01"). `index` is the worker's place in the station's list, so the names are stable for the day.
 */
export function machineWorkerName(id: StationId, index: number): { kind: 'cluster'; letter: string } | { kind: 'thread'; n: string } {
  if (NODE_FAMILY[id] === 'gateway') return { kind: 'cluster', letter: GREEK[index % GREEK.length]! + (index >= GREEK.length ? ` ${Math.floor(index / GREEK.length) + 1}` : '') };
  return { kind: 'thread', n: String(index + 1).padStart(2, '0') };
}
