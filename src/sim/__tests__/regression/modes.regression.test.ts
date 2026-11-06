/**
 * Regression suite §9: the view modes (Standard / Expert, 2D / 3D, guided / whole bank), Chaos Monkey fault injection and recovery,
 * and the feedback form's one-column layout.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { FeedbackModal } from '../../../components/shell/FeedbackModal';
import { CHAOS_TOGGLE_IDS, chaosActive, cleanChaos, congestionOutcome, CONGESTION_TIMEOUT_RATE, INQUIRY_RECOVERY_RATE, misApprovalChance, NO_CHAOS, scenarioForDay } from '../../../engine/chaos';
import { everyTransactionBalances } from '../../../engine/ledger';
import { setActiveLocale } from '../../../i18n/localeCore';
import { bankStore, dataDepthOf, viewportOf } from '../../../store/bankStore';
import { STATION_IDS } from '../../topology';
import { BankSimulation } from '../../bankSimulation';
import { stationName } from '../../terms';
import { freshBank } from './harness';

beforeEach(freshBank);

describe('§9.1 Standard (Tiêu chuẩn) vs Expert (Chuyên gia) and the other view modes', () => {
  it('toggles the data depth both ways, any number of times, and reports it in the viewport', () => {
    for (const depth of ['expert', 'standard', 'expert', 'expert', 'standard'] as const) {
      bankStore.getState().setDataDepth(depth);
      const s = bankStore.getState();
      expect(dataDepthOf(s)).toBe(depth);
      expect(viewportOf(s).dataDepth).toBe(depth);
      expect(s.termMode).toBe(depth === 'expert' ? 'expert' : 'beginner');
    }
  });

  it('names the desks differently in the two modes, in both languages, without losing any', () => {
    for (const locale of ['en', 'vi'] as const) {
      setActiveLocale(locale);
      let differ = 0;
      for (const id of STATION_IDS) {
        const expert = stationName(id, 'expert');
        const plain = stationName(id, 'beginner');
        expect(expert.trim().length, `${locale} ${id}`).toBeGreaterThan(0);
        expect(plain.trim().length, `${locale} ${id}`).toBeGreaterThan(0);
        if (expert !== plain) differ++;
      }
      expect(differ, locale).toBeGreaterThan(0);
    }
  });

  it('switches 2D / 3D and guided / whole-bank without touching the depth, the flow or a running clock', () => {
    bankStore.getState().setDataDepth('expert');
    bankStore.getState().setActiveFlow(6);
    const minute = bankStore.getState().view.minute;
    for (const dim of ['3d', '2d', '3d'] as const) {
      bankStore.getState().setDimension(dim);
      expect(bankStore.getState().viewMode).toBe(dim);
      expect(viewportOf(bankStore.getState()).dimension).toBe(dim);
    }
    bankStore.getState().setScope('advanced');
    expect(viewportOf(bankStore.getState()).activeFlow).toBeNull();
    bankStore.getState().setScope('beginner');
    const s = bankStore.getState();
    expect(viewportOf(s).activeFlow).toBe(6);
    expect(dataDepthOf(s)).toBe('expert');
    expect(s.view.minute).toBe(minute);
    expect(s.playing).toBe(false);
    bankStore.getState().setDimension('2d');
    bankStore.getState().setDataDepth('standard');
  });
});

describe('§9.2 Chaos Monkey fault injection', () => {
  it('reads every toggle back as a strict boolean and is off by default', () => {
    expect(cleanChaos(undefined)).toEqual(NO_CHAOS);
    expect(cleanChaos({ posOutage: 'true', congestion: 1 })).toEqual(NO_CHAOS);
    expect(chaosActive(NO_CHAOS, 'NONE')).toBe(false);
    for (const id of CHAOS_TOGGLE_IDS) expect(chaosActive({ ...NO_CHAOS, [id]: true }, 'NONE'), id).toBe(true);
    expect(chaosActive(NO_CHAOS, 'FLASH_SURGE')).toBe(true);
    expect(scenarioForDay(2, true)).toBe('FLASH_SURGE');
    expect(scenarioForDay(3, true)).toBe('BOTNET');
    expect(scenarioForDay(2, false)).toBe('NONE');
  });

  it('turns congestion into 504s, most of them recovered by the status inquiry', () => {
    expect(congestionOutcome(CONGESTION_TIMEOUT_RATE, 0)).toBe('CLEAR');
    expect(congestionOutcome(0, 0)).toBe('RECOVERED');
    expect(congestionOutcome(0, INQUIRY_RECOVERY_RATE)).toBe('TIMED_OUT');
    expect(misApprovalChance(50)).toBe(0);
    expect(misApprovalChance(100)).toBeGreaterThan(0);
    expect(misApprovalChance(Number.NaN)).toBe(0);
  });

  it('raises a critical warning when a fault is injected and an all-clear when it is cleared', () => {
    const sim = new BankSimulation({ seed: 3, day: 1 });
    for (const id of CHAOS_TOGGLE_IDS) {
      sim.setChaos({ [id]: true });
      expect(sim.chaosView().active, id).toBe(true);
      const on = sim.snapshot().feed.find((f) => /Chaos Monkey: .* injected\./.test(f.text));
      expect(on?.severity, id).toBe('crit');
      expect(on?.notable, id).toBe(true);
      sim.setChaos({ [id]: false });
      const off = sim.snapshot().feed.find((f) => /Chaos Monkey: .* cleared\./.test(f.text));
      expect(off?.severity, id).toBe('ok');
      expect(sim.chaosView().active, id).toBe(false);
    }
  });

  it('degrades the day the way each fault says, and keeps the ledger balanced through all of it', () => {
    const sim = new BankSimulation({ seed: 5, day: 1, headless: true, chaos: { posOutage: true, hsmFailure: true, congestion: true, fatigueSpike: true } });
    sim.runToEndOfDay();
    const { stats, active } = sim.chaosView();
    expect(active).toBe(true);
    expect(stats.posOutageDeclines).toBeGreaterThan(0);
    expect(stats.hsmDeclines).toBeGreaterThan(0);
    expect(stats.timeouts504).toBeGreaterThan(0);
    expect(stats.inquiriesRecovered + stats.inquiriesFailed).toBe(stats.timeouts504);
    expect(stats.addedLatencyMs).toBeGreaterThan(0);
    const log = sim.transactionLog();
    expect(log.filter((t) => t.chaos === 'POS_OUTAGE').every((t) => t.responseCode === '91')).toBe(true);
    expect(log.filter((t) => t.chaos === 'HSM_FAILURE').every((t) => t.responseCode === '96')).toBe(true);
    expect(everyTransactionBalances(sim.ledgerEntries)).toBe(true);
  });

  it('recovers fully once every fault is cleared: the next day runs as a quiet one would', () => {
    const quiet = new BankSimulation({ seed: 8, day: 2, headless: true });
    quiet.runToEndOfDay();
    const healed = new BankSimulation({ seed: 8, day: 2, headless: true, chaos: { posOutage: true, congestion: true } });
    healed.setChaos({ posOutage: false, congestion: false });
    healed.runToEndOfDay();
    expect(healed.chaosView().active).toBe(false);
    expect(healed.transactionLog().some((t) => t.chaos !== undefined)).toBe(false);
    expect(healed.transactionLog().length).toBe(quiet.transactionLog().length);
  });

  it('applies the live bank’s toggles at once and clears them again', () => {
    bankStore.getState().setChaos({ congestion: true });
    expect(bankStore.getState().chaos.congestion).toBe(true);
    expect(bankStore.getState().view.chaos.active).toBe(true);
    bankStore.getState().setChaos({ congestion: false });
    expect(bankStore.getState().chaos.congestion).toBe(false);
    expect(bankStore.getState().view.chaos.config.congestion).toBe(false);
  });
});

describe('§9.3 the feedback form layout contract', () => {
  for (const locale of ['vi', 'en'] as const) {
    it(`stacks every field in one full-width, left-aligned column (${locale})`, () => {
      setActiveLocale(locale);
      const html = renderToStaticMarkup(createElement(FeedbackModal, { onClose: () => undefined, endpoint: '' }));
      expect(html).toMatch(/<fieldset class="[^"]*flex w-full min-w-0 flex-col[^"]*text-left/);
      const form = html.slice(html.indexOf('<fieldset'), html.indexOf('</fieldset>'));
      const fields = [...form.matchAll(/data-testid="feedback-field-([a-z]+)"/g)].map((m) => m[1]);
      expect(fields).toEqual(expect.arrayContaining(['kind', 'text', 'reply', 'attach']));
      for (const f of fields) expect(form).toMatch(new RegExp(`class="flex w-full min-w-0 flex-col items-stretch gap-1 text-left" data-testid="feedback-field-${f}"`));
      // Every visible text control fills its column (the hidden spam-trap field is not shown to anyone).
      const controls = (form.match(/<(textarea|input type="email"|input type="text"|select)[^>]*>/g) ?? []).filter((t) => !t.includes('name="_gotcha"'));
      expect(controls.length).toBeGreaterThanOrEqual(2);
      expect(form).toMatch(/name="_gotcha"[^>]*aria-hidden="true" class="hidden"/);
      for (const tag of controls) expect(tag).toMatch(/class="block w-full/);
      // Nothing pushes a control sideways or fixes a width that could overflow a phone.
      expect(form).not.toMatch(/ml-auto|justify-end|text-right|float-right|grid-cols-|flex-row|w-\[\d{3,}px\]|min-w-\[\d{3,}px\]/);
    });
  }
});
