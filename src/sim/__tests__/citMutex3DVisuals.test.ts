/**
 * The CIT mandate's guards: the dispatch lock holds for a run's whole life (until SETTLED, and while the 3D van has not despawned), the four CIT child sub-processes are registered with full sheets and a "run this scenario" button, the vault station
 * is renamed in both maps, the crew walks to the round vault door, and the van's doors and crew start together as it stops.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MENU_CHOICES } from '../../components/bank/SubProcessMenu';
import { citDemoBlock, dispatchCitDemo } from '../../components/ops/citActions';
import { CitBusyBadge } from '../../components/ops/CitPanel';
import { SubProcessInfoView } from '../../components/ops/SubProcessInfoDrawer';
import { CIT_INFO_KEYS, citDemoOfKey, glLine, INFO_KEYS, subProcessInfo } from '../../data/subProcessRegistry';
import { vaultRoom } from '../../engine/plan/layout3d';
import { CitRun, CORRIDOR, CREW_PATH, VAULT_DOOR, VAULT_STOP } from '../../engine/world/citRun';
import { citRoutes } from '../../engine/world/parking';
import { setActiveLocale } from '../../i18n/localeCore';
import { bankStore } from '../../store/bankStore';
import { citStore } from '../../store/citStore';
import { retailOpsStore } from '../../store/retailOpsStore';
import { crewAt } from '../citCrew';
import { bayProgress, citAt, citDone, CIT_DEMOS, CIT_TIMING, citAccount, citSchedule, manualPlan, type CitManual } from '../citEngine';
import { nodeMode } from '../flowBeat';
import { stationName, stationTitle } from '../terms';
import { STATIONS } from '../topology';

const DAY = 3;
const AT = 10 * 60;

afterEach(() => setActiveLocale('en'));

describe('strict full-lifecycle CIT mutex', () => {
  it.each(CIT_DEMOS.map((k) => [k]))('%s holds the lock through every state until it is settled, and not after', (kind) => {
    const manual: CitManual[] = [{ kind, at: AT }];
    const plan = manualPlan(DAY, manual)[0]!;
    const done = citDone(plan);
    expect(done).toBe(citSchedule(plan).SETTLED);
    expect(citAt(DAY, AT - 1, manual).lock).toBeNull();
    const stages = new Set<string>();
    for (let m = AT; m < done; m++) {
      const lock = citAt(DAY, m, manual).lock;
      expect(lock?.run.order.id, `+${m - AT}`).toBe(`CIT-${DAY}-M1`);
      stages.add(lock!.stage);
      expect(citDemoBlock(citAt(DAY, m, manual), false)).toBe('busy');
    }
    expect([...stages]).toEqual(['EN_ROUTE', 'ARRIVED', 'IN_COUNT', 'DELIVERED']);
    expect(citAt(DAY, done, manual).lock).toBeNull();
    expect(citDemoBlock(citAt(DAY, done, manual), false)).toBeNull();
  });

  it('stays locked while the 3D van is still out, but never for the hour (after-hours demos play solo)', () => {
    const idle = citAt(DAY, AT, []);
    expect(citDemoBlock(idle, false)).toBeNull();
    expect(citDemoBlock(idle, true)).toBe('busy');
  });

  describe('through the store pipeline', () => {
    beforeEach(() => {
      bankStore.getState().resetDay();
      bankStore.getState().skipTo(AT);
      citStore.setState({ day: -1, manual: [], van: false });
      retailOpsStore.getState().reset();
    });
    afterEach(() => citStore.setState({ van: false }));

    it('refuses every dispatch until settled, and while the 3D van has not despawned', () => {
      expect(dispatchCitDemo('SBV')).toBe(true);
      const start = bankStore.getState().view.minute;
      for (const dt of [CIT_TIMING.ARRIVED, CIT_TIMING.DELIVERED]) {
        bankStore.getState().skipTo(start + dt);
        expect(bankStore.getState().view.minute, 'skipTo lands on the beat').toBe(start + dt);
        for (const kind of CIT_DEMOS) expect(dispatchCitDemo(kind), `${kind} at +${dt}`).toBe(false);
      }
      bankStore.getState().skipTo(start + CIT_TIMING.SETTLED);
      citStore.setState({ van: true });
      expect(dispatchCitDemo('ATM'), 'the 3D van is still pulling out').toBe(false);
      citStore.setState({ van: false });
      expect(dispatchCitDemo('ATM')).toBe(true);
    });

    it('shows the "CIT van in transit" badge with where the run is, and disables every option', () => {
      setActiveLocale('vi');
      const html = renderToStaticMarkup(createElement(CitBusyBadge, { stage: 'LEAVING', paused: false }));
      expect(html).toContain('🚚 Xe CIT đang vận chuyển...');
      expect(html).toContain('data-stage="LEAVING"');
    });
  });
});

describe('the four CIT child sub-processes', () => {
  const KEYS = Object.values(CIT_INFO_KEYS);

  it('registers exactly the four keys under Flow 09, each running its own demo', () => {
    expect(KEYS).toEqual(['09-cit-atm', '09-cit-doorstep', '09-cit-sbv', '09-cit-teller-vault']);
    for (const kind of CIT_DEMOS) {
      const key = CIT_INFO_KEYS[kind];
      expect(INFO_KEYS).toContain(key);
      expect(citDemoOfKey(key)).toBe(kind);
      expect(subProcessInfo(key).flow).toBe(9);
    }
    expect(citDemoOfKey('flow-9')).toBeNull();
    // The menu lists them under Flow 09, its last rows.
    const ids = MENU_CHOICES.map((c) => (c.kind === 'cit' ? c.key : c.kind === 'flow' ? `flow-${c.flow}` : c.sub));
    expect(ids.slice(ids.indexOf('flow-9') + 1)).toEqual(KEYS);
  });

  it('carries the titles, Circular 01/2014 and every GL line its demo posts', () => {
    const titles = {
      ATM: ['Tiếp quỹ & Rút hộc tiền ATM / CDM', 'ATM/CDM Replenishment'],
      DOORSTEP: ['Thu tiền mặt tận nơi cho Doanh nghiệp', 'Corporate Cash Pickup'],
      SBV: ['Nộp / Rút tiền mặt tại Ngân hàng Nhà nước (SBV)', 'SBV Vault Operations'],
      TELLER: ['Điều chuyển & Phân loại tiền quầy', 'Teller Vault Balancing & Cash Fitness Sorting'],
    } as const;
    for (const kind of CIT_DEMOS) {
      const e = subProcessInfo(CIT_INFO_KEYS[kind]);
      expect([e.title.vi, e.title.en]).toEqual(titles[kind]);
      expect(e.legal).toContain('circ-01-2014');
      const have = new Set(e.gl.map((r) => `${r.side}:${r.account}`));
      const run = citAt(DAY, 23 * 60, [{ kind, at: AT }]).runs.find((r) => r.planned.order.id.endsWith('-M1'))!.run!;
      for (const l of run.entries.flatMap((x) => x.lines)) expect(have, `${kind} misses ${l.dr ? 'dr' : 'cr'} ${citAccount(l.account).code}`).toContain(`${l.dr ? 'dr' : 'cr'}:${l.account}`);
      expect(e.gl.some((r) => glLine(r, 'vi').code === '1131')).toBe(true);
    }
    // The teller run sorts fit (1111) from unfit (1112).
    const teller = subProcessInfo(CIT_INFO_KEYS.TELLER).gl.map((r) => glLine(r, 'en').code);
    expect(teller).toEqual(expect.arrayContaining(['1111', '1112', '1131']));
  });

  it('opens a bilingual drawer with "▶ Chạy thử kịch bản này" that dispatches its demo', () => {
    setActiveLocale('vi');
    for (const kind of CIT_DEMOS) {
      const html = renderToStaticMarkup(createElement(SubProcessInfoView, { info: subProcessInfo(CIT_INFO_KEYS[kind]), liveStr: 0 }));
      expect(html).toContain('▶ Chạy thử kịch bản này');
      expect(html).toContain(`data-testid="cit-run-${kind}"`);
      expect(html).toContain('Thông tư');
    }
    setActiveLocale('en');
    expect(renderToStaticMarkup(createElement(SubProcessInfoView, { info: subProcessInfo('09-cit-sbv'), liveStr: 0 }))).toContain('▶ Run this scenario');
    // The domain sheet links to its four children.
    for (const k of KEYS) expect(subProcessInfo('flow-9').related).toContain(k);
  });
});

describe('stations renamed: the collateral desk and the central cash vault are two stations', () => {
  it('names the teller, the collateral desk and the vault as the brief does, in both languages and vocabularies', () => {
    const NAMES = {
      TELLER_CASH: ['Quầy Giao dịch viên Tiền mặt', 'Cash Teller Desk'],
      COLLATERAL_VAULT: ['Quầy Tiết kiệm & Tài sản Bảo đảm', 'Savings & Collateral Desk'],
      MAIN_CASH_VAULT: ['Kho Quỹ Trung Tâm', 'Main Cash Vault'],
    } as const;
    for (const [id, [vi, en]] of Object.entries(NAMES) as [keyof typeof NAMES, readonly [string, string]][]) {
      expect(STATIONS[id].name).toBe(en);
      for (const mode of ['expert', 'beginner'] as const) {
        setActiveLocale('vi');
        expect(stationTitle(id, mode)).toBe(vi);
        setActiveLocale('en');
        expect(stationName(id, mode)).toBe(en);
      }
    }
  });
});

describe('the round vault door is the 3D target', () => {
  it('stands on the vault room’s back wall, and the crew’s walk ends facing it', () => {
    const room = vaultRoom();
    expect(VAULT_DOOR.z).toBeCloseTo(room.z0 + 0.09, 5);
    expect(VAULT_DOOR.x).toBeGreaterThan(room.x0);
    expect(VAULT_DOOR.x).toBeLessThan(room.x1);
    expect(CORRIDOR[CORRIDOR.length - 1]).toEqual(VAULT_STOP);
    expect(CREW_PATH[CREW_PATH.length - 1]).toEqual(VAULT_STOP);
    expect(VAULT_STOP).toEqual([VAULT_DOOR.x, VAULT_DOOR.z + 1]);
  });

  it('lights the door (gold in, orange out) while the custodian stands at it', () => {
    for (const flow of ['IN', 'OUT'] as const) {
      const run = new CitRun(citRoutes());
      run.follow();
      run.call(flow);
      const pulses = new Set<string>();
      for (let i = 0; i < 6000 && (run.phase !== 'away' || i === 0); i++) {
        run.step(0.05, true);
        const p = run.pose();
        if (p.vaultPulse) {
          pulses.add(p.vaultPulse);
          const at = p.crew.find((c) => c.role === 'custodian')!.at;
          expect(Math.hypot(at[0] - VAULT_STOP[0], at[1] - VAULT_STOP[1])).toBeLessThan(0.05);
        }
      }
      expect([...pulses]).toEqual([flow]);
    }
  });
});

describe('synchronised arrival', () => {
  it('3D: opens the rear doors and walks the crew out on the very frame the van stops', () => {
    const run = new CitRun(citRoutes());
    run.follow();
    run.call('IN');
    let prev = run.phase;
    let checked = false;
    for (let i = 0; i < 4000 && !checked; i++) {
      run.step(0.05, true);
      const p = run.pose();
      if (prev === 'arrive' && p.phase === 'load') {
        // The stopping frame: the crew is already out and the doors start to swing; one frame on they are opening.
        expect(p.crew.some((c) => c.role === 'custodian')).toBe(true);
        expect(p.doors).toBeLessThan(1);
        run.step(0.05, true);
        expect(run.pose().doors).toBeGreaterThan(0);
        expect(run.pose().shutter).toBe(run.pose().doors);
        checked = true;
      }
      prev = p.phase;
    }
    expect(checked).toBe(true);
  });

  it('2D: the inflow crew steps out at ARRIVED, not ten minutes later at IN_COUNT', () => {
    const plan = manualPlan(DAY, [{ kind: 'DOORSTEP', at: AT }])[0]!;
    const at = citSchedule(plan);
    expect(bayProgress(plan, at.ARRIVED - 1)).toBeNull();
    expect(bayProgress(plan, at.ARRIVED)).toBe(0);
    expect(crewAt('IN', 0)?.stage).toBe('stepOut');
    // A teller run is carried on foot: no van comes to the bay for it.
    expect(bayProgress(manualPlan(DAY, [{ kind: 'TELLER', at: AT }])[0]!, AT + CIT_TIMING.ARRIVED)).toBeNull();
  });
});

describe('3D transaction flow beat', () => {
  it('says who decides at a station: a rule (STP) or a person (MANUAL), nobody at an outcome', () => {
    expect(nodeMode('STP_ENGINE')).toBe('STP');
    expect(nodeMode('TELLER_CASH')).toBe('MANUAL');
    expect(nodeMode('OUT_APPROVED')).toBeNull();
  });
});
