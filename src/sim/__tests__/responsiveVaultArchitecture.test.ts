/**
 * The central cash vault pass: MAIN_CASH_VAULT is its own station (the round 3D door, a 2D card with gold cash lines), the collateral
 * desk holds no cash, cash flows both ways between the vault and the teller / ATM / CIT bay, every sub-process opens a lesson, the
 * CIT lock releases as soon as the run settles and the van is gone, the retail ATM cassette fills when the van arrives, and the 3D
 * cash streams borrow their meshes from a capped pool.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CashLinesView } from '../../components/bank/CashLines2D';
import { MENU_CHOICES } from '../../components/bank/SubProcessMenu';
import { LANE_GLOW } from '../../components/bank/office/focus3d';
import { arcPoint, doorHalo, endpointXZ, sparkU, STREAM_POOL_CAP, STREAM_SPARKS, VAULT_STATION } from '../../components/bank/office/VaultCash3D';
import { pickPlace } from '../../components/bank/office/tourHooks';
import { ObjectPool } from '../../components/bank/office/webglSafety';
import { AmlArticle, CitArticle, CoreLedgerArticle, RetailArticle, StpArticle } from '../../components/knowledge/KnowledgeBaseModal';
import { citDemoBlock, dispatchCitDemo, settleAtmRefills } from '../../components/ops/citActions';
import { SubProcessInfoView } from '../../components/ops/SubProcessInfoDrawer';
import { lessonAnchor, SUBPROCESS_LESSON } from '../../data/subProcessLessons';
import { INFO_KEYS, infoKeyForPlace, subProcessInfo } from '../../data/subProcessRegistry';
import { CASH_LINES, DEPT_BOX, PLACE_BOX, STAGE } from '../../engine/plan/layout';
import { deskPose, isWallStation } from '../../engine/plan/layout3d';
import { VAULT_DOOR, VAULT_STOP } from '../../engine/world/citRun';
import { ParkingLot } from '../../engine/world/parking';
import { setActiveLocale } from '../../i18n/localeCore';
import { bankStore } from '../../store/bankStore';
import { citStore } from '../../store/citStore';
import { retailOpsStore } from '../../store/retailOpsStore';
import { knowledgeTabOf } from '../../store/uiStore';
import { vaultFlowStore } from '../../store/vaultFlowStore';
import { citAt, citDone, citOrder, CIT_DEMOS, CIT_TIMING, citSchedule, dueAtmRefills, manualPlan, startRun, type CitManual, type CitRun, type CitScenario, type CitStatus } from '../citEngine';
import { DEMO_GROUPS } from '../demoGroups';
import { OPS_LIMITS } from '../retailOps';
import { slaTelemetry } from '../sheetTelemetry';
import { DEPARTMENTS, STATIONS } from '../topology';
import { flowIcon } from '../transactionPath';
import { citRunFlows, mergeFlows, retailCashFlow, vaultPost } from '../vaultFlows';

const src = (rel: string): string => readFileSync(join(__dirname, '..', '..', rel), 'utf8');
const runAtStatus = (scenario: CitScenario, direction: 'IN' | 'OUT', status: CitStatus): CitRun => ({ ...startRun(citOrder({ scenario, direction, amountCents: 5_000_000 })), status });

afterEach(() => setActiveLocale('en'));

describe('the 3D round vault door is the clickable central cash vault', () => {
  it('is a station of its own, a door in the wall rather than a counter, at the round door', () => {
    expect(VAULT_STATION).toBe('MAIN_CASH_VAULT');
    expect(isWallStation('MAIN_CASH_VAULT')).toBe(true);
    const p = deskPose('MAIN_CASH_VAULT');
    expect(p.x).toBeCloseTo(VAULT_DOOR.x, 6);
    expect(Math.abs(p.z - VAULT_DOOR.z)).toBeLessThan(0.05);
    // The crew still has room to stand in front of it.
    expect(VAULT_STOP[1] - (p.z + p.d / 2)).toBeGreaterThan(0.4);
  });

  it('takes the click through a raycast hit disc on the door, and a click opens the vault inspector', () => {
    const vault = src('components/bank/office/VaultCash3D.tsx');
    expect(vault).toMatch(/name="vault-door-hit"[\s\S]*onClick=\{click\}/);
    expect(vault).toContain('pickPlace(VAULT_STATION)');
    expect(src('components/bank/office/Dressing.tsx')).toContain('<VaultDoorStation />');
    bankStore.getState().clearSelection();
    pickPlace('MAIN_CASH_VAULT');
    expect(bankStore.getState().selection).toEqual({ kind: 'station', id: 'MAIN_CASH_VAULT' });
    // The vault inspector (balances 1111 / 1112 / 1131, the runs, the dispatch buttons) belongs to the vault, not the collateral desk.
    const inspector = src('components/bank/Inspector.tsx');
    expect(inspector).toContain("{id === 'MAIN_CASH_VAULT' && <CitInspector />}");
    expect(inspector).not.toContain("id === 'COLLATERAL_VAULT' && <CitInspector");
    bankStore.getState().clearSelection();
  });

  it('glows with the cash first, then shows selected, then hovered', () => {
    expect(doorHalo('IN', true, true)).toBe('IN');
    expect(doorHalo('OUT', false, false)).toBe('OUT');
    expect(doorHalo(null, true, true)).toBe('selected');
    expect(doorHalo(null, false, true)).toBe('hover');
    expect(doorHalo(null, false, false)).toBeNull();
  });

  it('draws no desk and no rug for the vault in 3D', () => {
    const scene = src('components/bank/office/OfficeScene.tsx');
    expect(scene).toContain("STATION_IDS.filter((id) => id !== VAULT_STATION)");
    expect(scene).toContain("filter((id) => id !== 'CASH')");
  });
});

describe('collateral and cash are separate stations, in 2D and 3D', () => {
  it('puts the vault in a CASH department and leaves collateral with paperwork only', () => {
    expect(STATIONS.MAIN_CASH_VAULT.department).toBe('CASH');
    expect(DEPARTMENTS.CASH.stations).toEqual(['MAIN_CASH_VAULT']);
    expect(DEPARTMENTS.SAVINGS.stations).not.toContain('MAIN_CASH_VAULT');
    expect(STATIONS.COLLATERAL_VAULT.blurb).not.toMatch(/TK 1111|CIT/);
    expect(STATIONS.COLLATERAL_VAULT.blurb).toContain('no physical cash');
  });

  it('points every cash sheet at the vault and the collateral desk at the collateral sheet', () => {
    for (const k of ['cit-vault', '06-cit-atm', '06-cit-doorstep', '06-cit-sbv', '06-cit-teller-vault'] as const) expect(subProcessInfo(k).place, k).toBe('MAIN_CASH_VAULT');
    expect(infoKeyForPlace('MAIN_CASH_VAULT')).toBe('cit-vault');
    expect(infoKeyForPlace('COLLATERAL_VAULT')).toBe('collateral');
  });

  it('lays the vault card and its department out on the 2D stage, under savings, with the CIT bay below', () => {
    const v = PLACE_BOX.MAIN_CASH_VAULT;
    const d = DEPT_BOX.CASH;
    expect(v.cx - v.w / 2).toBeGreaterThanOrEqual(d.x);
    expect(v.cx + v.w / 2).toBeLessThanOrEqual(d.x + d.w);
    expect(v.cy - v.h / 2).toBeGreaterThan(d.y);
    expect(d.y).toBeGreaterThanOrEqual(DEPT_BOX.SAVINGS.y + DEPT_BOX.SAVINGS.h);
    expect(d.y + d.h).toBeLessThanOrEqual(STAGE.height);
    expect(src('components/bank/CitBay2D.tsx')).toContain('PLACE_BOX.MAIN_CASH_VAULT');
  });

  it('runs a gold cash line from the vault to the teller, the ATM and the CIT bay, inside the stage', () => {
    const v = PLACE_BOX.MAIN_CASH_VAULT;
    const ends = { TELLER: PLACE_BOX.TELLER_CASH, ATM: PLACE_BOX.ATM_CASH } as const;
    for (const [e, pts] of Object.entries(CASH_LINES)) {
      const [x0, y0] = pts[0]!;
      expect(Math.abs(x0 - v.cx) <= v.w / 2 + 0.5 && Math.abs(y0 - v.cy) <= v.h / 2 + 0.5, `${e} starts on the vault card`).toBe(true);
      for (const [x, y] of pts) expect(x >= 0 && x <= STAGE.width && y >= 0 && y <= STAGE.height, `${e} ${x},${y}`).toBe(true);
      for (let i = 1; i < pts.length; i++) expect(pts[i]![0] === pts[i - 1]![0] || pts[i]![1] === pts[i - 1]![1], `${e} is orthogonal`).toBe(true);
      const box = ends[e as keyof typeof ends];
      if (box) {
        const [x, y] = pts[pts.length - 1]!;
        expect(Math.abs(x - box.cx) <= box.w / 2 + 0.5 && Math.abs(y - box.cy) <= box.h / 2 + 0.5, `${e} ends on its desk`).toBe(true);
      }
    }
  });

  it('draws the lines faint while idle, and lit with a 💵 gliding the right way while cash moves', () => {
    const idle = renderToStaticMarkup(createElement(CashLinesView, { flows: [] }));
    for (const e of ['TELLER', 'ATM', 'BAY']) expect(idle).toContain(`data-cash-line="${e}" data-dir="idle"`);
    expect(idle).not.toContain('animateMotion');
    const live = renderToStaticMarkup(createElement(CashLinesView, { flows: [{ endpoint: 'ATM', dir: 'OUT', source: 'cit', id: 'a' }, { endpoint: 'TELLER', dir: 'IN', source: 'retail', id: 'b' }] }));
    expect(live).toContain('data-testid="cash-icon-ATM" data-dir="OUT"');
    expect(live).toMatch(/cash-icon-ATM[\s\S]*?keyPoints="0;1"/);
    expect(live).toMatch(/cash-icon-TELLER[\s\S]*?keyPoints="1;0"/);
    expect(live).toContain('Cr 1111');
  });
});

describe('two-way cash flows: who needs cash takes it out of the vault, who has surplus brings it in', () => {
  it('reads every CIT run’s crossing from its state', () => {
    const at = (s: CitScenario, d: 'IN' | 'OUT', st: CitStatus) => citRunFlows(runAtStatus(s, d, st)).map((f) => `${f.endpoint}:${f.dir}`);
    // ATM top-up: loaded out of the vault into the van, then into the ATM.
    expect(at('ATM_CDM', 'OUT', 'EN_ROUTE')).toEqual(['BAY:OUT']);
    expect(at('ATM_CDM', 'OUT', 'DELIVERED')).toEqual(['ATM:OUT']);
    // CDM collection: emptied from the machine, then unloaded at the bay into the vault.
    expect(at('ATM_CDM', 'IN', 'EN_ROUTE')).toEqual(['ATM:IN']);
    expect(at('ATM_CDM', 'IN', 'IN_COUNT')).toEqual(['BAY:IN']);
    // SBV deposit out, SBV withdrawal in, corporate pickup in.
    expect(at('SBV', 'OUT', 'EN_ROUTE')).toEqual(['BAY:OUT']);
    expect(at('SBV', 'IN', 'ARRIVED')).toEqual(['BAY:IN']);
    expect(at('DOORSTEP', 'IN', 'DELIVERED')).toEqual(['BAY:IN']);
    // The till, on foot, both ways.
    expect(at('TELLER', 'IN', 'IN_COUNT')).toEqual(['TELLER:IN']);
    expect(at('TELLER', 'OUT', 'EN_ROUTE')).toEqual(['TELLER:OUT']);
    expect(at('ATM_CDM', 'OUT', 'SETTLED')).toEqual([]);
    expect(vaultPost('IN')).toBe('Dr 1111');
    expect(vaultPost('OUT')).toBe('Cr 1111');
  });

  it('reads the retail book’s vault journals: a refill goes out to the ATM, a till surplus comes in from the teller', () => {
    const refill = retailCashFlow({ id: 'r', source: 'cassette-refill', at: 'D1', lines: [{ account: 'CASH_ATM', dr: 100, cr: 0 }, { account: 'CASH_VAULT', dr: 0, cr: 100 }] });
    expect(refill).toMatchObject({ endpoint: 'ATM', dir: 'OUT' });
    const surplus = retailCashFlow({ id: 's', source: 'vault-transfer', at: 'D1', lines: [{ account: 'CASH_VAULT', dr: 100, cr: 0 }, { account: 'CASH_TILL', dr: 0, cr: 100 }] });
    expect(surplus).toMatchObject({ endpoint: 'TELLER', dir: 'IN' });
    expect(retailCashFlow({ id: 'x', source: 'bill-electric-85', at: 'D1', lines: [{ account: 'CASA', dr: 1, cr: 0 }] })).toBeNull();
    expect(mergeFlows([{ endpoint: 'ATM', dir: 'OUT', source: 'cit', id: 'c' }], [refill!]).map((f) => f.source)).toEqual(['cit']);
  });

  it('lights the retail crossing through the store when a refill posts (Observer)', () => {
    retailOpsStore.getState().reset();
    vaultFlowStore.getState().clear();
    retailOpsStore.getState().runAction('atm-withdraw-100', 'D1 10:00:00');
    expect(vaultFlowStore.getState().retail).toEqual([]);
    retailOpsStore.getState().refillCassette('D1 10:01:00');
    expect(vaultFlowStore.getState().retail.map((f) => `${f.endpoint}:${f.dir}`)).toEqual(['ATM:OUT']);
    vaultFlowStore.getState().clear();
  });
});

describe('the 3D cash streams and the object pool', () => {
  it('arcs from the door to each endpoint, high enough to clear the desks', () => {
    for (const e of ['TELLER', 'ATM', 'BAY'] as const) {
      const [x0, , z0] = arcPoint(e, 0);
      expect(x0).toBeCloseTo(VAULT_DOOR.x, 6);
      expect(Math.abs(z0 - VAULT_DOOR.z)).toBeLessThan(0.5);
      const [x1, , z1] = arcPoint(e, 1);
      expect(x1).toBeCloseTo(endpointXZ(e)[0], 6);
      expect(z1).toBeCloseTo(endpointXZ(e)[1], 6);
      expect(arcPoint(e, 0.5)[1]).toBeGreaterThan(2.5);
    }
  });

  it('streams OUT away from the door and IN towards it', () => {
    expect(sparkU('OUT', 0, 6, 0)).toBeLessThan(sparkU('OUT', 0, 6, 0.5));
    expect(sparkU('IN', 0, 6, 0.1)).toBeGreaterThan(sparkU('IN', 0, 6, 0.6));
  });

  it('hands out at most the cap, reuses what comes back, and disposes everything on drain', () => {
    let made = 0;
    let disposed = 0;
    const pool = new ObjectPool(() => ({ n: made++ }), STREAM_POOL_CAP, () => void disposed++);
    expect(STREAM_POOL_CAP).toBe(STREAM_SPARKS * 3);
    const out = Array.from({ length: STREAM_POOL_CAP + 4 }, () => pool.acquire());
    expect(out.filter(Boolean)).toHaveLength(STREAM_POOL_CAP);
    for (const o of out) if (o) pool.release(o);
    // A second run reuses the same meshes: nothing new is allocated.
    for (let i = 0; i < STREAM_SPARKS; i++) pool.acquire();
    expect(made).toBe(STREAM_POOL_CAP);
    pool.drain();
    expect(disposed).toBe(STREAM_POOL_CAP);
    expect(pool.size).toBe(0);
  });

  it('shares one geometry and one material per colour (Flyweight) and drains its pool when the scene goes', () => {
    const vault = src('components/bank/office/VaultCash3D.tsx');
    expect(vault).toContain('const SPARK = new SphereGeometry');
    expect(vault).toContain('pool.drain()');
    expect(vault).toContain('pool.release(m)');
  });
});

describe('the drawer, the top menu and the dock: every sub-process opens its lesson', () => {
  it('maps every sheet and every demo group to a lesson', () => {
    for (const k of INFO_KEYS) expect(SUBPROCESS_LESSON[k], k).toBeTruthy();
    for (const g of DEMO_GROUPS) expect(SUBPROCESS_LESSON[g.id], g.id).toBeTruthy();
    for (const c of MENU_CHOICES) {
      const key = c.kind === 'flow' ? (`flow-${c.flow}` as const) : c.kind === 'sub' ? c.sub : c.key;
      expect(lessonAnchor(key), key).toBeTruthy();
    }
  });

  it('lands every lesson on a section the Knowledge Base really renders', () => {
    const pages = {
      core: renderToStaticMarkup(createElement(CoreLedgerArticle, { view: 'advanced' })),
      retail: renderToStaticMarkup(createElement(RetailArticle, {})),
      aml: renderToStaticMarkup(createElement(AmlArticle, {})),
      stp: renderToStaticMarkup(createElement(StpArticle, {})),
      cit: renderToStaticMarkup(createElement(CitArticle, {})),
    } as Record<string, string>;
    for (const [key, anchor] of Object.entries(SUBPROCESS_LESSON)) {
      const page = pages[knowledgeTabOf(anchor)];
      expect(page, `${key} → ${anchor} has a tab`).toBeDefined();
      expect(page, `${key} → ${anchor}`).toContain(`id="kb-${anchor}"`);
    }
  });

  it('puts the 📖 left of the top menu (reachable when a narrow screen truncates the title) and beside the drawer title', () => {
    const menu = src('components/bank/SubProcessMenu.tsx');
    expect(menu.indexOf('<LessonLink')).toBeGreaterThan(0);
    expect(menu.indexOf('<LessonLink')).toBeLessThan(menu.indexOf('data-testid="flow-menu"'));
    expect(menu).toContain('min-w-0 truncate');
    const html = renderToStaticMarkup(createElement(SubProcessInfoView, { info: subProcessInfo('card-auth'), liveStr: 0.5 }));
    expect(html).toContain('data-testid="subprocess-lesson" data-anchor="card-pos-auth"');
    expect(src('components/bank/PresetDock.tsx')).toContain('<LessonLink');
  });

  it('starts each of the four CIT children from its own sheet, with no dropdown on the dock', () => {
    expect(MENU_CHOICES.filter((c) => c.kind === 'cit')).toHaveLength(4);
    expect(src('components/bank/PresetDock.tsx')).not.toContain('CitDemoMenu');
    setActiveLocale('vi');
    for (const k of ['06-cit-atm', '06-cit-doorstep', '06-cit-sbv', '06-cit-teller-vault'] as const) {
      const html = renderToStaticMarkup(createElement(SubProcessInfoView, { info: subProcessInfo(k), liveStr: 0 }));
      expect(html, k).toContain('data-testid="cit-run-scenario"');
    }
  });

  it('reads the SLA tile live from the bank and the CIT run', () => {
    const view = bankStore.getState().view;
    const desk = slaTelemetry(subProcessInfo('disputes'), view, null);
    expect(desk).toMatchObject({ kind: 'desk', queue: view.stations.DISPUTE_DESK.queueLength });
    const manual: CitManual[] = [{ kind: 'SBV', at: 10 * 60 }];
    expect(slaTelemetry(subProcessInfo('06-cit-sbv'), view, citAt(3, 10 * 60 + 30, manual))).toEqual({ kind: 'cit', status: 'ARRIVED' });
    const html = renderToStaticMarkup(createElement(SubProcessInfoView, { info: subProcessInfo('disputes'), liveStr: 0.5, liveSla: desk }));
    expect(html).toContain('data-testid="spi-sla-live" data-kind="desk"');
  });
});

describe('the CIT lock and the ATM balance follow the run, not a timer', () => {
  beforeEach(() => {
    bankStore.getState().resetDay();
    bankStore.getState().skipTo(10 * 60);
    citStore.setState({ day: -1, manual: [], van: false });
    retailOpsStore.getState().reset();
  });
  afterEach(() => citStore.setState({ van: false }));

  it('releases the lock at SETTLED unless the 3D van is still on its exit route', () => {
    for (const kind of CIT_DEMOS) {
      const manual: CitManual[] = [{ kind, at: 600 }];
      const plan = manualPlan(3, manual)[0]!;
      expect(citDone(plan)).toBe(citSchedule(plan).SETTLED);
      expect(citDemoBlock(citAt(3, citDone(plan) - 1, manual), false, false)).toBe('busy');
      expect(citDemoBlock(citAt(3, citDone(plan), manual), false, false)).toBeNull();
      expect(citDemoBlock(citAt(3, citDone(plan), manual), false, true)).toBe('busy');
    }
    expect(src('engine/simulation/WorldEngine.ts')).toContain('this.lot.cit.vanOut()');
  });

  it('lets the paused bank’s van drive off and despawn even when a frozen car held the lane (no stuck lock)', () => {
    const lot = new ParkingLot(0);
    lot.cit.follow();
    lot.cit.call('IN');
    // Drive the van to the bay and through its stop, then freeze a car on the lane as a pause would.
    for (let i = 0; i < 4000 && lot.cit.phase !== 'close'; i++) lot.stepCitAlone(0.05);
    expect(lot.cit.phase).toBe('close');
    (lot as unknown as { mover: string | null }).mover = 'car-frozen-mid-turn';
    for (let i = 0; i < 4000 && lot.cit.vanOut(); i++) lot.stepCitAlone(0.05);
    expect(lot.cit.vanOut()).toBe(false);
  });

  it('fills the retail ATM cassette only when the van reaches the ATM (DELIVERED), and only once', () => {
    retailOpsStore.getState().runAction('atm-withdraw-100', 'D1 10:00:00');
    const before = retailOpsStore.getState().book.balances.CASH_ATM;
    expect(before).toBeLessThan(OPS_LIMITS.cassetteCapacityCents);
    const start = bankStore.getState().view.minute;
    expect(dispatchCitDemo('ATM')).toBe(true);
    const { day } = bankStore.getState().view;
    expect(dueAtmRefills(day, start + CIT_TIMING.DELIVERED - 1, citStore.getState().manual)).toEqual([]);
    expect(settleAtmRefills()).toBe(0);
    expect(retailOpsStore.getState().book.balances.CASH_ATM).toBe(before);
    bankStore.getState().skipTo(start + CIT_TIMING.DELIVERED);
    expect(dueAtmRefills(day, start + CIT_TIMING.DELIVERED, citStore.getState().manual)).toEqual([0]);
    expect(settleAtmRefills()).toBe(1);
    expect(retailOpsStore.getState().book.balances.CASH_ATM).toBe(OPS_LIMITS.cassetteCapacityCents);
    expect(settleAtmRefills()).toBe(0);
    expect(src('components/ops/citActions.ts')).not.toMatch(/dispatch\(kind[^\n]*\n[^\n]*refillCassette/);
  });
});

describe('subtle wires and moving icons', () => {
  it('dims idle lanes and keeps the live halo soft', () => {
    expect(LANE_GLOW.idle).toBeLessThan(1);
    expect(LANE_GLOW.halo).toBeLessThan(0.45);
  });

  it('gives each payment an icon from where it entered the bank', () => {
    expect(flowIcon(['GATE_POS', 'LEDGER_DEBIT'])).toBe('💳');
    expect(flowIcon(['OUT_APPROVED', 'EOD_BATCH'])).toBe('📦');
    expect(flowIcon(['GATE_QR'])).toBe('📲');
    expect(flowIcon([])).toBe('💠');
    expect(src('components/bank/BankMap.tsx')).toContain('data-testid="flow-icon-2d"');
    expect(src('components/bank/office/TransactionFlow3D.tsx')).toContain('data-testid="flow-icon-3d"');
  });
});
