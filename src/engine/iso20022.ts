/** ISO 20022 for account-to-account (A2A) payments: the pacs.008 message and the gateway that decides what to do with it. pacs.008 is the "FI to FI Customer Credit Transfer". */

import { tr } from '../i18n/localeCore';
import type { A2aContext, BankingPayload, MinorUnits } from '../types/processLearning';
import { formatAud } from './money';

export type Rail = 'INSTANT' | 'RTGS';

export interface Pacs008 {
  messageId: string;
  endToEndId: string;
  debtorAgent: string;
  creditorAgent: string;
  interbankSettlementAmount: MinorUnits;
  currency: string;
  purposeCode: A2aContext['purposeCode'];
}

/** A BIC is 8 characters (bank + country + location) or 11 (plus a branch): "NOVAAU2S" or "NOVAAU2SXXX". */
export const BIC_PATTERN = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

export const END_TO_END_ID_MAX = 35;

export function pacs008From(payload: Readonly<BankingPayload>): Pacs008 | null {
  const a = payload.a2a;
  if (!a) return null;
  return {
    messageId: `MSG-${payload.txId}`,
    endToEndId: a.endToEndId,
    debtorAgent: a.debtorAgent,
    creditorAgent: a.creditorAgent,
    interbankSettlementAmount: a.interbankSettlementAmount,
    currency: a.currency,
    purposeCode: a.purposeCode,
  };
}

export interface Pacs008Issue {
  field: 'EndToEndId' | 'DebtorAgent' | 'CreditorAgent' | 'InterbankSettlementAmount' | 'Currency';
  message: string;
}

/** Every format rule the gateway checks before it will touch a message. Empty means the message is well formed. */
export function validatePacs008(m: Readonly<Pacs008>, instructedAmount: MinorUnits): Pacs008Issue[] {
  const issues: Pacs008Issue[] = [];
  if (m.endToEndId.trim() === '') issues.push({ field: 'EndToEndId', message: tr({ en: 'EndToEndId is missing. Without it the payment cannot be traced from sender to receiver.', vi: 'Thiếu EndToEndId. Không có nó thì không thể truy giao dịch từ người gửi tới người nhận.' }) });
  else if (m.endToEndId.length > END_TO_END_ID_MAX) issues.push({ field: 'EndToEndId', message: tr({ en: `EndToEndId is ${m.endToEndId.length} characters; the limit is ${END_TO_END_ID_MAX}.`, vi: `EndToEndId dài ${m.endToEndId.length} ký tự; giới hạn là ${END_TO_END_ID_MAX}.` }) });
  if (!BIC_PATTERN.test(m.debtorAgent)) issues.push({ field: 'DebtorAgent', message: tr({ en: `DebtorAgent '${m.debtorAgent}' is not a valid BIC (8 or 11 characters).`, vi: `DebtorAgent '${m.debtorAgent}' không phải BIC hợp lệ (8 hoặc 11 ký tự).` }) });
  if (!BIC_PATTERN.test(m.creditorAgent)) issues.push({ field: 'CreditorAgent', message: tr({ en: `CreditorAgent '${m.creditorAgent}' is not a valid BIC (8 or 11 characters).`, vi: `CreditorAgent '${m.creditorAgent}' không phải BIC hợp lệ (8 hoặc 11 ký tự).` }) });
  if (!Number.isInteger(m.interbankSettlementAmount) || m.interbankSettlementAmount <= 0) issues.push({ field: 'InterbankSettlementAmount', message: tr({ en: 'InterbankSettlementAmount must be more than zero.', vi: 'InterbankSettlementAmount phải lớn hơn không.' }) });
  else if (m.interbankSettlementAmount !== instructedAmount) {
    issues.push({ field: 'InterbankSettlementAmount', message: tr({ en: `InterbankSettlementAmount (${money(m.interbankSettlementAmount)}) does not equal the instructed amount (${money(instructedAmount)}).`, vi: `InterbankSettlementAmount (${money(m.interbankSettlementAmount)}) không bằng số tiền trong lệnh (${money(instructedAmount)}).` }) });
  }
  if (!/^[A-Z]{3}$/.test(m.currency)) issues.push({ field: 'Currency', message: tr({ en: `Currency '${m.currency}' is not an ISO 4217 code.`, vi: `Đơn vị tiền '${m.currency}' không phải mã ISO 4217.` }) });
  return issues;
}

export interface GatewayPolicy {
  /** Largest payment the instant rail carries. Bigger payments go by RTGS. */
  instantLimitMinor: MinorUnits;
  /** Messages the gateway will hold. At this many waiting, it is congested. */
  queueCapacity: number;
  /** Liquidity set aside for priority payments. Ordinary payments cannot touch it. */
  priorityReserveMinor: MinorUnits;
}

export interface GatewayResult {
  issues: Pacs008Issue[];
  valid: boolean;
  rail: Rail;
  priority: 'PRIORITY' | 'NORMAL';
  queue: 'OPEN' | 'CONGESTED';
  liquidity: 'SUFFICIENT' | 'SHORTFALL';
  /** What this payment is allowed to draw on: all the liquidity for priority, everything above the reserve otherwise. */
  usableLiquidityMinor: MinorUnits;
}

export const railFor = (amount: MinorUnits, instantLimitMinor: MinorUnits): Rail => (amount <= instantLimitMinor ? 'INSTANT' : 'RTGS');

/** Payroll (purpose code SALA) is the priority class: people are paid on a fixed day and a late payroll is front-page news. */
export const priorityFor = (purposeCode: A2aContext['purposeCode']): 'PRIORITY' | 'NORMAL' => (purposeCode === 'SALA' ? 'PRIORITY' : 'NORMAL');

export function gateway(payload: Readonly<BankingPayload>, policy: GatewayPolicy): GatewayResult | null {
  const a = payload.a2a;
  const message = pacs008From(payload);
  if (!a || !message) return null;
  const issues = validatePacs008(message, payload.amount);
  const priority = priorityFor(a.purposeCode);
  const usable = priority === 'PRIORITY' ? a.liquidityAvailableMinor : Math.max(0, a.liquidityAvailableMinor - policy.priorityReserveMinor);
  return {
    issues,
    valid: issues.length === 0,
    rail: railFor(payload.amount, policy.instantLimitMinor),
    priority,
    queue: a.queueDepth >= policy.queueCapacity ? 'CONGESTED' : 'OPEN',
    liquidity: payload.amount <= usable ? 'SUFFICIENT' : 'SHORTFALL',
    usableLiquidityMinor: usable,
  };
}

// The message itself

const money = formatAud;

/** 125000 -> "1250.00": the plain decimal ISO 20022 wants, built from integers so no float rounding can creep in. */
export const isoAmount = (minor: MinorUnits): string => `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;

const escapeXml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The message as the XML a real gateway would receive (only the elements the Academy teaches). */
export function pacs008Xml(m: Readonly<Pacs008>, rail?: Rail): string {
  const lines = [
    '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">',
    '  <FIToFICstmrCdtTrf>',
    '    <GrpHdr>',
    `      <MsgId>${escapeXml(m.messageId)}</MsgId>`,
    '      <NbOfTxs>1</NbOfTxs>',
    `      <SttlmInf><SttlmMtd>CLRG</SttlmMtd>${rail ? `<ClrSys><Prtry>${rail}</Prtry></ClrSys>` : ''}</SttlmInf>`,
    '    </GrpHdr>',
    '    <CdtTrfTxInf>',
    `      <PmtId><EndToEndId>${escapeXml(m.endToEndId)}</EndToEndId></PmtId>`,
    `      <IntrBkSttlmAmt Ccy="${escapeXml(m.currency)}">${isoAmount(m.interbankSettlementAmount)}</IntrBkSttlmAmt>`,
    `      <Purp><Cd>${m.purposeCode}</Cd></Purp>`,
    `      <DbtrAgt><FinInstnId><BICFI>${escapeXml(m.debtorAgent)}</BICFI></FinInstnId></DbtrAgt>`,
    `      <CdtrAgt><FinInstnId><BICFI>${escapeXml(m.creditorAgent)}</BICFI></FinInstnId></CdtrAgt>`,
    '    </CdtTrfTxInf>',
    '  </FIToFICstmrCdtTrf>',
    '</Document>',
  ];
  return lines.join('\n');
}
