/**
 * Shared set-up for the system-wide regression suite (src/sim/__tests__/regression). Test-only: nothing in the app imports this
 * file, so Vite never bundles it (a test in this suite holds that rule).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setActiveLocale } from '../../../i18n/localeCore';
import { bankStore } from '../../../store/bankStore';
import { citStore } from '../../../store/citStore';
import { demoSessionStore } from '../../../store/demoSessionStore';
import { deskVisitStore } from '../../../store/deskVisitStore';
import { hopPlayerStore } from '../../../store/hopPlayerStore';
import { retailOpsStore } from '../../../store/retailOpsStore';
import { shiftQueueStore } from '../../../store/shiftQueueStore';
import { uiStore } from '../../../store/uiStore';
import { vaultFlowStore } from '../../../store/vaultFlowStore';

/** A source file under src/, for the few contracts that live only in markup or wiring. */
export const src = (path: string): string => readFileSync(join(__dirname, '../../..', path), 'utf8');

/** Every store back to a fresh, paused D1 07:00 with Flow 01 lit, no demo running and English on screen. */
export function freshBank(): void {
  demoSessionStore.getState().finish();
  demoSessionStore.getState().release();
  hopPlayerStore.getState().reset();
  bankStore.getState().pause();
  bankStore.getState().resetDay();
  bankStore.getState().clearDemo();
  bankStore.getState().setActiveFlow(1);
  citStore.setState({ day: -1, manual: [], van: false, sbvCase: 'DEPOSIT' });
  retailOpsStore.getState().reset();
  deskVisitStore.getState().clear();
  shiftQueueStore.getState().clear();
  vaultFlowStore.getState().clear();
  uiStore.getState().close();
  setActiveLocale('en');
}

/** Plays the running solo demo beat by beat until its payment is done (or the guard runs out). Returns whether it finished. */
export function playDemoToEnd(limit = 240): boolean {
  for (let i = 0; i < limit && !bankStore.getState().presetTrace?.done; i++) bankStore.getState().tickBeat();
  return bankStore.getState().presetTrace?.done === true;
}

/** Moves the bank's clock to `minute` today (paused). */
export const at = (minute: number): void => bankStore.getState().skipTo(minute);
