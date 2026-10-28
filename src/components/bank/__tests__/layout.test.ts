import { describe, expect, it } from 'vitest';
import { setActiveLocale } from '../../../i18n/locale';
import { t } from '../../../i18n/t';
import { DEPARTMENT_IDS, DEPARTMENTS, EXTERNAL_IDS, STATION_IDS, WIRES, edgeId, type PlaceId } from '../../../sim/topology';
import { OFFICE_PLACE_BOX } from '../office/officePlan';
import { deskPose, toWorld } from '../office/layout3d';
import { BAND, BANK_WIRES, CARD, DEPT_BOX, GATEWAYS, PLACE_BOX, STAGE, TIP_PREFERENCE, TIP_SIDE, pathOfWire, roundedPath, tipRect, wireById } from '../layout';

describe('the bank map', () => {
  it('gives every place on the topology a box on the stage', () => {
    for (const id of [...STATION_IDS, ...EXTERNAL_IDS] as PlaceId[]) {
      const b = PLACE_BOX[id];
      expect(b, id).toBeDefined();
      expect(b.cx - b.w / 2, id).toBeGreaterThanOrEqual(0);
      expect(b.cy - b.h / 2, id).toBeGreaterThanOrEqual(0);
      expect(b.cx + b.w / 2, id).toBeLessThanOrEqual(STAGE.width);
      expect(b.cy + b.h / 2, id).toBeLessThanOrEqual(STAGE.height);
    }
  });

  it('keeps every department frame on the stage', () => {
    expect(Object.keys(DEPT_BOX).sort()).toEqual([...DEPARTMENT_IDS].sort());
    for (const [id, d] of Object.entries(DEPT_BOX)) {
      expect(d.x, id).toBeGreaterThanOrEqual(0);
      expect(d.y, id).toBeGreaterThanOrEqual(0);
      expect(d.x + d.w, id).toBeLessThanOrEqual(STAGE.width);
      expect(d.y + d.h, id).toBeLessThanOrEqual(STAGE.height);
    }
  });

  it('draws one wire for each link in the topology, and nothing else', () => {
    expect(BANK_WIRES).toHaveLength(WIRES.length);
    for (const [from, to] of WIRES) {
      const wire = wireById(edgeId(from, to));
      expect(wire, `${from}>${to}`).toBeDefined();
      expect(pathOfWire(edgeId(from, to))).toBe(wire?.path);
    }
    expect(pathOfWire('NOPE>NOWHERE')).toBeNull();
  });

  it('routes every wire as clean right angles between real points', () => {
    for (const w of BANK_WIRES) {
      expect(w.path, w.id).not.toMatch(/NaN|undefined|Infinity/);
      expect(w.path.startsWith('M'), w.id).toBe(true);
      expect(w.points.length, w.id).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < w.points.length; i++) {
        const a = w.points[i - 1]!;
        const b = w.points[i]!;
        expect(a[0] === b[0] || a[1] === b[1], `${w.id} leg ${i} is not horizontal or vertical`).toBe(true);
      }
      expect(Number.isFinite(w.labelAt[0]) && Number.isFinite(w.labelAt[1]), w.id).toBe(true);
    }
  });

  it('starts each wire on the edge of the place it leaves and ends it on the edge of the place it enters', () => {
    const onEdge = (place: PlaceId, [x, y]: readonly [number, number]): boolean => {
      const b = PLACE_BOX[place];
      const insideX = x >= b.cx - b.w / 2 - 0.5 && x <= b.cx + b.w / 2 + 0.5;
      const insideY = y >= b.cy - b.h / 2 - 0.5 && y <= b.cy + b.h / 2 + 0.5;
      const touchesSide = x === b.cx - b.w / 2 || x === b.cx + b.w / 2 || y === b.cy - b.h / 2 || y === b.cy + b.h / 2;
      return insideX && insideY && touchesSide;
    };
    for (const w of BANK_WIRES) {
      expect(onEdge(w.from, w.points[0]!), `${w.id} start`).toBe(true);
      expect(onEdge(w.to, w.points[w.points.length - 1]!), `${w.id} end`).toBe(true);
    }
  });

  it('rounds corners without ever overshooting a short leg', () => {
    const d = roundedPath([[0, 0], [10, 0], [10, 10]], 50);
    // A radius larger than half the leg is cut down to 5, so the curve starts and ends mid-leg.
    expect(d).toBe('M0 0L5 0Q10 0 10 5L10 10');
    expect(roundedPath([])).toBe('');
  });
});

describe('the A2A inflow channel on the overview map', () => {
  it('sits in the gate column alongside POS and E-Commerce', () => {
    const a2a = PLACE_BOX.GATE_A2A;
    expect(a2a.cx).toBe(PLACE_BOX.GATE_POS.cx);
    expect(a2a.cx).toBe(PLACE_BOX.GATE_ECOM.cx);
    expect(a2a.cy).toBeGreaterThan(PLACE_BOX.GATE_POS.cy);
    expect(a2a.cy).toBeLessThan(PLACE_BOX.GATE_ECOM.cy);
  });

  it('is wired straight into the Debit CASA ledger, with a labelled wire the packets fly along', () => {
    const wire = BANK_WIRES.find((w) => w.from === 'GATE_A2A' && w.to === 'LEDGER_DEBIT');
    expect(wire).toBeDefined();
    expect(wire?.showLabel).toBe(true);
    expect(wire?.label).toBeTruthy();
    expect(wire?.path.startsWith('M')).toBe(true);
    // It leaves from the gate's right edge and arrives at the ledger card.
    const first = wire?.points[0];
    const last = wire?.points[(wire?.points.length ?? 1) - 1];
    expect(first?.[0]).toBe(PLACE_BOX.GATE_A2A.cx + PLACE_BOX.GATE_A2A.w / 2);
    const debit = PLACE_BOX.LEDGER_DEBIT;
    expect(last?.[0]).toBeGreaterThanOrEqual(debit.cx - debit.w / 2);
    expect(last?.[0]).toBeLessThanOrEqual(debit.cx + debit.w / 2);
  });
});

describe('where a desk’s description opens', () => {
  const rect = (id: PlaceId) => {
    const b = PLACE_BOX[id];
    return { x0: b.cx - b.w / 2, y0: b.cy - b.h / 2, x1: b.cx + b.w / 2, y1: b.cy + b.h / 2 };
  };
  const overlap = (a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }): number =>
    Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const places = Object.keys(PLACE_BOX) as PlaceId[];

  it('opens above the desk, and on the next side only where above would leave the stage', () => {
    for (const id of places) {
      const r = tipRect(id, TIP_SIDE[id]);
      expect(r.x0, id).toBeGreaterThanOrEqual(0);
      expect(r.y0, id).toBeGreaterThanOrEqual(0);
      expect(r.x1, id).toBeLessThanOrEqual(STAGE.width);
      expect(r.y1, id).toBeLessThanOrEqual(STAGE.height);
      const fits = (side: (typeof TIP_PREFERENCE)[number]) => {
        const t = tipRect(id, side);
        return t.x0 >= 0 && t.y0 >= 0 && t.x1 <= STAGE.width && t.y1 <= STAGE.height;
      };
      expect(TIP_SIDE[id], id).toBe(TIP_PREFERENCE.find(fits));
    }
    // Most desks open above; only the top row and the edge columns fall back.
    expect(places.filter((id) => TIP_SIDE[id] === 'above').length).toBeGreaterThan(places.length / 2);
    expect(TIP_SIDE.LEDGER_DEBIT).toBe('above');
    expect(overlap(tipRect('LEDGER_DEBIT', TIP_SIDE.LEDGER_DEBIT), rect('LEDGER_CREDIT'))).toBe(0);
  });

  it('keeps clear space between stacked desks in the same column', () => {
    for (const a of places) {
      for (const b of places) {
        if (a >= b) continue;
        const A = PLACE_BOX[a];
        const B = PLACE_BOX[b];
        if (Math.abs(A.cx - B.cx) > 1) continue;
        const gap = Math.abs(A.cy - B.cy) - (A.h + B.h) / 2;
        expect(gap, `${a} / ${b}`).toBeGreaterThanOrEqual(36);
      }
    }
    expect(PLACE_BOX.LEDGER_CREDIT.cy - PLACE_BOX.LEDGER_DEBIT.cy - CARD.h).toBeGreaterThanOrEqual(48);
  });
});

describe('Phase 1A compact grid', () => {
  const EOD = ['EOD_BATCH', 'EOD_VISA', 'RECON', 'SUSPENSE', 'OUT_SETTLED'] as const;
  const outBottom = Math.max(PLACE_BOX.OUT_APPROVED.cy + PLACE_BOX.OUT_APPROVED.h / 2, PLACE_BOX.OUT_DECLINED.cy + PLACE_BOX.OUT_DECLINED.h / 2);

  it('stacks the night cluster in the right column under Approved/Declined', () => {
    const col = PLACE_BOX.OUT_APPROVED.cx;
    expect(PLACE_BOX.EOD_BATCH.cx).toBe(col);
    for (const id of EOD) {
      const b = PLACE_BOX[id];
      expect(b.cy - b.h / 2, id).toBeGreaterThan(outBottom);
      expect(b.cx - b.w / 2, id).toBeGreaterThanOrEqual(DEPT_BOX.EOD.x);
      expect(b.cx + b.w / 2, id).toBeLessThanOrEqual(DEPT_BOX.EOD.x + DEPT_BOX.EOD.w);
      expect(b.cy + b.h / 2, id).toBeLessThanOrEqual(DEPT_BOX.EOD.y + DEPT_BOX.EOD.h);
    }
    expect(DEPT_BOX.EOD.x).toBeGreaterThan(DEPT_BOX.LEDGER.x + DEPT_BOX.LEDGER.w);
  });

  it('keeps department frames from overlapping', () => {
    const ds = Object.entries(DEPT_BOX);
    for (const [a, A] of ds)
      for (const [b, B] of ds) {
        if (a >= b) continue;
        const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
        const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
        expect(ox > 0 && oy > 0, `${a} / ${b}`).toBe(false);
      }
  });

  it('raises the Phase 8 band flush under the processing grid, left of the night cycle', () => {
    const band = new Set(DEPARTMENTS.ENTRANCE.stations.concat(DEPARTMENTS.COMPLIANCE.stations, DEPARTMENTS.BACKOFFICE.stations));
    const core = (Object.keys(PLACE_BOX) as PlaceId[]).filter((p) => !band.has(p as never));
    const above = core.filter((p) => PLACE_BOX[p].cx + PLACE_BOX[p].w / 2 < BAND.trunk);
    const bottom = Math.max(...above.map((p) => PLACE_BOX[p].cy + PLACE_BOX[p].h / 2));
    expect(STAGE.width / STAGE.height).toBeGreaterThan(1.3);
    for (const id of band) {
      const top = PLACE_BOX[id].cy - PLACE_BOX[id].h / 2;
      expect(top, id).toBeGreaterThan(bottom);
      expect(PLACE_BOX[id].cx + PLACE_BOX[id].w / 2, id).toBeLessThan(BAND.trunk);
    }
    const bandTop = Math.min(...[...band].map((p) => PLACE_BOX[p as PlaceId].cy - PLACE_BOX[p as PlaceId].h / 2));
    expect(bandTop - bottom).toBeLessThan(150);
  });

  it('parks the sidewalk ATM at the top-right, beside Declined and Approved', () => {
    const right = (p: PlaceId) => PLACE_BOX[p].cx + PLACE_BOX[p].w / 2;
    const left = (p: PlaceId) => PLACE_BOX[p].cx - PLACE_BOX[p].w / 2;
    expect(PLACE_BOX.GATE_ATM.cy).toBe(PLACE_BOX.OUT_DECLINED.cy);
    expect(PLACE_BOX.ATM_CASH.cy).toBe(PLACE_BOX.OUT_APPROVED.cy);
    for (const [atm, out] of [['GATE_ATM', 'OUT_DECLINED'], ['ATM_CASH', 'OUT_APPROVED']] as const) {
      expect(left(atm) - right(out), atm).toBeGreaterThan(0);
      expect(left(atm) - right(out), atm).toBeLessThan(80);
    }
  });

  it('leaves the 3D rooms where they were', () => {
    expect(OFFICE_PLACE_BOX.EOD_BATCH).toMatchObject({ cx: 100, cy: 728 });
    const [x, z] = toWorld(OFFICE_PLACE_BOX.RECON.cx, OFFICE_PLACE_BOX.RECON.cy);
    expect(deskPose('RECON')).toMatchObject({ x, z });
    expect(OFFICE_PLACE_BOX.RECON).not.toEqual(PLACE_BOX.RECON);
  });
});

describe('wires and their labels stay legible', () => {
  type Seg = readonly [readonly [number, number], readonly [number, number]];
  const segs = (p: readonly (readonly [number, number])[]): Seg[] => p.slice(1).map((b, i) => [p[i]!, b] as const);
  const overlap = (a0: number, a1: number, b0: number, b1: number): number => Math.min(Math.max(a0, a1), Math.max(b0, b1)) - Math.max(Math.min(a0, a1), Math.min(b0, b1));
  /** The label pill BankMap draws: 5.4 px a character plus padding, 14 px tall. */
  const pill = (label: string, [x, y]: readonly [number, number]) => ({ x0: x - label.length * 2.7 - 4, x1: x + label.length * 2.7 + 4, y0: y - 7, y1: y + 7 });

  it('never draws two wires along the same stroke, except feeders merging into one gateway', () => {
    // What the map strokes: each wire's own run (a gateway's wire up to the diamond) and each gateway's one trunk.
    const strokes = [...BANK_WIRES.map((w) => ({ id: w.id, points: w.drawPoints })), ...GATEWAYS.map((g) => ({ id: g.id, points: g.trunk }))];
    const gatewayOf = new Map(BANK_WIRES.map((w) => [w.id, w.gateway]));
    const sameMerge = (a: string, b: string): boolean => {
      const g = gatewayOf.get(a);
      return !!g && g === gatewayOf.get(b) && !!GATEWAYS.find((x) => x.id === g)?.merge;
    };
    const shared: string[] = [];
    for (let i = 0; i < strokes.length; i++)
      for (let j = i + 1; j < strokes.length; j++)
        for (const [a, b] of segs(strokes[i]!.points))
          for (const [c, d] of segs(strokes[j]!.points)) {
            const horizontal = a[1] === b[1] && c[1] === d[1] && Math.abs(a[1] - c[1]) < 3 && overlap(a[0], b[0], c[0], d[0]) > 4;
            const vertical = a[0] === b[0] && c[0] === d[0] && Math.abs(a[0] - c[0]) < 3 && overlap(a[1], b[1], c[1], d[1]) > 4;
            // Feeders of a merging gateway share their last leg on purpose: one stroke into the diamond's corner.
            const merged = sameMerge(strokes[i]!.id, strokes[j]!.id);
            if ((horizontal || vertical) && !merged) shared.push(`${strokes[i]!.id} | ${strokes[j]!.id}`);
          }
    expect(shared).toEqual([]);
  });

  it('keeps every wire label off the desks and off the other labels, in both languages', () => {
    for (const locale of ['en', 'vi'] as const) {
      setActiveLocale(locale);
      const labels = BANK_WIRES.filter((w) => w.label && w.showLabel).map((w) => ({ id: w.id, ...pill(t(w.label!), w.labelAt) }));
      const hits: string[] = [];
      for (const l of labels) {
        for (const [id, b] of Object.entries(PLACE_BOX)) if (overlap(l.x0, l.x1, b.cx - b.w / 2, b.cx + b.w / 2) > 0 && overlap(l.y0, l.y1, b.cy - b.h / 2, b.cy + b.h / 2) > 0) hits.push(`${l.id} on ${id}`);
        for (const o of labels) if (o.id < l.id && overlap(l.x0, l.x1, o.x0, o.x1) > 0 && overlap(l.y0, l.y1, o.y0, o.y1) > 0) hits.push(`${l.id} on ${o.id}`);
      }
      expect(hits, locale).toEqual([]);
    }
    setActiveLocale('en');
  });

  it('keeps every wire label off the department titles, in both languages', () => {
    for (const locale of ['en', 'vi'] as const) {
      setActiveLocale(locale);
      const hits: string[] = [];
      for (const w of BANK_WIRES.filter((x) => x.label && x.showLabel)) {
        const l = pill(t(w.label!), w.labelAt);
        // The title chip BankMap draws in each frame's top-left corner: up to two lines, the frame's width less its insets.
        for (const [id, d] of Object.entries(DEPT_BOX)) if (overlap(l.x0, l.x1, d.x + 8, d.x + d.w - 8) > 0 && overlap(l.y0, l.y1, d.y + 4, d.y + 38) > 0) hits.push(`${w.id} on ${id}`);
      }
      expect(hits, locale).toEqual([]);
    }
    setActiveLocale('en');
  });

  it('never gives two wires out of the same desk the same label', () => {
    const seen = new Map<string, string>();
    for (const [from, to, label] of WIRES) {
      if (!label) continue;
      const key = `${from}|${label}`;
      expect(seen.get(key), `${from} → ${to} and ${seen.get(key)} are both "${label}"`).toBeUndefined();
      seen.set(key, to);
    }
  });
});
