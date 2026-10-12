import { describe, expect, it } from 'vitest';
import { BankSimulation } from '../bankSimulation';
import { CHECKOUT_KINDS } from '../kpis';
import { SCENARIOS, scenarioById, scenarioLabel, scenarioShort, scenariosFor } from '../scenarios';

/** The merchant stories named in the brief, word for word. */
const BRIEF: ReadonlyArray<readonly [string, string]> = [
  ['pos-cafe', '☕ Corner Cafe Tap ($4.50)'],
  ['pos-grocery', '🛒 Supermarket Groceries ($62.80)'],
  ['pos-subway', '🚇 Subway Transit Gate ($2.75)'],
  ['ecom-fashion', '👗 Online Fashion Boutique ($120.00)'],
  ['ecom-games', '🎮 Digital Game Pass ($14.99)'],
  ['virt-trial', '🔒 1-Time Masked Card for Trial ($1.00)'],
  ['a2a-split', '⚡ QR Bill Split ($18.50)'],
  ['a2a-rent', '🏠 Apartment Rent Transfer ($850.00)'],
  ['atm-100', '🏧 Sidewalk ATM Cash Out ($100.00)'],
];

describe('the merchant scenario catalogue', () => {
  it('labels the scenarios of the brief exactly as written', () => {
    for (const [id, label] of BRIEF) expect(scenarioLabel(id), id).toBe(label);
  });

  it('gives every channel at least one genuine scenario and keeps ids unique', () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    for (const kind of CHECKOUT_KINDS) expect(scenariosFor(kind, false).length, kind).toBeGreaterThan(0);
  });

  it('marks every scenario that is not in the brief as extra, and none of the brief’s as extra', () => {
    const briefIds = new Set(BRIEF.map(([id]) => id));
    for (const s of SCENARIOS) expect(Boolean(s.extra), s.id).toBe(!briefIds.has(s.id));
  });

  it('has no label that repeats a word, and a short form that drops only the price', () => {
    for (const s of SCENARIOS) {
      const words = s.title.toLowerCase().split(/\s+/);
      for (let i = 1; i < words.length; i++) expect(words[i], `${s.id}: "${s.title}"`).not.toBe(words[i - 1]);
      expect(scenarioLabel(s).startsWith(scenarioShort(s))).toBe(true);
      expect(scenarioLabel(s)).toMatch(/\(\$\d[\d,]*\.\d{2}\)$/);
    }
  });

  it('returns an empty label for a record that has no scenario', () => {
    expect(scenarioLabel('')).toBe('');
    expect(scenarioLabel(undefined)).toBe('');
    expect(scenarioLabel('nope')).toBe('');
    expect(scenarioById('nope')).toBeNull();
  });
});

describe('merchant labels on a running day', () => {
  const known = new Set(SCENARIOS.map((s) => scenarioLabel(s)));

  it('puts a catalogue label on every hop of a checkout payment', () => {
    const sim = new BankSimulation({ seed: 7, day: 1 });
    let seen = 0;
    for (let i = 0; i < 40; i++) {
      sim.step();
      for (const m of sim.snapshot().moves) {
        if (m.scenario === '') continue;
        seen++;
        expect(known.has(m.scenario), m.scenario).toBe(true);
        expect(m.amountCents).toBeGreaterThan(0);
      }
    }
    expect(seen).toBeGreaterThan(20);
  });

  it('shows the label in the inspector’s queue rows, and the log lines name the same story', () => {
    const sim = new BankSimulation({ seed: 7, day: 1 });
    let rows = 0;
    let logged = 0;
    for (let i = 0; i < 60; i++) {
      sim.step();
      const view = sim.snapshot();
      for (const st of Object.values(view.stations)) {
        for (const q of st.queue) {
          if (q.scenario === '') continue;
          rows++;
          expect(known.has(q.scenario), q.scenario).toBe(true);
        }
        for (const f of st.stream) if ([...known].some((label) => f.text.includes(label))) logged++;
      }
    }
    expect(rows).toBeGreaterThan(0);
    expect(logged).toBeGreaterThan(0);
  });

  it('titles the ledger drawer’s entries: every payment shown has a label that matches its channel', () => {
    const sim = new BankSimulation({ seed: 7, day: 1 });
    sim.runToEndOfDay();
    const { recent, scenarios } = sim.snapshot().ledger;
    expect(recent.length).toBeGreaterThan(0);
    const labelled = recent.filter((e) => scenarios[e.txId] !== undefined);
    // Night-cycle clearing lines carry the label of the purchase they settle, so nearly every line is titled.
    expect(labelled.length / recent.length).toBeGreaterThan(0.9);
    for (const e of labelled) expect(known.has(scenarios[e.txId] as string), e.txId).toBe(true);
  });

  it('draws a jammed ATM withdrawal and its refund under the same label', () => {
    // Find a day on which a machine jams, then follow the money.
    for (let day = 1; day <= 12; day++) {
      const sim = new BankSimulation({ seed: 7, day });
      sim.runToEndOfDay();
      const view = sim.snapshot();
      if (view.kpis.atm.jams === 0) continue;
      const atm = new Set(SCENARIOS.filter((s) => s.kind === 'ATM').map((s) => scenarioLabel(s)));
      const refunds = view.ledger.recent.filter((e) => e.txId.endsWith('-RF'));
      for (const e of refunds) expect(atm.has(view.ledger.scenarios[e.txId] ?? ''), e.txId).toBe(true);
      return;
    }
    throw new Error('no ATM jam in twelve days: the failure path is not being exercised');
  });
});
