import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { WelcomeModal } from '../../components/bank/WelcomeModal';
import { welcomeMessages } from '../../components/bank/welcomeModal.messages';
import { languageMessages } from '../../components/shell/languageToggle.messages';
import { uiStore } from '../../store/uiStore';
import { bundleProblems, defineMessages, format, formatNodes, message, placeholdersOf, plural, registeredBundles, setActiveLocale, tf } from '../i18nHelper';

afterEach(() => setActiveLocale('en'));

describe('format and placeholders', () => {
  it('fills named placeholders and leaves unknown ones visible', () => {
    expect(format('Day {n} of {total}', { n: 2, total: 5 })).toBe('Day 2 of 5');
    expect(format('Refunded {amount}', {})).toBe('Refunded {amount}');
    expect(format('No values')).toBe('No values');
  });

  it('lists placeholders once, sorted', () => {
    expect(placeholdersOf('{b} and {a} and {b}')).toEqual(['a', 'b']);
  });

  it('puts React nodes where each language wants them', () => {
    const en = formatNodes('Press {key} to skip', { key: 'Esc' });
    const vi = formatNodes('Nhấn {key} để bỏ qua', { key: 'Esc' });
    expect(en).toHaveLength(3);
    expect(en[0]).toBe('Press ');
    expect(vi[2]).toBe(' để bỏ qua');
  });
});

describe('plural', () => {
  it('separates one from many in English only', () => {
    expect(plural(1, { one: 'payment', other: 'payments' }, 'en')).toBe('payment');
    expect(plural(2, { one: 'payment', other: 'payments' }, 'en')).toBe('payments');
    expect(plural(1, { one: 'giao dịch', other: 'giao dịch' }, 'vi')).toBe('giao dịch');
    expect(plural(1, { one: 'ONE', other: 'OTHER' }, 'vi')).toBe('OTHER');
  });
});

describe('tf', () => {
  it('uses the English when a label has no Vietnamese entry', () => {
    setActiveLocale('vi');
    expect(tf('A label nobody translated {n}', { n: 1 })).toBe('A label nobody translated 1');
  });
});

describe('message bundles', () => {
  it('reads the active language, or the one asked for', () => {
    const b = defineMessages('test.read', { hello: { en: 'Hello {name}', vi: 'Xin chào {name}' } });
    expect(message(b, 'hello', { name: 'An' })).toBe('Hello An');
    setActiveLocale('vi');
    expect(message(b, 'hello', { name: 'An' })).toBe('Xin chào An');
    expect(message(b, 'hello', { name: 'An' }, 'en')).toBe('Hello An');
  });

  it('flags an empty language, a placeholder mismatch and an uncopied Vietnamese entry', () => {
    const bad = defineMessages('test.bad', {
      empty: { en: 'Text', vi: ' ' },
      drift: { en: 'Total {amount}', vi: 'Tổng cộng' },
      copied: { en: 'Same words', vi: 'Same words' },
      fine: { en: 'OK', vi: 'OK' },
    });
    const problems = bundleProblems(bad, ['fine']);
    expect(problems).toEqual(expect.arrayContaining(['test.bad.empty: empty vi', 'test.bad.drift: vi placeholders differ from en', 'test.bad.copied: vi is the same as en']));
    expect(problems.some((p) => p.includes('fine'))).toBe(false);
  });

  it('every bundle a feature ships is complete in both languages', () => {
    const real = registeredBundles().filter((b) => !b.id.startsWith('test.'));
    expect(real.map((b) => b.id)).toEqual(expect.arrayContaining(['welcomeModal', 'languageToggle']));
    expect(real.flatMap((b) => bundleProblems(b))).toEqual([]);
  });
});

describe('Welcome modal language switcher', () => {
  const html = (): string => {
    uiStore.setState({ welcomeOpen: true });
    return renderToStaticMarkup(createElement(WelcomeModal, { onOpenAcademy: () => {}, onChooseBank: () => {} }));
  };

  it('shows the EN | VI toggle in the modal and draws every element in English', () => {
    setActiveLocale('en');
    const out = html();
    expect(out).toContain('data-testid="welcome-language"');
    expect(out).toContain('data-testid="welcome-language-en"');
    expect(out).toContain('data-testid="welcome-language-vi"');
    for (const key of ['badge', 'title', 'intro', 'guidedTitle', 'guidedBody', 'sandboxTitle', 'sandboxBody', 'academyTitle', 'academyBody', 'skip', 'recommended'] as const) {
      expect(out, key).toContain(welcomeMessages.messages[key].en.replace(/&/g, '&amp;'));
    }
    expect(out).toContain('Press <kbd');
    expect(out).toContain(' to skip');
    expect(out).not.toMatch(/Chọn chế độ|Để sau|Nhấn/);
  });

  it('draws every element in Vietnamese after the switch', () => {
    setActiveLocale('vi');
    const out = html();
    for (const key of ['badge', 'title', 'guidedTitle', 'sandboxTitle', 'academyTitle', 'skip', 'recommended'] as const) {
      expect(out, key).toContain(welcomeMessages.messages[key].vi);
    }
    expect(out).toContain('Nhấn <kbd');
    expect(out).toContain(' để bỏ qua');
    expect(out).not.toMatch(/Choose Your Experience Mode|Skip for now|to skip/);
    expect(out).toContain(`aria-label="${languageMessages.messages.label.vi}"`);
  });

  it('marks the active language on the toggle', () => {
    setActiveLocale('vi');
    expect(html()).toMatch(/data-testid="welcome-language"[^>]*data-locale="vi"/);
  });
});
