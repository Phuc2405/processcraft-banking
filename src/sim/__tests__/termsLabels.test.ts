import { describe, expect, it } from 'vitest';
import { sceneOf } from '../../data/walkthroughCopy';
import { chapters, DIFFICULTY_HINT } from '../chapters';
import { LESSON_LIST, PROCESS_SHORT } from '../learning';
import { DECLINE_LABEL } from '../kpis';
import { RULE_META } from '../rules';
import { DEPARTMENTS, DEPARTMENT_IDS, STATIONS, STATION_IDS } from '../topology';
import { DAY_EVENTS } from '../traffic';
import { departmentName, departmentTitle, foldRepeats, modeLabel, plainText, stationName, stationTitle } from '../terms';

/** The string-duplication bugs of the plain-English switch ("Virtual Card card masking", "Buy Now Pay Later Buy Now Pay Later (4-split payment)", "The extra identity check Risk Engine") all had one cause. */

/** The first immediate repeat of a word run (one to six words long), or null. Case, punctuation and "&" are ignored. */
function stutter(text: string): string | null {
  const words = text
    .split(/\s+/)
    .map((w) => w.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
    .filter((w) => w !== '');
  for (let n = 1; n <= 6; n++) {
    for (let i = 0; i + 2 * n <= words.length; i++) {
      const a = words.slice(i, i + n).join(' ');
      const b = words.slice(i + n, i + 2 * n).join(' ');
      // A lone digit or a lone short connective repeated is not a stutter ("1 1", "in in" would still be caught as words).
      if (a === b && /[a-z]{2}/.test(a)) return words.slice(i, i + 2 * n).join(' ');
    }
  }
  return null;
}

/** Every piece of free text a learner can read, tagged with where it came from. */
function allText(): Array<readonly [string, string]> {
  const out: Array<readonly [string, string]> = [];
  const add = (where: string, text: string | undefined): void => {
    if (text) out.push([where, text]);
  };
  for (const l of LESSON_LIST) {
    add(`${l.id} title`, l.title);
    add(`${l.id} subtitle`, l.subtitle);
    add(`${l.id} short`, PROCESS_SHORT[l.id]);
    l.intro.forEach((t, i) => add(`${l.id} intro ${i}`, t));
    l.takeaways.forEach((t, i) => add(`${l.id} takeaway ${i}`, t));
    for (const [k, s] of Object.entries(l.steps)) {
      add(`${l.id} step ${k} title`, s.title);
      add(`${l.id} step ${k} what`, s.what);
      add(`${l.id} step ${k} why`, s.why);
    }
    for (const e of l.examples) {
      add(`${l.id} example ${e.id} label`, e.label);
      add(`${l.id} example ${e.id} story`, e.story);
      add(`${l.id} example ${e.id} suggestion`, e.suggestion?.text);
    }
    for (const n of l.layout.synthetic) {
      add(`${l.id} node ${n.id}`, n.label);
      add(`${l.id} node ${n.id} sub`, n.sub);
    }
    for (const [k, v] of Object.entries(l.layout.labels)) add(`${l.id} wire ${k}`, v);
    const scene = sceneOf(l.id);
    add(`${l.id} scene chapter`, scene.chapter);
    add(`${l.id} scene`, scene.scene);
    scene.lookFor.forEach((t, i) => add(`${l.id} scene look ${i}`, t));
  }
  for (const c of chapters()) {
    add(`chapter ${c.number} title`, c.title);
    add(`chapter ${c.number} layman`, c.layman);
  }
  for (const [k, v] of Object.entries(DIFFICULTY_HINT)) add(`difficulty ${k}`, v);
  for (const id of STATION_IDS) {
    add(`${id} name`, STATIONS[id].name);
    add(`${id} blurb`, STATIONS[id].blurb);
  }
  for (const id of DEPARTMENT_IDS) {
    add(`${id} name`, DEPARTMENTS[id].name);
    add(`${id} blurb`, DEPARTMENTS[id].blurb);
  }
  for (const [k, v] of Object.entries(DECLINE_LABEL)) add(`decline ${k}`, v);
  for (const e of Object.values(DAY_EVENTS)) {
    add(`event ${e.id} title`, e.title);
    add(`event ${e.id} blurb`, e.blurb);
    add(`event ${e.id} watch`, e.watch);
  }
  for (const [k, m] of Object.entries(RULE_META)) {
    add(`rule ${k} label`, m.label);
    add(`rule ${k} help`, m.help);
  }
  return out;
}

describe('the three duplicated labels of the brief', () => {
  it('reads "Virtual Card & Token Vault", not "Virtual Card card masking"', () => {
    expect(plainText('Virtual Card Tokenisation & dCVV Masking')).toBe('Virtual Card & Token Vault');
    expect(plainText('Virtual Card Tokenisation & Dynamic CVV Flow')).toBe('Virtual Card & Token Vault');
    expect(plainText('Virtual Card tokenisation')).toBe('Virtual Card & Token Vault');
    expect(plainText('Virtual Card Token Vault')).not.toMatch(/virtual card.*virtual card/i);
    expect(plainText('Virtual Card tokenisation')).not.toMatch(/card card/i);
  });

  it('reads "BNPL Pay-in-4 Instalments", not "Buy Now Pay Later Buy Now Pay Later (4-split payment)"', () => {
    expect(plainText('BNPL Pay-in-4 Underwriting & Card Fallback')).toBe('BNPL Pay-in-4 Instalments');
    expect(plainText('BNPL Pay-in-4 Instalments')).toBe('BNPL Pay-in-4 Instalments');
    expect(stutter(plainText('BNPL Pay-in-4'))).toBeNull();
    expect(plainText('Buy Now Pay Later (Pay-in-4)')).not.toMatch(/Buy Now Pay Later.*Buy Now Pay Later/i);
    expect(plainText('BNPL (Pay-in-4)')).not.toMatch(/Buy Now Pay Later.*Buy Now Pay Later/i);
    expect(plainText(PROCESS_SHORT.C)).toBe('BNPL Pay-in-4 Instalments');
  });

  it('reads "3DS Identity & Risk Check", not "The extra identity check Risk Engine"', () => {
    expect(plainText('3-D Secure 2.x Risk Engine (Frictionless vs Challenge OTP)')).toBe('3DS Identity & Risk Check');
    expect(plainText('3DS Risk Engine')).toBe('3DS Identity & Risk Check');
    expect(plainText(PROCESS_SHORT.B)).toBe('3DS Identity & Risk Check');
    expect(plainText('The 3DS Risk Engine decides')).not.toMatch(/identity check risk engine/i);
  });

  it('gives chapters 4, 5 and 6 plain names of their own, with no stutter', () => {
    expect(plainText('EOD 3-Way Reconciliation & Suspense Accounting')).toBe('Night Books Match & Holding Box');
    expect(plainText('Instant Account-to-Account Transfers (A2A & pacs.008)')).toBe('Instant Bank-to-Bank Transfers');
    expect(plainText('AML Screening & Chargeback Dispute Resolution')).toBe('Suspicious-Money Checks & Refund Disputes');
    for (const l of LESSON_LIST) {
      expect(stutter(plainText(l.title)), l.id).toBeNull();
      expect(stutter(plainText(PROCESS_SHORT[l.id])), l.id).toBeNull();
    }
  });

  it('is stable: a curated name passes through the switch a second time untouched', () => {
    for (const name of [
      'Virtual Card & Token Vault',
      'BNPL Pay-in-4 Instalments',
      '3DS Identity & Risk Check',
      'Night Books Match & Holding Box',
      'Instant Bank-to-Bank Transfers',
      'Suspicious-Money Checks & Refund Disputes',
    ]) {
      expect(plainText(name)).toBe(name);
      expect(plainText(plainText(name))).toBe(name);
    }
  });
});

describe('no stutter anywhere in Concept Explorer', () => {
  it('names the toggle Fintech Expert and Concept Explorer', () => {
    expect(modeLabel('expert')).toBe('Fintech Expert');
    expect(modeLabel('beginner')).toBe('Concept Explorer');
  });

  it('writes no repeated word run in any title, step, story, quiz-free sentence or label', () => {
    const texts = allText();
    expect(texts.length).toBeGreaterThan(150);
    for (const [where, text] of texts) {
      const plain = plainText(text);
      expect(stutter(plain), `${where}: "${text}" → "${plain}"`).toBeNull();
    }
  });

  it('does not add a stutter the original did not have', () => {
    for (const [where, text] of allText()) {
      if (stutter(text) !== null) continue;
      expect(foldRepeats(plainText(text)), where).toBe(plainText(text));
    }
  });

  it('is idempotent: a second pass through the switch changes nothing', () => {
    for (const [where, text] of allText()) {
      const once = plainText(text);
      expect(plainText(once), `${where}: "${once}"`).toBe(once);
    }
  });

  it('names every desk and department without a repeat, in both modes', () => {
    for (const id of STATION_IDS) {
      for (const mode of ['expert', 'beginner'] as const) {
        expect(stutter(stationName(id, mode)), `${id} ${mode} name`).toBeNull();
        expect(stutter(stationTitle(id, mode)), `${id} ${mode} title`).toBeNull();
      }
    }
    for (const id of DEPARTMENT_IDS) {
      for (const mode of ['expert', 'beginner'] as const) {
        expect(stutter(departmentName(id, mode)), `${id} ${mode} name`).toBeNull();
        expect(stutter(departmentTitle(id, mode)), `${id} ${mode} title`).toBeNull();
      }
    }
  });

  it('catches a stutter when there is one (the detector itself works)', () => {
    expect(stutter('Virtual Card card masking')).toBe('card card');
    expect(stutter('Buy Now Pay Later Buy Now Pay Later (4-split payment)')).toBe('buy now pay later buy now pay later');
    expect(stutter('Virtual Card & Token Vault')).toBeNull();
  });
});
