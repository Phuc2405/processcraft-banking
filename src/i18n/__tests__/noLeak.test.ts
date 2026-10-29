/** Language leak guard. 1. */

import { afterEach, describe, expect, it } from 'vitest';
import { transactionsCsv } from '../../sim/reportSummary';
import { auditCsv, buildAudit } from '../../sim/audit';
import { scanForAml } from '../../sim/amlMonitor';
import { BankSimulation } from '../../sim/bankSimulation';
import { localizeScenarioText, scenarioLabel, scenarioLabelEn, SCENARIOS, SCENARIO_TITLE_VI, scenarioById } from '../../sim/scenarios';
import type { BankView } from '../../sim/types';
import { feedText } from '../feedVi';
import { alarmText } from '../notesVi';
import { setActiveLocale } from '../locale';

/** Any Vietnamese letter. */
import { hasVietnamese } from '../../utils/i18nHelper';
const VN = { test: hasVietnamese };

afterEach(() => setActiveLocale('en'));

/** Every piece of sim-written text the screen shows, raw. */
function rawText(view: BankView): string[] {
  const out: string[] = [];
  for (const m of view.moves) out.push(m.scenario);
  for (const st of Object.values(view.stations)) {
    for (const q of st.queue) out.push(q.scenario);
    for (const f of st.stream) out.push(f.text);
    for (const w of st.workers) out.push(w.activity);
    for (const a of st.alerts) out.push(a.text);
  }
  for (const f of view.feed) out.push(f.text);
  for (const a of view.alerts) out.push(a.text);
  out.push(...Object.values(view.ledger.scenarios));
  return out.filter(Boolean);
}

function playInVietnamese(seed: number, day: number, steps: number): { sim: BankSimulation; text: string[] } {
  setActiveLocale('vi');
  const sim = new BankSimulation({ seed, day, chaos: { scriptedDays: true } });
  const text: string[] = [];
  for (let i = 0; i < steps; i++) {
    sim.step();
    text.push(...rawText(sim.snapshot()));
  }
  return { sim, text };
}

describe('canonical English from the simulation', () => {
  for (const day of [1, 2, 3]) {
    it(`writes no Vietnamese on day ${day} while the app is in Vietnamese`, () => {
      const { text } = playInVietnamese(7, day, 90);
      expect(text.length).toBeGreaterThan(50);
      expect(text.filter((s) => VN.test(s))).toEqual([]);
    });
  }

  it('keeps the exports and the AML alerts in English after a Vietnamese session', () => {
    setActiveLocale('vi');
    const sim = new BankSimulation({ seed: 11, day: 3, headless: true, chaos: { scriptedDays: true } });
    sim.runToEndOfDay();
    const log = sim.transactionLog();
    const audit = buildAudit(sim.snapshot().history.at(-1) ?? ({} as never), log, sim.ledgerEntries, null);
    expect(VN.test(transactionsCsv(log))).toBe(false);
    expect(VN.test(auditCsv(audit))).toBe(false);
    expect(scanForAml(log).filter((a) => VN.test(a.scenario))).toEqual([]);
  });
});

describe('showing sim text in English', () => {
  it('puts Vietnamese scenario names baked into a line back into English', () => {
    const qr = scenarioById('a2a-split')!;
    const baked = `Debiting ${qr.emoji} ${SCENARIO_TITLE_VI[qr.title]} ($18.50) from the account: enough, transfer released`;
    expect(VN.test(baked)).toBe(true);
    setActiveLocale('en');
    expect(feedText(baked)).toBe(`Debiting ${qr.emoji} ${qr.title} ($18.50) from the account: enough, transfer released`);
  });

  it('leaves no Vietnamese in any scenario label or alarm in English', () => {
    setActiveLocale('en');
    for (const s of SCENARIOS) expect(VN.test(scenarioLabel(s)), s.id).toBe(false);
    for (const a of ['Fraud slipped through', 'Break settled as approved', 'Break: amount mismatch']) expect(VN.test(alarmText(a))).toBe(false);
  });

  it('shows a Vietnamese session’s text cleanly after switching to English', () => {
    const { text } = playInVietnamese(11, 2, 60);
    setActiveLocale('en');
    expect(text.map(feedText).filter((s) => VN.test(s))).toEqual([]);
  });
});

describe('showing sim text in Vietnamese', () => {
  it('translates every scenario name, longest first, with no English name left over', () => {
    setActiveLocale('vi');
    for (const s of SCENARIOS) {
      const shown = localizeScenarioText(scenarioLabelEn(s), 'vi');
      expect(shown.includes(s.title), s.id).toBe(false);
    }
    // "Practice Swipe" is the start of "Practice Swipe, Big Basket": the longer name must win.
    const big = scenarioById('preset-pos-500')!;
    expect(localizeScenarioText(scenarioLabelEn(big), 'vi')).not.toMatch(/Big Basket|Practice/);
  });

  it('is a no-op on text without a scenario name and on empty text', () => {
    expect(localizeScenarioText('', 'vi')).toBe('');
    expect(localizeScenarioText('Settled.', 'vi')).toBe('Settled.');
  });
});
