import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { demoActionsFor } from '../../../sim/demoActions';
import { DEMO_GROUPS } from '../../../sim/demoGroups';
import { FLOW_IDS } from '../../../types/viewport';
import { DROPDOWN_BELOW_PX, dockLayout, MAX_INLINE, pillWidth, rowWidth, type DockItem } from '../dockOverflow';

const item = (id: string, variant: DockItem['variant'], text = `▶ ${id} label`): DockItem => ({ id, variant, text });

describe('the dock is one row of pills or one dropdown, never a mix', () => {
  it('shows every pill inline when they all fit', () => {
    expect(dockLayout([item('a', 'success'), item('b', 'danger')], 2_000)).toBe('inline');
  });

  it('turns the whole area into a dropdown as soon as one pill would not fit', () => {
    const items = [item('a', 'success'), item('b', 'danger'), item('c', 'warning')];
    expect(dockLayout(items, rowWidth(items))).toBe('inline');
    expect(dockLayout(items, rowWidth(items) - 1)).toBe('dropdown');
  });

  it('never puts more than MAX_INLINE pills on the row, however wide the map', () => {
    const items = Array.from({ length: MAX_INLINE + 1 }, (_, i) => item(`x${i}`, 'success', 'x'));
    expect(dockLayout(items, 100_000)).toBe('dropdown');
    expect(dockLayout(items.slice(0, MAX_INLINE), 100_000)).toBe('inline');
  });

  it('is always a dropdown under 1024px of window', () => {
    expect(dockLayout([item('a', 'success')], 5_000, DROPDOWN_BELOW_PX - 1)).toBe('dropdown');
    expect(dockLayout([item('a', 'success')], 5_000, DROPDOWN_BELOW_PX)).toBe('inline');
  });

  it('measures a pill by its text', () => {
    expect(pillWidth('abcd')).toBeGreaterThan(pillWidth('ab'));
  });

  it('gives every real flow and sub-process exactly one of the two layouts', () => {
    for (const f of FLOW_IDS) {
      for (const g of [null, ...DEMO_GROUPS.filter((d) => d.flow === f).map((d) => d.id)]) {
        const actions = demoActionsFor(f, g).map((a) => ({ id: a.id, variant: a.variant, text: `${a.icon} ${a.label()}` }));
        expect(['inline', 'dropdown'], `${f} ${g}`).toContain(dockLayout(actions, 1_000));
      }
    }
  });

  it('has no "More scenarios" pop-over left in the dock', () => {
    const src = readFileSync(resolve(__dirname, '../PresetDock.tsx'), 'utf8');
    expect(src).not.toMatch(/More scenarios|Thêm kịch bản|OverflowMenu|dock-more/);
  });
});
