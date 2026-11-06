/**
 * Regression suite §8: the 2D / 3D viewports and the graphics pipeline. Station-hover wire highlights, directional wire labels that
 * never collide or clip, and GPU memory freed on unmount (geometries, materials, textures, the renderer, pooled objects).
 */

import fc from 'fast-check';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { BAY_ROWS } from '../../../components/bank/CitBay2D';
import { CashLinesView } from '../../../components/bank/CashLines2D';
import { bindContextEvents, disposeObject, disposeRenderer, ObjectPool, type ContextTarget, type SceneNode } from '../../../components/bank/office/webglSafety';
import { citMessages, wireLabelKey } from '../../../components/ops/cit.messages';
import { CIT_BAY, cashWireLabel, PLACE_BOX, STAGE, WIRE_BADGE, wireBadgeWidth } from '../../../engine/plan/layout';
import { setActiveLocale } from '../../../i18n/localeCore';
import { bankStore } from '../../../store/bankStore';
import { useWireHoverStore, useWireHover } from '../../../store/wireHoverStore';
import { CIT_FLOW, FLOW_IDS } from '../../../types/viewport';
import { message } from '../../../utils/i18nHelper';
import { CASH_WIRES, FLOW_WIRES, litWires, routeDirs, WIRE_ENDS, wireNodeOf, wiresAt, type CashWire, type WireNode } from '../../cashWires';
import { CIT_DEMOS } from '../../citEngine';
import { freshBank, src } from './harness';

const NODES: readonly WireNode[] = ['VAULT', 'TELLER', 'ATM', 'BAY'];
const DIRS = [null, 'IN', 'OUT'] as const;
const label = (w: CashWire, d: (typeof DIRS)[number], locale: 'en' | 'vi'): string => message(citMessages, wireLabelKey(w, d), undefined, locale);

beforeEach(() => {
  freshBank();
  useWireHoverStore.getState().set(null);
});

describe('§8.1 station hover lights its wires and dims the rest', () => {
  it('lights exactly the wires touching the hovered station, on any flow', () => {
    for (const node of NODES) {
      expect(wiresAt(node).length, node).toBeGreaterThan(0);
      for (const w of wiresAt(node)) expect(WIRE_ENDS[w], `${node} ${w}`).toContain(node);
      const lit = litWires(null, null, node)!;
      expect([...lit].sort()).toEqual([...wiresAt(node)].sort());
      for (const flow of FLOW_IDS) for (const w of wiresAt(node)) expect(litWires(flow, null, node)!.has(w), `flow ${flow} ${node} ${w}`).toBe(true);
    }
    expect(wiresAt('VAULT').sort()).toEqual(['ATM', 'BAY', 'TELLER']);
    expect(litWires(null, null, null)).toBeNull();
  });

  it('adds the hovered station’s wires to a flow’s or CIT child’s own route, never removing one (property)', () => {
    fc.assert(
      fc.property(fc.constantFrom(null, ...FLOW_IDS), fc.constantFrom(null, ...CIT_DEMOS), fc.constantFrom(null, ...NODES), (flow, child, hover) => {
        const lit = litWires(flow, child, hover);
        const base = litWires(flow, child, null);
        if (base) for (const w of base) expect(lit!.has(w)).toBe(true);
        if (hover) for (const w of wiresAt(hover)) expect(lit!.has(w)).toBe(true);
        if (!base && !hover) expect(lit).toBeNull();
      }),
    );
  });

  it('dims every unlit wire to 0.2 in 2D and keeps the lit ones at full strength', () => {
    const out = renderToStaticMarkup(createElement(CashLinesView, { flows: [], route: litWires(null, null, 'ATM'), hovered: true }));
    for (const w of CASH_WIRES) {
      const lit = wiresAt('ATM').includes(w);
      expect(out, w).toMatch(new RegExp(`data-cash-line="${w}"[^>]*opacity="${lit ? 1 : 0.2}"`));
    }
    // With nothing narrowing the view every wire shows at its idle weight.
    const idle = renderToStaticMarkup(createElement(CashLinesView, { flows: [] }));
    for (const w of CASH_WIRES) expect(idle).toMatch(new RegExp(`data-cash-line="${w}"[^>]*opacity="1"`));
  });

  it('maps the desks to their wire node, and folds the 3D hover place into the same highlight', () => {
    expect(wireNodeOf('MAIN_CASH_VAULT')).toBe('VAULT');
    expect(wireNodeOf('TELLER_CASH')).toBe('TELLER');
    expect(wireNodeOf('ATM_CASH')).toBe('ATM');
    expect(wireNodeOf('GATE_POS')).toBeNull();
    expect(wireNodeOf(null)).toBeNull();
    expect(useWireHover).toBeTypeOf('function');
    bankStore.getState().setHoverPlace('TELLER_CASH');
    expect(wireNodeOf(bankStore.getState().hoverPlace)).toBe('TELLER');
    bankStore.getState().setHoverPlace(null);
    useWireHoverStore.getState().set('BAY');
    expect(useWireHoverStore.getState().node).toBe('BAY');
    // 2D writes the card under the pointer; the 3D bay writes 'BAY'; both maps read the same hook.
    expect(src('components/bank/BankMap.tsx')).toContain("setWireHover((target.closest?.('[data-wire-node]')?.getAttribute('data-wire-node') as WireNode | null) ?? wireNodeOf(id))");
    expect(src('components/bank/office/LoadingBay3D.tsx')).toContain("useWireHoverStore.getState().set(on ? 'BAY' : null)");
    expect(src('components/bank/office/VaultCash3D.tsx')).toContain('useWireHover()');
    expect(src('components/bank/CashLines2D.tsx')).toContain('litWires(flow, child, hover)');
  });

  it('lights only the cash flows’ wires: 03 the ATM line, 06 the teller line, 09 the whole network', () => {
    expect(FLOW_WIRES[3]).toEqual(['ATM']);
    expect(FLOW_WIRES[6]).toEqual(['TELLER']);
    expect([...(FLOW_WIRES[CIT_FLOW] ?? [])].sort()).toEqual([...CASH_WIRES].sort());
    for (const f of [1, 2, 4, 5, 7, 8] as const) expect(litWires(f, null, null), `flow ${f}`).toBeNull();
  });
});

describe('§8.2 directional wire labels', () => {
  it('names each wire’s station in Vietnamese, in every direction', () => {
    const station: Readonly<Record<CashWire, string>> = { TELLER: 'Quầy GDV', ATM: 'Hộc ATM', BAY: 'Sảnh CIT', BAY_TELLER: 'Quầy GDV' };
    for (const w of CASH_WIRES) for (const d of DIRS) expect(label(w, d, 'vi'), `${w} ${d}`).toContain(station[w]);
    expect(label('TELLER', null, 'vi')).toContain('➔ Quầy GDV');
    expect(label('ATM', null, 'vi')).toContain('➔ Hộc ATM');
    expect(label('BAY', null, 'vi')).toContain('➔ Sảnh CIT');
    // Out of the vault points at the station, into it points back.
    expect(label('ATM', 'OUT', 'vi')).toContain('➔');
    expect(label('TELLER', 'IN', 'vi')).toContain('⬅');
  });

  it('has a non-empty label for every wire and direction in both languages', () => {
    for (const locale of ['en', 'vi'] as const) for (const w of CASH_WIRES) for (const d of DIRS) expect(label(w, d, locale).trim().length, `${locale} ${w} ${d}`).toBeGreaterThan(3);
  });

  it('places every label on the stage, clear of every card, the hall’s text rows and each other', () => {
    type Box = { x0: number; x1: number; y0: number; y1: number };
    const cards: Box[] = [...Object.values(PLACE_BOX).map((b) => ({ x0: b.cx - b.w / 2, x1: b.cx + b.w / 2, y0: b.cy - b.h / 2, y1: b.cy + b.h / 2 })), { x0: CIT_BAY.x, x1: CIT_BAY.x + CIT_BAY.w, y0: CIT_BAY.y + BAY_ROWS.header, y1: CIT_BAY.y + CIT_BAY.h }];
    const clear = (a: Box, b: Box): boolean => a.x1 <= b.x0 || a.x0 >= b.x1 || a.y1 <= b.y0 || a.y0 >= b.y1;
    for (const locale of ['en', 'vi'] as const) {
      for (const d of DIRS) {
        const boxes = CASH_WIRES.map((w) => {
          const width = wireBadgeWidth(label(w, d, locale));
          const l = cashWireLabel(w, width);
          const [hw, hh] = l.vertical ? [WIRE_BADGE.h / 2, width / 2] : [width / 2, WIRE_BADGE.h / 2];
          return { w, x0: l.x - hw, x1: l.x + hw, y0: l.y - hh, y1: l.y + hh };
        });
        for (const b of boxes) {
          expect(b.x0 >= 0 && b.x1 <= STAGE.width && b.y0 >= 0 && b.y1 <= STAGE.height, `${b.w} ${locale} ${d} not clipped`).toBe(true);
          for (const c of cards) expect(clear(b, c), `${b.w} ${locale} ${d} clear of the card at ${c.x0},${c.y0}`).toBe(true);
          for (const o of boxes) if (o !== b) expect(clear(b, o), `${b.w} vs ${o.w} ${locale} ${d}`).toBe(true);
        }
      }
    }
  });

  it('renders each CIT child’s own direction on its wires, and the SBV child follows the toggle', () => {
    setActiveLocale('vi');
    for (const child of CIT_DEMOS) {
      for (const sbv of ['OUT', 'IN'] as const) {
        const dirs = routeDirs(child, sbv);
        const out = renderToStaticMarkup(createElement(CashLinesView, { flows: [], route: litWires(CIT_FLOW, child, null), dirs }));
        for (const [w, d] of Object.entries(dirs) as [CashWire, 'IN' | 'OUT'][]) {
          expect(out, `${child} ${w}`).toContain(`data-testid="cash-wire-label-${w}" data-dir="${d}"`);
          expect(out, `${child} ${w}`).toContain(label(w, d, 'vi'));
        }
      }
    }
    expect(routeDirs('SBV', 'OUT')).toEqual({ BAY: 'OUT' });
    expect(routeDirs('SBV', 'IN')).toEqual({ BAY: 'IN' });
    expect(routeDirs(null)).toEqual({});
  });
});

describe('§8.3 GPU memory is freed on unmount', () => {
  const disposable = () => {
    const d = { n: 0, dispose() { d.n++; } };
    return d;
  };

  it('disposes every geometry, material and texture of a scene exactly once, shared ones included', () => {
    const geo = disposable();
    const tex = Object.assign(disposable(), { isTexture: true as const });
    const uniformTex = Object.assign(disposable(), { isTexture: true as const });
    const mat = Object.assign(disposable(), { map: tex });
    const shader = Object.assign(disposable(), { uniforms: { u: { value: uniformTex } } });
    const scene: SceneNode = { children: [{ geometry: geo, material: mat }, { geometry: geo, material: [mat, shader] }, { children: [{ geometry: disposable(), material: null }] }] };
    expect(disposeObject(scene)).toEqual({ geometries: 2, materials: 2, textures: 2 });
    for (const d of [geo, tex, uniformTex, mat, shader]) expect(d.n).toBe(1);
    expect(disposeObject(null)).toEqual({ geometries: 0, materials: 0, textures: 0 });
  });

  it('frees the renderer and its render lists, and tolerates a renderer that never came up', () => {
    const lists = disposable();
    const gl = Object.assign(disposable(), { renderLists: lists });
    disposeRenderer(gl);
    expect(gl.n).toBe(1);
    expect(lists.n).toBe(1);
    expect(() => disposeRenderer(null)).not.toThrow();
  });

  it('unbinds the WebGL context listeners it added', () => {
    const live = new Map<string, number>();
    const canvas: ContextTarget = {
      addEventListener: (t) => void live.set(t, (live.get(t) ?? 0) + 1),
      removeEventListener: (t) => void live.set(t, (live.get(t) ?? 0) - 1),
    };
    const unbind = bindContextEvents(canvas, { onLost: () => undefined });
    expect(live.get('webglcontextlost')).toBe(1);
    unbind();
    expect([...live.values()].every((n) => n === 0)).toBe(true);
  });

  it('caps a pool, reuses what it gave back and disposes all of it on drain', () => {
    let made = 0;
    const freed: number[] = [];
    const pool = new ObjectPool(() => ++made, 2, (n) => freed.push(n));
    const a = pool.acquire()!;
    pool.acquire();
    expect(pool.acquire()).toBeNull();
    pool.release(a);
    expect(pool.acquire()).toBe(a);
    expect(made).toBe(2);
    pool.drain();
    expect(freed.sort()).toEqual([1, 2]);
    expect(pool.size).toBe(0);
  });

  it('wires the cleanup into every 3D unmount path', () => {
    const office = src('components/bank/office/Office3D.tsx');
    expect(office).toContain('disposeObject(t3.scene);');
    expect(office).toContain('disposeRenderer(t3.gl);');
    expect(office).toContain('t3.unbind();');
    expect(src('components/bank/office/VaultCash3D.tsx')).toContain('useEffect(() => () => pool.drain(), [pool]);');
    expect(src('components/bank/office/LoadingBay3D.tsx')).toContain('pool.drain();');
  });
});
