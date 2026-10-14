import { describe, expect, it } from 'vitest';
import type { ViewportSettings } from '../../types/viewport';
import { BankSimulation } from '../bankSimulation';
import { WORK_START } from '../clock';
import { flowPlaces, flowScope, GUIDED_FLOW_NODES, GUIDED_FLOWS, isNodeFocused, stepAt, stepStatus } from '../guidedFlows';
import { journalLines, journalText, plainFacts, rawMessage, responseCodeFor } from '../isoMessages';
import { presetCustomer, presetsFor, type PresetId } from '../presets';
import { hasWire, isStation, STATIONS } from '../topology';

const vp = (over: Partial<ViewportSettings> = {}): ViewportSettings => ({ scope: 'beginner', dimension: '2d', dataDepth: 'standard', activeFlow: 1, ...over });

function sent(id: PresetId) {
  const sim = new BankSimulation({ seed: 2026 });
  sim.stepUntil(WORK_START + 10);
  const txId = sim.inject(presetCustomer(id, sim.rules)!)!;
  const first = sim.traceOf(txId)!;
  for (let i = 0; i < 40 && !sim.traceOf(txId)?.done; i++) sim.step();
  return { first, last: sim.traceOf(txId)! };
}

describe('guided flows', () => {
  it('keeps the node contract of the brief', () => {
    expect(GUIDED_FLOW_NODES[1]).toEqual(['pos_terminal', 'casa_desk', 'auth_engine']);
    expect(GUIDED_FLOW_NODES[2]).toEqual(['web_checkout', 'token_vault', 'fraud_desk', 'otp_service', 'auth_engine']);
    expect(GUIDED_FLOW_NODES[3]).toEqual(['cdm_kiosk', 'cash_sorter', 'casa_desk']);
    expect(GUIDED_FLOW_NODES[4]).toEqual(['batch_processor', 'clearing_house', 'settlement_desk', 'reconciliation_desk']);
    for (const f of [1, 2, 3, 4] as const) expect(GUIDED_FLOWS[f].steps.map((s) => s.node)).toEqual(GUIDED_FLOW_NODES[f]);
  });

  it('lights every node in the Advanced scope and only the flow in Beginner', () => {
    expect(isNodeFocused('BNPL', vp({ scope: 'advanced' }))).toBe(true);
    expect(isNodeFocused('GATE_POS', vp())).toBe(true);
    expect(isNodeFocused('casa_desk', vp())).toBe(true);
    expect(isNodeFocused('fraud_desk', vp())).toBe(false);
    expect(isNodeFocused('SEC_3DS', vp())).toBe(false);
    expect(isNodeFocused('SEC_3DS', vp({ activeFlow: 2 }))).toBe(true);
    expect(isNodeFocused('EOD_BATCH', vp({ activeFlow: 4 }))).toBe(true);
    expect(isNodeFocused('GATE_ATM', vp({ activeFlow: 3 }))).toBe(true);
    expect(isNodeFocused('GATE_ATM', vp({ activeFlow: null }))).toBe(true);
  });

  it('lights the wires between lit places, and the departments of lit desks', () => {
    const s1 = flowScope(1);
    expect([...s1.wires].sort()).toEqual(['GATE_POS>LEDGER_DEBIT', 'LEDGER_DEBIT>OUT_APPROVED', 'LEDGER_DEBIT>OUT_DECLINED']);
    expect([...s1.departments].sort()).toEqual(['GATES', 'LEDGER']);
    expect(flowScope(3).wires.has('GATE_ATM>ATM_CASH')).toBe(true);
    // Every lit desk in a flow is reachable by a wire from another lit place of the flow, so no lit desk floats alone.
    for (const f of [1, 2, 3, 4] as const) {
      for (const p of flowPlaces(f)) {
        if (!isStation(p) || STATIONS[p].department === 'LEDGER') continue;
        expect([...flowPlaces(f)].some((q) => q !== p && (hasWire(p, q) || hasWire(q, p)))).toBe(true);
      }
    }
  });

  it('finds the step a place plays', () => {
    expect(stepAt(2, 'SEC_3DS')).toMatchObject({ number: 3, total: 5 });
    expect(stepAt(1, 'SEC_3DS')).toBeNull();
  });

  it('every flow but the night one has payment presets', () => {
    expect(presetsFor(1).map((p) => p.variant)).toEqual(['success', 'danger']);
    expect(presetsFor(2).map((p) => p.variant)).toEqual(['primary', 'warning']);
    expect(presetsFor(3).map((p) => p.variant)).toEqual(['success']);
    expect(presetsFor(4).map((p) => p.id)).toEqual(['eod']);
  });

  it('moves the step statuses along with the payment', () => {
    const { first, last } = sent('pos-20');
    expect(stepStatus(1, 0, null)).toBe('upcoming');
    expect(stepStatus(1, 0, first)).toBe('in-progress');
    expect(stepStatus(1, 2, first)).toBe('upcoming');
    expect([0, 1, 2].map((i) => stepStatus(1, i, last))).toEqual(['completed', 'completed', 'completed']);
  });
});

describe('data depth of a payment', () => {
  it('gives RC 00 and the hold journal for the approved swipe', () => {
    const { first, last } = sent('pos-20');
    expect(responseCodeFor(first).tone).toBe('pending');
    expect(responseCodeFor(last)).toMatchObject({ code: '00', text: 'Approved', scheme: 'ISO 8583' });
    expect(rawMessage(last)).toMatchObject({ mti: '0110', de39_responseCode: '00', de4_amount: '000000002000' });
    const lines = journalLines(last);
    expect(lines.length).toBeGreaterThan(0);
    expect(journalText(lines[0]!)).toMatch(/^DR: 1110-Customer CASA Hold \$20\.00 \| CR: \d{4}-.+ \$20\.00$/);
    expect(plainFacts(last)).toEqual(expect.arrayContaining([{ label: 'Status', value: 'Approved', tone: 'good' }, { label: 'Hold Amount', value: '$20.00' }]));
  });

  it('gives RC 51 for the declined swipe', () => {
    expect(responseCodeFor(sent('pos-500').last)).toMatchObject({ code: '51', text: 'Insufficient Funds' });
  });

  it('labels a deposit as a credit with processing code 21', () => {
    const { last } = sent('cdm-200');
    expect(rawMessage(last).de3_processingCode).toBe('210000');
    expect(plainFacts(last)[0]).toMatchObject({ value: 'Credited' });
    expect(journalLines(last).map(journalText)).toContain('DR: 1015-ATM Cash in Machines $200.00 | CR: 2010-Customer CASA $200.00');
  });
});
