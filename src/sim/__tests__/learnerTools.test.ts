import { describe, expect, it } from 'vitest';
import { emptyChaosStats } from '../../engine/chaos';
import { clampZoom, createZoomStore, scrollToKeep, wheelZoom, ZOOM_2D } from '../../store/zoomStore';
import { soundFor } from '../../utils/audioFX';
import { ACADEMY_CHAPTERS } from '../academyCatalog';
import { cheatSheetFileName, cheatSheetMarkdown } from '../cheatSheet';
import { LESSON_EXTRAS } from '../lessonExtras';
import type { BankView, PacketTrace } from '../types';

const levelIds = ACADEMY_CHAPTERS.flatMap((c) => c.levels.map((l) => l.id));

describe('Key terms and Explore Deeper', () => {
  it('every lesson has flash-card terms and 2 or 3 deeper topics, in both languages', () => {
    for (const locale of ['en', 'vi'] as const) {
      for (const id of levelIds) {
        const x = LESSON_EXTRAS[locale][id];
        expect(x, `${locale} ${id}`).toBeDefined();
        expect(x!.keyTerms.length, `${locale} ${id} terms`).toBeGreaterThanOrEqual(2);
        expect(x!.exploreDeeper.length, `${locale} ${id} deeper`).toBeGreaterThanOrEqual(2);
        expect(x!.exploreDeeper.length, `${locale} ${id} deeper`).toBeLessThanOrEqual(3);
      }
      expect(Object.keys(LESSON_EXTRAS[locale]).sort()).toEqual([...levelIds].sort());
    }
  });
});

describe('Fintech cheat sheet', () => {
  const day = new Date('2026-10-22T00:00:00Z');

  it('covers every lesson, the response codes and the GL accounts', () => {
    const md = cheatSheetMarkdown('en', day);
    for (const id of levelIds) expect(md).toContain(`#### ${id} `);
    for (const code of ['RC 51', 'RC 61', 'RC 62', 'RC 68']) expect(md).toContain(code.replace('RC ', ''));
    for (const gl of ['1110', '1120', '2010', '2110', '1910', '1310', '1015']) expect(md).toContain(gl);
    expect(cheatSheetFileName('en')).toBe('processcraft-fintech-cheat-sheet-en.md');
  });

  it('uses the exact Vietnamese GL names and response-code labels', () => {
    const md = cheatSheetMarkdown('vi', day);
    for (const name of [
      'Tạm khóa hạn mức thẻ tín dụng',
      'Khoanh giữ tài khoản thanh toán khả dụng',
      'Tài khoản thanh toán tiền gửi khả dụng',
      'Quỹ chờ quyết toán trả cửa hàng/Tổ chức thẻ',
      'Tài khoản treo tra soát sai lệch (Chờ xử lý lỗi mạng)',
      'Dư nợ cho vay Mua trước trả sau (BNPL)',
      'Quỹ tiền mặt tồn trong cây ATM/CDM',
      'Thẻ bị khóa bởi chủ thẻ (Restricted Card)',
      'Tài khoản không đủ số dư (Insufficient Funds)',
      'Vượt hạn mức giao dịch ngày',
      'Lỗi quá thời gian phản hồi mạng (Network Timeout)',
    ]) {
      expect(md).toContain(name);
    }
  });
});

describe('Map zoom', () => {
  it('clamps, zooms toward the wheel and keeps the point under the cursor', () => {
    expect(clampZoom(10)).toBe(ZOOM_2D.max);
    expect(clampZoom(0.01)).toBe(ZOOM_2D.min);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(wheelZoom(1, -100)).toBeGreaterThan(1);
    expect(wheelZoom(1, 100)).toBeLessThan(1);
    // The stage point under the cursor before and after the zoom is the same.
    const cursor = 300;
    const scroll = 120;
    const pad = 40;
    const next = scrollToKeep(cursor, scroll, pad, 1, 2);
    expect((scroll + cursor - pad) / 1).toBeCloseTo((next + cursor - pad) / 2, 9);
  });

  it('sends commands with a fresh serial and reports rounded percents', () => {
    const store = createZoomStore();
    store.getState().send('in');
    store.getState().send('fit');
    expect(store.getState().command).toEqual({ kind: 'fit', serial: 2 });
    store.getState().report(142.6);
    expect(store.getState().percent).toBe(143);
  });
});

describe('Sound effects', () => {
  const view = (stats = emptyChaosStats()): BankView => ({ chaos: { scenario: 'NONE', config: { posOutage: false, hsmFailure: false, congestion: false, fatigueSpike: false, scriptedDays: false }, stats, active: false } }) as unknown as BankView;
  const trace = (status: 'APPROVED' | 'DECLINED', done = true): PacketTrace => ({ id: 'p1', done, record: done ? { status } : null }) as unknown as PacketTrace;

  it('dings for an approved payment of the learner, buzzes for a decline, and is quiet otherwise', () => {
    expect(soundFor({ presetTrace: trace('APPROVED', false), view: view() }, { presetTrace: trace('APPROVED'), view: view() })).toBe('posSuccessDing');
    expect(soundFor({ presetTrace: null, view: view() }, { presetTrace: trace('DECLINED'), view: view() })).toBe('errorBuzz');
    expect(soundFor({ presetTrace: trace('APPROVED'), view: view() }, { presetTrace: trace('APPROVED'), view: view() })).toBeNull();
  });

  it('sounds the siren on a new velocity alert and buzzes on a new chaos fault', () => {
    const before = emptyChaosStats();
    expect(soundFor({ presetTrace: null, view: view(before) }, { presetTrace: null, view: view({ ...before, velocityAlerts: 1 }) })).toBe('botnetSiren');
    expect(soundFor({ presetTrace: null, view: view(before) }, { presetTrace: null, view: view({ ...before, posOutageDeclines: 2 }) })).toBe('errorBuzz');
  });
});
