/**
 * Beginner View vocabulary for the Academy: GL account codes and response codes in plain English.
 *
 * Expert View shows the raw code ("1120", "RC 51"); Beginner View shows the plain name ("Pending Card Hold", "Insufficient
 * Balance"). `plainText` rewrites free text (lesson steps, journal lines) so a beginner never meets a bare code.
 * Pure data and pure functions.
 */

import { CHART_OF_ACCOUNTS } from '../engine/ledger';
import type { TermMode } from './terms';

/** Plain names for every GL account, keyed by its four-digit code. */
export const GL_PLAIN: Readonly<Record<string, string>> = {
  '1015': 'Cash Inside ATMs',
  '1110': 'Pending Debit Card Hold',
  '1120': 'Pending Card Hold',
  '1130': 'Pending Prepaid Hold',
  '1150': 'Money Owed on Credit Cards',
  '1210': 'Bank’s Account at Visa',
  '1310': 'BNPL Payments Still Due',
  '1410': 'Instant Transfer Account',
  '1420': 'Central Bank Account',
  '1510': 'Disputed Money to Recover',
  '1910': 'Network Error Hold',
  '1920': 'Currency Loss Hold',
  '2010': 'Customer Bank Balance',
  '2020': 'Prepaid Wallet Money',
  '2110': 'Merchant Payout Pool',
  '2410': 'Transfers Waiting to Send',
  '2420': 'Outgoing Payments in Transit',
  '2510': 'Frozen Suspicious Money',
  '2920': 'Currency Gain Hold',
  '5010': 'Fraud Losses',
};

export interface ResponseCodeLabel {
  /** The plain title a beginner sees. */
  plain: string;
  /** The ISO 8583 wording an expert sees. */
  expert: string;
}

/** Plain titles for the response codes the course teaches. */
export const RC_PLAIN: Readonly<Record<string, ResponseCodeLabel>> = {
  '00': { plain: 'Approved', expert: 'Approved' },
  '05': { plain: 'Bank Said No', expert: 'Do Not Honour' },
  '14': { plain: 'Card Number Not Recognised', expert: 'Invalid Card Number' },
  '51': { plain: 'Insufficient Balance', expert: 'Insufficient Funds' },
  '59': { plain: 'Looks Like Fraud', expert: 'Suspected Fraud' },
  '61': { plain: 'Daily Limit Reached', expert: 'Exceeds Withdrawal Limit' },
  '62': { plain: 'Card Frozen by User', expert: 'Restricted Card' },
  '68': { plain: 'Network Lag', expert: 'Response Received Too Late' },
  '75': { plain: 'Too Many Wrong PINs', expert: 'PIN Tries Exceeded' },
  '91': { plain: 'Bank Unreachable', expert: 'Issuer or Switch Inoperative' },
  '96': { plain: 'System Fault', expert: 'System Malfunction' },
  N7: { plain: 'Security Code Wrong', expert: 'CVV2 Failure' },
};

/** The name of a GL account for the chosen view. Unknown codes are returned as given. */
export function glName(code: string, mode: TermMode): string {
  if (mode === 'beginner') return GL_PLAIN[code] ?? code;
  const account = Object.values(CHART_OF_ACCOUNTS).find((a) => a.code === code);
  return account ? `${code}-${account.name}` : code;
}

/** The label of a response code for the chosen view: "RC 51 Insufficient Funds" or "Insufficient Balance". */
export function rcLabel(code: string, mode: TermMode): string {
  const known = RC_PLAIN[code];
  if (mode === 'beginner') return known?.plain ?? `Code ${code}`;
  return known ? `RC ${code} ${known.expert}` : `RC ${code}`;
}

const RC_PATTERN = /\bRC ?([0-9]{2}|N7)\b/g;
/** A bare four-digit number; only known GL codes are swapped (message types like 0100 are left alone). */
const GL_PATTERN = /(?<![$\d.,])\b([0-9]{4})\b(?![.,]?\d)/g;

/**
 * Free text for the chosen view. Expert View returns it unchanged. Beginner View swaps every "RC xx" for its plain title and
 * every known GL code for the plain account name.
 */
export function plainText(text: string, mode: TermMode): string {
  if (mode === 'expert') return text;
  return text
    .replace(RC_PATTERN, (_m, code: string) => RC_PLAIN[code]?.plain ?? `code ${code}`)
    .replace(GL_PATTERN, (m, code: string) => GL_PLAIN[code] ?? m);
}
