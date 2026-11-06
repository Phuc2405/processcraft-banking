/**
 * Regression suite §6: the overnight EoD batch and the isolated sandbox. One case at 23:00 with no detour through a 10:00 peak, the
 * purge before it, only the demo's own case drawn off hours, and a night CIT run that despawns at the day's turn without a deadlock.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { cancelDemo, demoLocked, demoRunning, isolateMoves } from '../../../components/bank/DemoSession';
import { executeDemo, purgeForEod, runDemo, runDemoAnytime } from '../../../components/bank/retailOpsActions';
import { citNow, dispatchCitDemo } from '../../../components/ops/citActions';
import { bankStore, EOD_CASE_ROUTE } from '../../../store/bankStore';
import { citStore, vanOrphaned } from '../../../store/citStore';
import { demoSessionStore } from '../../../store/demoSessionStore';
import { hopPlayerStore } from '../../../store/hopPlayerStore';
import { shiftQueueStore } from '../../../store/shiftQueueStore';
import { vaultFlowStore } from '../../../store/vaultFlowStore';
import { everyTransactionBalances } from '../../../engine/ledger';
import { EOD_START, WORK_END, WORK_START } from '../../clock';
import { demoMinute, inWindow, shiftOf } from '../../demoSchedule';
import { at, freshBank, src } from './harness';

beforeEach(freshBank);

describe('§6.1 single-stream EoD at 23:00', () => {
  it('schedules the night batch at 23:00 whatever the clock says, never at a made-up peak', () => {
    expect(shiftOf('eod')).toBe('eod');
    for (const minute of [0, WORK_START, 10 * 60, WORK_END, EOD_START - 1, EOD_START, EOD_START + 30]) expect(demoMinute('eod', minute), `${minute}`).toBe(EOD_START);
    expect(inWindow('eod', EOD_START)).toBe(true);
    expect(inWindow('eod', 10 * 60)).toBe(false);
    expect(src('store/bankStore.ts')).not.toContain('SANDBOX_MINUTE');
  });

  it.each([WORK_START, 10 * 60, 15 * 60, 22 * 60])('from %i minutes, moves straight to 23:00 (paused) and plays one batch case', (minute) => {
    at(minute);
    const day = bankStore.getState().view.day;
    executeDemo('eod');
    const s = bankStore.getState();
    expect(s.view.minute).toBe(EOD_START);
    expect(s.view.day).toBe(day);
    expect(s.playing).toBe(false);
    expect(s.solo).toBe(false);
    expect(s.presetTxId).toBeNull();
    expect(s.sandboxTrace?.route).toEqual([...EOD_CASE_ROUTE]);
    expect(demoSessionStore.getState().active).toMatchObject({ kind: 'sandbox', id: s.sandboxTrace!.id });
    expect(demoLocked()).toBe(true);
  });

  it('runs the case in order: clearing, settlement, reconciliation, settled', () => {
    expect(EOD_CASE_ROUTE).toEqual(['OUT_APPROVED', 'EOD_BATCH', 'EOD_VISA', 'RECON', 'OUT_SETTLED']);
  });

  it('asks before moving the clock when EoD is pressed by day, and waits in the queue if told to', () => {
    at(10 * 60);
    runDemo('eod');
    const prompt = shiftQueueStore.getState().prompt;
    expect(prompt?.id).toBe('eod');
    expect(prompt?.snap.target).toBe(EOD_START);
    expect(bankStore.getState().view.minute).toBe(10 * 60);
  });

  it('settles the whole night with a balanced ledger once Play takes over', () => {
    at(10 * 60);
    executeDemo('eod');
    cancelDemo();
    bankStore.getState().skipToEndOfDay();
    const s = bankStore.getState();
    expect(s.view.dayOver).toBe(true);
    expect(everyTransactionBalances(s.sim.ledgerEntries)).toBe(true);
    expect(s.view.ledger.trial.balanced).toBe(true);
  });
});

describe('§6.2 off-hours isolation', () => {
  it('draws only the demo’s own case while a demo holds the lock, nothing at all for a replay', () => {
    const moves = [{ packetId: 'own' }, { packetId: 'walk-in' }, { packetId: 'night-batch' }];
    expect(isolateMoves(moves, true, 'own')).toEqual([{ packetId: 'own' }]);
    expect(isolateMoves(moves, true, null)).toEqual([]);
    expect(isolateMoves(moves, false, null)).toEqual(moves);
  });

  it('hides every daytime layer (park, pedestrians, arrivals, tags, queues) in 3D and the desk crowds in 2D while isolated', () => {
    const office = src('components/bank/office/OfficeScene.tsx');
    for (const layer of ['Park3D', 'Pedestrians', 'Arrivals', 'PeopleTags3D', 'SignalPulses', 'Evacuation']) expect(office, layer).toContain(`{!isolated && <${layer} />}`);
    expect(src('components/bank/BankMap.tsx')).toContain('{!focus && !isolated && <DeskCrowd2D />}');
    expect(src('components/bank/office/Desk3D.tsx')).toContain('<group visible={!isolated} name={`desk-queue-${id}`}>');
  });

  it('isolates the EoD case: a locked night session shows no simulation packet', () => {
    at(10 * 60);
    executeDemo('eod');
    const { view, presetTxId } = bankStore.getState();
    expect(isolateMoves(view.moves, demoLocked(), presetTxId)).toEqual([]);
  });

  it('plays a closed day’s scenario in the sandbox: the bank keeps its day and its books', () => {
    bankStore.getState().skipToEndOfDay();
    const before = bankStore.getState();
    const lines = before.sim.ledgerEntries.length;
    runDemoAnytime('pos-20');
    const s = bankStore.getState();
    expect(s.view.day).toBe(before.view.day);
    expect(s.view.dayOver).toBe(true);
    expect(s.sim.ledgerEntries.length).toBe(lines);
    expect(s.sandboxTrace).not.toBeNull();
  });
});

describe('§6.3 state purge and the day’s turn', () => {
  it('purges the earlier flows’ leftovers (payment, hop replay, cash echoes, visitors, queued buttons) before EoD', () => {
    at(10 * 60);
    executeDemo('teller-12k');
    vaultFlowStore.getState().push({ id: 'echo', endpoint: 'TELLER', dir: 'IN', source: 'retail' } as never);
    shiftQueueStore.getState().ask({ id: 'teller-12k', snap: { shift: 'day', target: WORK_START, direction: 'forward', reason: 'beforeOpening' } });
    shiftQueueStore.getState().stay();
    expect(shiftQueueStore.getState().waiting.length).toBeGreaterThan(0);
    demoSessionStore.getState().finish();
    purgeForEod();
    const s = bankStore.getState();
    expect(s.presetTxId).toBeNull();
    expect(s.presetTrace).toBeNull();
    expect(s.sandboxTrace).toBeNull();
    expect(hopPlayerStore.getState().session).toBeNull();
    expect(vaultFlowStore.getState().retail).toHaveLength(0);
    expect(shiftQueueStore.getState().waiting).toHaveLength(0);
  });

  it('despawns a night CIT run at the day’s turn (minute 1440) without holding the lock', () => {
    at(EOD_START + 50);
    expect(dispatchCitDemo('ATM')).toBe(true);
    const day = bankStore.getState().view.day;
    const runId = `CIT-${day}-M1`;
    expect(demoRunning(demoSessionStore.getState().active)).toBe(true);
    // Close the day and start the next: the sync prunes yesterday's dispatches.
    bankStore.getState().skipToEndOfDay();
    bankStore.getState().startNextDay();
    const next = bankStore.getState().view;
    expect(next.day).toBe(day + 1);
    citStore.getState().prune(next.day, next.minute);
    expect(citStore.getState().manual).toEqual([]);
    expect(vanOrphaned(runId, citStore.getState(), next.day)).toBe(true);
    expect(citNow().lock).toBeNull();
    expect(demoLocked()).toBe(false);
    // And the new day takes a fresh dispatch.
    at(10 * 60);
    expect(dispatchCitDemo('TELLER')).toBe(true);
    expect(citStore.getState().manual).toHaveLength(1);
  });
});
