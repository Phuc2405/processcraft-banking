/**
 * The CIT mandate's guards: the dispatch lock holds for a run's whole life (until SETTLED and the van is home, and the 3D van has
 * driven off), the four CIT child sub-processes are registered with full sheets and a "run this scenario" button, the vault station
 * is renamed in both maps, the crew walks to the round vault door, and the van's doors and crew start together as it stops.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MENU_CHOICES } from '../../components/bank/SubProcessMenu';
import { citDemoBlock, dispatchCitDemo } from '../../components/ops/citActions';
import { CitDemoMenuView } from '../../components/ops/CitDemoMenu';
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
import { bayProgress, citAt, citDone, CIT_DEMOS, CIT_STRATEGIES, CIT_TIMING, citAccount, citSchedule, manualPlan, type CitManual } from '../citEngine';
import { flowBeat, routeMode } from '../flowBeat';
import { stationName, stationTitle } from '../terms';
import { STATIONS } from '../topology';

const DAY = 3;
const AT = 10 * 60;

afterEach(() => setActiveLocale('en'));

describe('strict full-lifecycle CIT mutex', () => {
  it.each(CIT_DEMOS.map((k) => [k]))('%s holds the lock through every state until it is settled and its van is home', (kind) => {
    const manual: CitManual[] = [{ kind, at: AT }];
    const plan = manualPlan(DAY, manual)[0]!;
    const done = citDone(plan);
    const van = CIT_STRATEGIES[plan.order.scenario].van;
    expect(done).toBe(citSchedule(plan).SETTLED + (van ? CIT_TIMING.home : 0));
    expect(citAt(DAY, AT - 1, manual).lock).toBeNull();
    const stages = new Set<string>();
    for (let m = AT; m < done; m++) {
      const lock = citAt(DAY, m, manual).lock;
      expect(lock?.run.order.id, `+${m - AT}`).toBe(`CIT-${DAY}-M1`);
      stages.add(lock!.stage);
      expect(citDemoBlock(citAt(DAY, m, manual), false, false)).toBe('busy');
    }
    expect([...stages]).toEqual(['EN_ROUTE', 'ARRIVED', 'IN_COUNT', 'DELIVERED', ...(van ? ['RETURNING'] : [])]);
    expect(citAt(DAY, done, manual).lock).toBeNull();
    expect(citDemoBlock(citAt(DAY, done, manual), false, false)).toBeNull();
  });

  it('stays locked while the 3D van is still out, and on a finished day', () => {
    const idle = citAt(DAY, AT, []);
    expect(citDemoBlock(idle, false, false)).toBeNull();
    expect(citDemoBlock(idle, false, true)).toBe('busy');
    expect(citDemoBlock(idle, true, false)).toBe('dayOver');
  });

  describe('through the store pipeline', () => {
    beforeEach(() => {
      bankStore.getState().resetDay();
      bankStore.getState().skipTo(AT);
      citStore.setState({ day: -1, manual: [], van: false });
      retailOpsStore.getState().reset();
    });
    afterEach(() => citStore.setState({ van: false }));

    it('refuses every dispatch until settled and home, and while the 3D van has not driven off', () => {
      expect(dispatchCitDemo('SBV')).toBe(true);
      const start = bankStore.getState().view.minute;
      for (const dt of [CIT_TIMING.DELIVERED, CIT_TIMING.SETTLED, CIT_TIMING.SETTLED + CIT_TIMING.home - 5]) {
        bankStore.getState().skipTo(start + dt);
        expect(bankStore.getState().view.minute, 'skipTo lands on the beat').toBe(start + dt);
        for (const kind of CIT_DEMOS) expect(dispatchCitDemo(kind), `${kind} at +${dt}`).toBe(false);
      }
      bankStore.getState().skipTo(start + CIT_TIMING.SETTLED + CIT_TIMING.home);
      citStore.setState({ van: true });
      expect(dispatchCitDemo('ATM'), 'the 3D van is still pulling out').toBe(false);
      citStore.setState({ van: false });
      expect(dispatchCitDemo('ATM')).toBe(true);
    });

    it('shows the "CIT van in transit" badge with where the run is, and disables every option', () => {
      setActiveLocale('vi');
      const html = renderToStaticMarkup(createElement(CitDemoMenuView, { block: 'busy', stage: 'RETURNING', paused: false }));
      expect(html).toContain('🚚 Xe CIT đang vận chuyển...');
      expect(html).toContain('Xe đang về trạm');
      expect(html).toContain('data-block="busy"');
    });
  });
});

describe('the four CIT child sub-processes', () => {
  const KEYS = Object.values(CIT_INFO_KEYS);

  it('registers exactly the four keys under Flow 06, each running its own demo', () => {
    expect(KEYS).toEqual(['06-cit-atm', '06-cit-doorstep', '06-cit-sbv', '06-cit-teller-vault']);
    for (const kind of CIT_DEMOS) {
      const key = CIT_INFO_KEYS[kind];
      expect(INFO_KEYS).toContain(key);
      expect(citDemoOfKey(key)).toBe(kind);
      expect(subProcessInfo(key).flow).toBe(6);
    }
    expect(citDemoOfKey('cit-vault')).toBeNull();
    // The menu lists them under Flow 06, after its own sub-groups and before Flow 07.
    const ids = MENU_CHOICES.map((c) => (c.kind === 'cit' ? c.key : c.kind === 'flow' ? `flow-${c.flow}` : c.sub));
    const six = ids.indexOf('flow-6');
    const seven = ids.indexOf('flow-7');
    for (const k of KEYS) expect(ids.indexOf(k)).toBeGreaterThan(six);
    for (const k of KEYS) expect(ids.indexOf(k)).toBeLessThan(seven);
  });

  it('carries the titles, Circular 01/2014 and every GL line its demo posts', () => {
    const titles = { ATM: 'Tiếp quỹ & Rút hộc tiền ATM / CDM', DOORSTEP: 'Thu tiền mặt tận nơi cho Doanh nghiệp WinMart / Go!', SBV: 'Nộp / Rút tiền mặt tại Ngân hàng Nhà nước (NHNN)', TELLER: 'Tiếp quỹ Quầy GDV & Phân loại tiền Fit / Unfit' } as const;
    for (const kind of CIT_DEMOS) {
      const e = subProcessInfo(CIT_INFO_KEYS[kind]);
      expect(e.title.vi).toBe(titles[kind]);
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
    expect(renderToStaticMarkup(createElement(SubProcessInfoView, { info: subProcessInfo('06-cit-sbv'), liveStr: 0 }))).toContain('▶ Run this scenario');
    // The domain sheet links to its four children.
    for (const k of KEYS) expect(subProcessInfo('cit-vault').related).toContain(k);
  });
});

describe('station renamed to the Cash & Collateral Vault', () => {
  it('reads KHO QUỸ & TÀI SẢN BẢO ĐẢM in Vietnamese and Cash & Collateral Vault in English, in both vocabularies', () => {
    expect(STATIONS.COLLATERAL_VAULT.name).toBe('Cash & Collateral Vault');
    for (const mode of ['expert', 'beginner'] as const) {
      setActiveLocale('vi');
      expect(stationName('COLLATERAL_VAULT', mode)).toBe('KHO QUỸ & TÀI SẢN BẢO ĐẢM');
      expect(stationTitle('COLLATERAL_VAULT', mode)).toBe('KHO QUỸ & TÀI SẢN BẢO ĐẢM');
      setActiveLocale('en');
      expect(stationName('COLLATERAL_VAULT', mode)).toBe('Cash & Collateral Vault');
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
  it('says who decides at the station the payment is at, and what kind of route it is', () => {
    expect(routeMode(['GATE_POS', 'LEDGER_DEBIT'])).toBe('STP');
    expect(routeMode(['GATE_POS', 'BNPL'])).toBe('HYBRID');
    expect(routeMode(['TELLER_CASH'])).toBe('MANUAL');
    expect(flowBeat({ route: ['GATE_POS', 'STP_ENGINE', 'BNPL'], at: 1, done: false })).toEqual({ from: 'GATE_POS', at: 'STP_ENGINE', mode: 'STP', route: 'HYBRID' });
    expect(flowBeat({ route: ['GATE_POS', 'STP_ENGINE', 'BNPL'], at: 2, done: false })?.mode).toBe('MANUAL');
    expect(flowBeat({ route: ['GATE_POS'], at: 0, done: true })).toBeNull();
  });
});
