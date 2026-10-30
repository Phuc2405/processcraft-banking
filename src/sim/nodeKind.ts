/** How each of the 24 map stations is presented: a machine run by server threads, or a desk run by people. */

import type { StationId } from './topology';

/** The 16 stations a bank runs on servers: gateways, the security and biometric checks, the FDS, the core ledger and the ATM. */
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
  'GATE_EKYC',
  'GATE_QR',
  'SEC_FACEPAY',
  'SEC_FDS',
  'GATE_SWIFT',
] as const satisfies readonly StationId[];

/** The 8 desks people still run: underwriting, the night back office, the teller counter, AML compliance and disputes. */
export const HUMAN_NODES = ['BNPL', 'EOD_BATCH', 'EOD_VISA', 'SUSPENSE', 'RECON', 'TELLER_CASH', 'AML_DESK', 'DISPUTE_DESK'] as const satisfies readonly StationId[];

const AUTOMATED: ReadonlySet<StationId> = new Set(AUTOMATED_NODES);

export const isAutomatedNode = (id: StationId): boolean => AUTOMATED.has(id);

/** Families that share an example in the inspector's tips (what queues there, what goes wrong there). */
export type NodeFamily =
  | 'gateway'
  | 'token'
  | 'risk'
  | 'casa'
  | 'credit'
  | 'atm'
  | 'bnpl'
  | 'clearing'
  | 'suspense'
  | 'ekyc'
  | 'qr'
  | 'teller'
  | 'biometric'
  | 'fds'
  | 'aml'
  | 'dispute'
  | 'swift';

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
  GATE_EKYC: 'ekyc',
  GATE_QR: 'qr',
  TELLER_CASH: 'teller',
  SEC_FACEPAY: 'biometric',
  SEC_FDS: 'fds',
  AML_DESK: 'aml',
  DISPUTE_DESK: 'dispute',
  GATE_SWIFT: 'swift',
};

const GREEK = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'] as const;

/** The AI engines that stand in for a worker at the identity, biometric and fraud nodes. */
export type MachineEngine = 'ekyc' | 'facepay' | 'fds';

const ENGINE: Partial<Record<NodeFamily, MachineEngine>> = { ekyc: 'ekyc', biometric: 'facepay', fds: 'fds' };

export type MachineWorkerName = { kind: 'cluster'; letter: string } | { kind: 'thread'; n: string } | { kind: 'engine'; engine: MachineEngine; n: string };

/** The name an automated node's worker goes by: gateways run clusters ("Gateway Cluster Alpha"), the identity, biometric and fraud nodes run AI engines ("eKYC Identity Bot #01"), everything else runs threads ("Server Thread #01"). */
export function machineWorkerName(id: StationId, index: number): MachineWorkerName {
  const family = NODE_FAMILY[id];
  const n = String(index + 1).padStart(2, '0');
  if (family === 'gateway' || family === 'qr' || family === 'swift') return { kind: 'cluster', letter: GREEK[index % GREEK.length]! + (index >= GREEK.length ? ` ${Math.floor(index / GREEK.length) + 1}` : '') };
  const engine = ENGINE[family];
  if (engine) return { kind: 'engine', engine, n };
  return { kind: 'thread', n };
}
