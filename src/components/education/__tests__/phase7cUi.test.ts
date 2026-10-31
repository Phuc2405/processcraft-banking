import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { LESSONS } from '../../../sim/learning';
import { localLesson } from '../../../sim/learningVi';
import { flowText } from '../../../sim/guidedFlows';
import { uiStore } from '../../../store/uiStore';
import { hasVietnamese, setActiveLocale } from '../../../utils/i18nHelper';
import { WELCOME_MODES, WelcomeModal } from '../../bank/WelcomeModal';
import { welcomeMessages } from '../../bank/welcomeModal.messages';
import { ScopeNote } from '../../shell/ScopeNote';
import { scopeNoteMessages } from '../../shell/scopeNote.messages';
import { ScenarioPicker } from '../ScenarioPicker';
import { walkMessages } from '../walkthrough.messages';

afterEach(() => setActiveLocale('en'));

const picker = () => {
  const lesson = localLesson(LESSONS.E);
  return renderToStaticMarkup(createElement(ScenarioPicker, { lessonId: 'E', examples: lesson.examples, value: 'split', onChange: () => {}, accent: '#38bdf8', testId: 'walk-example-bar' }));
};

describe('test-scenario picker', () => {
  it('is a labelled glass pill with the scenario count, in English', () => {
    const out = picker();
    expect(out).toContain('🧪');
    expect(out).toContain('Test Scenarios');
    expect(out).toMatch(/data-testid="walk-example-bar-count"[^>]*>6</);
    expect(out).toContain('aria-haspopup="listbox"');
    expect(out).not.toContain('<select');
    expect(hasVietnamese(out)).toBe(false);
  });

  it('reads in Vietnamese', () => {
    setActiveLocale('vi');
    const out = picker();
    expect(out).toContain('Kịch bản thử nghiệm');
    expect(out).toContain('6 kịch bản thử nghiệm');
  });

  it('has the brief’s group names', () => {
    expect(walkMessages.messages.groupHappy.vi).toBe('Luồng chuẩn (Happy Path)');
    expect(walkMessages.messages.groupEdge.vi).toBe('Tình huống lỗi & Ngoại lệ (Edge Cases)');
    expect(walkMessages.messages.chip.vi).toBe('Chương {chapter}: Bước {step}/{total}');
  });
});

describe('scope disclaimer', () => {
  it('uses the exact wording in each language', () => {
    expect(scopeNoteMessages.messages.text.en).toBe('Simulates ~80% of core real-world banking workflows and scenarios. Production environments may include additional legacy edge cases.');
    expect(scopeNoteMessages.messages.text.vi).toBe('Sa bàn mô phỏng ~80% các quy trình & kịch bản cốt lõi trong ngân hàng thực tế. Các hệ thống vận hành thực tế có thể có thêm quy tắc ngoại lệ phức tạp hơn.');
    expect(renderToStaticMarkup(createElement(ScopeNote))).toContain('ℹ️');
  });

  it('sits at the foot of the Welcome modal, in the active language', () => {
    uiStore.setState({ welcomeOpen: true });
    const html = () => renderToStaticMarkup(createElement(WelcomeModal, { onOpenAcademy: () => {}, onChooseBank: () => {} }));
    expect(html()).toContain('data-testid="welcome-scope-note"');
    expect(html()).toContain('Production environments may include');
    setActiveLocale('vi');
    expect(html()).toContain('Sa bàn mô phỏng ~80%');
    expect(html()).not.toContain('Production environments');
  });
});

describe('the mode chooser', () => {
  const html = () => {
    uiStore.setState({ welcomeOpen: true });
    return renderToStaticMarkup(createElement(WelcomeModal, { onOpenAcademy: () => {}, onChooseBank: () => {} }));
  };

  it('offers the four modes in a compact grid, inside a bounded window with one scrolling part', () => {
    const out = html();
    expect(WELCOME_MODES.map((m) => m.id)).toEqual(['guided', 'sandbox', 'academy', 'roleplay']);
    for (const m of WELCOME_MODES) expect(out).toContain(`data-testid="welcome-${m.id}"`);
    expect(out).toContain('grid-cols-1 gap-3 sm:grid-cols-2');
    expect(out).toContain('max-h-[85vh] w-[92%] max-w-[680px]');
    expect(out).toMatch(/min-h-0 flex-1 overflow-y-auto[^"]*" data-testid="welcome-body"/);
  });

  it('writes each description short enough for its two lines, so the clamp never eats the meaning', () => {
    for (const m of WELCOME_MODES) {
      const { en, vi } = welcomeMessages.messages[m.body];
      expect(en.length, `${m.id} en`).toBeLessThanOrEqual(100);
      expect(vi.length, `${m.id} vi`).toBeLessThanOrEqual(100);
    }
  });

  it('marks the mode in use', () => {
    const beginner = { scope: 'beginner', academyOpen: false, staffDesk: null } as const;
    expect(WELCOME_MODES.filter((m) => m.isCurrent(beginner)).map((m) => m.id)).toEqual(['guided']);
    expect(WELCOME_MODES.filter((m) => m.isCurrent({ ...beginner, academyOpen: true })).map((m) => m.id)).toEqual(['academy']);
  });
});

describe('preset 03 label', () => {
  it('is plain language in both languages', () => {
    expect(flowText(3).title).toBe('Automated Cash Deposit');
    setActiveLocale('vi');
    expect(flowText(3).title).toBe('Nộp tiền mặt qua ATM/CDM');
  });
});
