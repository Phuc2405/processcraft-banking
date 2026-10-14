import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { levelById } from '../../../sim/academyCatalog';
import { GLOSSARY } from '../../../sim/academyKnowledge';
import { FlashcardsView, MessageInspector, QuizView, SimulateButton } from '../AcademyStudy';

const html = (el: Parameters<typeof renderToStaticMarkup>[0]): string => renderToStaticMarkup(el);

describe('the Academy study views', () => {
  it('shows the first flashcard term with its count, and the Simulate button for chapter 1', () => {
    const out = html(createElement(FlashcardsView));
    expect(out).toContain(GLOSSARY[0]!.term);
    expect(out).toContain(`1 / ${GLOSSARY.length}`);
    expect(out).toContain('[▶ Simulate this Flow]');
  });

  it('renders the chapter 1 quiz with every question and a disabled check button', () => {
    const out = html(createElement(QuizView));
    expect(out).toContain('Chapter 1 quiz');
    expect(out).toContain('data-testid="quiz-q-1-a"');
    expect(out).toContain('Answer every question to check');
  });

  it('disables Simulate on a desk no guided flow covers, and enables it on a flow', () => {
    expect(html(createElement(SimulateButton, { flow: null }))).toContain('disabled=""');
    expect(html(createElement(SimulateButton, { flow: 2 }))).not.toContain('disabled=""');
  });

  it('offers the inspector on a flow level and nothing on a flow-less one', () => {
    expect(html(createElement(MessageInspector, { level: levelById('1.1')! }))).toContain('Inspect the message and the ledger');
    expect(html(createElement(MessageInspector, { level: levelById('4.2')! }))).toBe('');
  });
});
