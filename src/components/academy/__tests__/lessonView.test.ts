import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { levelById } from '../../../sim/academyCatalog';
import type { TermMode } from '../../../sim/terms';
import { LessonView, ViewLevelToggle } from '../LessonView';

const render = (id: string, roomy = false, viewLevel?: TermMode) => renderToStaticMarkup(createElement(LessonView, { level: levelById(id)!, roomy, viewLevel }));

describe('the structured lesson view', () => {
  it('shows the four sections and puts Simulate right under the step-by-step flow', () => {
    const out = render('1.2');
    for (const h of ['Real-World Scenario', 'Step-by-Step Operational Flow', 'Why It Matters', 'Edge Cases &amp; Real-World Failures']) expect(out).toContain(h);
    const steps = out.indexOf('data-testid="lesson-step-summary"');
    const simulate = out.indexOf('[▶ Simulate this Flow]');
    expect(steps).toBeGreaterThan(-1);
    expect(simulate).toBeGreaterThan(steps);
    expect(simulate).toBeLessThan(out.indexOf('data-testid="lesson-why"'));
    expect(out.match(/data-testid="lesson-flow-step"/g)?.length).toBe(levelById('1.2')!.stepByStepFlow.length);
  });

  it('collapses the accordions in the split view and opens them in Focus Mode', () => {
    expect(render('1.4')).toContain('data-testid="lesson-why" data-open="false"');
    expect(render('1.4', true)).toContain('data-testid="lesson-why" data-open="true"');
  });

  it('follows the Beginner / Expert View', () => {
    const beginner = render('1.2', true, 'beginner');
    expect(beginner).toContain('Card Frozen by User');
    expect(beginner).toContain('Pending Debit Card Hold');
    expect(beginner).not.toMatch(/RC 62|DR 1110/);
    const expert = render('1.2', true, 'expert');
    expect(expert).toContain('RC 62 Restricted Card');
    expect(expert).toContain('DR 1110 / CR 2110');
    const toggle = renderToStaticMarkup(createElement(ViewLevelToggle));
    expect(toggle).toContain('Beginner View');
    expect(toggle).toContain('Expert View');
  });
});
