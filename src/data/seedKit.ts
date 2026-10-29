/** Helpers for writing levels: graph builders that stay consistent with the node catalog, the node-definition id shorthands, and the test payload builders every level shares. */

import type {
  BankingPayload,
  ConfigParamDef,
  ConfigValue,
  Id,
  NodeDefinition,
  ProcessEdge,
  ProcessNode,
  RunnerConfig,
  SettlementContext,
  VirtualCardContext,
} from '../types/processLearning';
import { NODE_CATALOG } from './nodeCatalog';

// Builders (used only to keep graph literals short and consistent with the catalog)

export function definition(id: Id): NodeDefinition {
  const found = NODE_CATALOG.find((d) => d.id === id);
  if (!found) throw new Error(`Unknown node definition: ${id}`);
  return found;
}

export const defaultsOf = (schema: ConfigParamDef[]): Record<string, ConfigValue> =>
  Object.fromEntries(schema.map((c) => [c.key, c.defaultValue]));

export function makeNode(
  definitionId: Id,
  id: Id,
  label?: string,
  config: Record<string, ConfigValue> = {},
  opts: { locked?: boolean; x?: number; y?: number } = {},
): ProcessNode {
  const d = definition(definitionId);
  return {
    id,
    definitionId,
    type: d.type,
    label: label ?? d.label,
    bankingCapability: d.bankingCapability,
    inputPorts: d.inputPorts.map((p) => ({ ...p })),
    outputPorts: d.outputPorts.map((p) => ({ ...p })),
    configParams: { ...defaultsOf(d.configSchema), ...config },
    ...(opts.x !== undefined && opts.y !== undefined ? { position: { x: opts.x, y: opts.y } } : {}),
    ...(opts.locked ? { locked: true } : {}),
  };
}

export function makeEdge(
  id: Id,
  from: [nodeId: Id, portId: Id],
  to: [nodeId: Id, portId: Id],
  opts: { when?: string; isDefault?: boolean; priority?: number; label?: string } = {},
): ProcessEdge {
  return {
    id,
    sourceNodeId: from[0],
    sourcePortId: from[1],
    targetNodeId: to[0],
    targetPortId: to[1],
    ...(opts.when !== undefined ? { conditionExpression: opts.when } : {}),
    ...(opts.isDefault ? { isDefault: true } : {}),
    ...(opts.priority !== undefined ? { priority: opts.priority } : {}),
    ...(opts.label !== undefined ? { label: opts.label } : {}),
  };
}

// Node-definition id shorthands
export const START = 'nd_start_payment';
export const END = 'nd_end_outcome';
export const XOR = 'nd_gateway_xor';
export const AND = 'nd_gateway_and';
export const VAULT = 'nd_token_vault';
export const DCVV = 'nd_dcvv_verifier';
export const THREE_DS = 'nd_three_ds_evaluator';
export const LEDGER = 'nd_core_ledger_check';
export const RECON = 'nd_recon_desk';
export const BNPL = 'nd_bnpl_underwriter';
export const START_A2A = 'nd_start_a2a';
export const A2A = 'nd_a2a_gateway';
export const AML = 'nd_aml_screening';
export const CASE = 'nd_case_investigation';
export const CHARGEBACK = 'nd_chargeback_desk';

// Test payload builders

/** 2026-10-10T03:00:00Z. Every test happens "now" relative to this. */
export const T0 = Date.UTC(2026, 9, 10, 3, 0, 0);

export const payload = (p: Partial<BankingPayload> & Pick<BankingPayload, 'txId'>): BankingPayload => ({
  amount: 5000,
  channel: 'ECOMMERCE',
  cardType: 'CREDIT',
  rawCvv: '123',
  clientTimestamp: T0,
  riskScore: 10,
  isFraud: false,
  availableBalance: 500000,
  creditLimit: 0,
  ...p,
});

/** A DPAN whose current dCVV (always "482") was generated `ageMs` before the request. Null vault entry = unmapped DPAN. */
export const virtualCard = (dpan: string, ageMs: number | null, funding: 'DEBIT' | 'CREDIT' | 'PREPAID' = 'DEBIT'): VirtualCardContext => ({
  dpan,
  vaultEntry:
    ageMs === null
      ? null
      : { fpanLast4: dpan.slice(-4), status: 'ACTIVE', fundingSource: funding, expectedDcvv: '482', dcvvIssuedAt: T0 - ageMs },
});

export const settlement = (
  ledger: number | null,
  clearing: number | null,
  sw: number | null,
  presentments = 1,
): SettlementContext => ({ ledgerAmount: ledger, clearingAmount: clearing, switchAmount: sw, clearingPresentments: presentments });

export const STANDARD_RUNNER: RunnerConfig = {
  maxStepsPerToken: 30,
  maxTokensPerTest: 12,
  outcomePrecedence: ['DECLINED', 'ROUTED_TO_SUSPENSE', 'CHALLENGE_REQUIRED', 'APPROVED'],
};

