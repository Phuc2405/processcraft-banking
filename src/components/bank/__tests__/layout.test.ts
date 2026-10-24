import { describe, expect, it } from 'vitest';
import { DEPARTMENT_IDS, DEPARTMENTS, EXTERNAL_IDS, STATION_IDS, WIRES, edgeId, type PlaceId } from '../../../sim/topology';
import { OFFICE_PLACE_BOX } from '../office/officePlan';
import { deskPose, toWorld } from '../office/layout3d';
import { BANK_WIRES, CARD, DEPT_BOX, PLACE_BOX, STAGE, TIP_SIDE, pathOfWire, roundedPath, tipRect, wireById } from '../layout';

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

  const cost = (id: PlaceId, side: 'below' | 'above' | 'right' | 'left'): number => places.filter((o) => o !== id).reduce((n, o) => n + overlap(tipRect(id, side), rect(o)), 0);

  it('stays on the stage and opens on the side that covers the least of the other desks', () => {
    for (const id of places) {
      const r = tipRect(id, TIP_SIDE[id]);
      expect(r.x0, id).toBeGreaterThanOrEqual(0);
      expect(r.y0, id).toBeGreaterThanOrEqual(0);
      expect(r.x1, id).toBeLessThanOrEqual(STAGE.width);
      expect(r.y1, id).toBeLessThanOrEqual(STAGE.height);
      const onStage = (['below', 'above', 'right', 'left'] as const).filter((side) => {
        const t = tipRect(id, side);
        return t.x0 >= 0 && t.y0 >= 0 && t.x1 <= STAGE.width && t.y1 <= STAGE.height;
      });
      expect(cost(id, TIP_SIDE[id]), id).toBe(Math.min(...onStage.map((side) => cost(id, side))));
    }
  });

  it('covers no other desk, except gate-column desks, the compact night grid and the Phase 8 band', () => {
    const crowded = places.filter((id) => cost(id, TIP_SIDE[id]) > 0).sort();
    expect(crowded).toEqual(['DISPUTE_DESK', 'EOD_VISA', 'GATE_A2A', 'GATE_ECOM', 'GATE_SWIFT', 'GATE_VIRTUAL', 'RECON', 'SEC_FACEPAY', 'SUSPENSE', 'TELLER_CASH']);
  });

  it('opens the everyday-account desk’s description away from the credit-card desk under it', () => {
    expect(TIP_SIDE.LEDGER_DEBIT).not.toBe('below');
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

  it('keeps the Phase 1A grid landscape above the Phase 8 band', () => {
    const band = new Set(DEPARTMENTS.ENTRANCE.stations.concat(DEPARTMENTS.COMPLIANCE.stations, DEPARTMENTS.BACKOFFICE.stations));
    const core = (Object.keys(PLACE_BOX) as PlaceId[]).filter((p) => !band.has(p as never));
    const bottom = Math.max(...core.map((p) => PLACE_BOX[p].cy + PLACE_BOX[p].h / 2));
    expect(STAGE.width / bottom).toBeGreaterThan(1120 / 980);
    expect(bottom).toBeLessThan(900);
    for (const id of band) expect(PLACE_BOX[id].cy - PLACE_BOX[id].h / 2, id).toBeGreaterThan(bottom);
  });

  it('leaves the 3D rooms where they were', () => {
    expect(OFFICE_PLACE_BOX.EOD_BATCH).toMatchObject({ cx: 100, cy: 728 });
    const [x, z] = toWorld(OFFICE_PLACE_BOX.RECON.cx, OFFICE_PLACE_BOX.RECON.cy);
    expect(deskPose('RECON')).toMatchObject({ x, z });
    expect(OFFICE_PLACE_BOX.RECON).not.toEqual(PLACE_BOX.RECON);
  });
});
