import { it, expect } from 'vitest';
import { LESSONS } from '../../sim/learning';
import { localLesson } from '../../sim/learningVi';
it('vi covers every step/example/label', () => {
  for (const l of Object.values(LESSONS)) {
    const v = localLesson(l, 'vi');
    const missing: string[] = [];
    for (const k of Object.keys(l.steps)) if (v.steps[k] === l.steps[k]) missing.push(`${l.id} step ${k}`);
    l.examples.forEach((e, i) => { if (v.examples[i]!.story === e.story) missing.push(`${l.id} ex ${e.id}`); if (e.suggestion && v.examples[i]!.suggestion!.text === e.suggestion.text) missing.push(`${l.id} sug ${e.id}`); });
    const lays = { [l.graph]: [l.layout, v.layout], ...Object.fromEntries(Object.entries(l.layouts ?? {}).map(([g, x]) => [g, [x, v.layouts![g as keyof typeof v.layouts]]])) };
    for (const [g, [a, b]] of Object.entries(lays) as any) {
      for (const k of Object.keys(a.labels)) if (a.labels[k] === b.labels[k]) missing.push(`${l.id} ${g} label ${k}`);
      a.synthetic.forEach((s: any, i: number) => { if (s.label === b.synthetic[i].label) missing.push(`${l.id} syn ${s.id}`); });
      a.syntheticEdges.forEach((s: any, i: number) => { if (s.label && s.label === b.syntheticEdges[i].label) missing.push(`${l.id} synE ${s.id}`); });
    }
    expect(missing).toEqual([]);
  }
});
