/**
 * The live reading under a sub-process sheet's SLA target: the CIT run in flight for the cash sheets, else the sheet's desk as the
 * bank's simulation sees it now (average wait and queue). Pure: the drawer feeds it the bank's view and the CIT snapshot.
 */

import type { SubProcessInfo } from '../data/subProcessModel';
import type { CitSnapshot, CitStatus } from './citEngine';
import { isStation } from './topology';
import type { BankView } from './types';

export type SlaTelemetry = { kind: 'desk'; waitMin: number; queue: number } | { kind: 'cit'; status: CitStatus | 'IDLE' } | null;

const CASH_SHEETS: ReadonlySet<string> = new Set(['cit-vault', '06-cit-atm', '06-cit-doorstep', '06-cit-sbv', '06-cit-teller-vault']);

export function slaTelemetry(info: Pick<SubProcessInfo, 'key' | 'place'>, view: Pick<BankView, 'stations'>, cit: CitSnapshot | null): SlaTelemetry {
  if (CASH_SHEETS.has(info.key)) {
    const run = cit?.active?.run;
    return { kind: 'cit', status: run && run.status !== 'SETTLED' ? run.status : 'IDLE' };
  }
  if (!isStation(info.place)) return null;
  const s = view.stations[info.place];
  return { kind: 'desk', waitMin: Math.round(s.stats.avgWaitMin * 10) / 10, queue: s.queueLength };
}
