import { afterEach, describe, expect, it } from 'vitest';
import { analystWorkspaceMessages } from '../../components/bank/analystWorkspace.messages';
import { isBalanced } from '../../engine/ledger';
import { setActiveLocale } from '../../i18n/locale';
import { QR_SCANNED_LABEL_EN, stationBrandMessages } from '../../i18n/stationBrand.messages';
import { VI_DICTIONARY } from '../../i18n/viDictionary';
import { createBankStore } from '../../store/bankStore';
import { bundleProblems, hasVietnamese } from '../../utils/i18nHelper';
import { BankSimulation } from '../bankSimulation';
import { ROLE_STATION, roleForStation, SHIFT_TARGET, STAFF_ROLES, type StaffCase, type StaffRoleId } from '../staffRoleplay';
import { stationCaption, stationName, stationTip, stationTitle } from '../terms';

afterEach(() => setActiveLocale('en'));

/** Takes over one desk and plays until a review waits there. */
function deskWithCase(role: StaffRoleId, seed = 2026): { sim: BankSimulation; head: StaffCase | undefined } {
  const sim = new BankSimulation({ seed, headless: true });
  sim.setStaffOverride(ROLE_STATION[role]);
  let head: StaffCase | undefined;
  while (!sim.dayOver && !head) {
    sim.step();
    head = sim.staffCases(ROLE_STATION[role])[0];
  }
  return { sim, head };
}

describe('QR station i18n hotfix', () => {
  it('names the QR desk by the global dynamic-QR rail in both languages and vocabularies', () => {
    for (const mode of ['expert', 'beginner'] as const) {
      expect(stationTitle('GATE_QR', mode)).toBe('Domestic Dynamic QR Gateway');
      expect(stationName('GATE_QR', mode)).toBe('Domestic Dynamic QR Gateway');
      expect(stationTip('GATE_QR', mode)).toContain('PromptPay QR (Thailand)');
    }
    expect(stationCaption('GATE_QR')).toBe('Processes dynamic QR payment payloads, decoding parameters and verifying digital signatures.');
    setActiveLocale('vi');
    expect(stationTitle('GATE_QR', 'expert')).toBe('Thanh toán Mã QR Nội địa');
    expect(stationCaption('GATE_QR')).toBe('Nơi các giao dịch quét mã QR động đi vào; ngân hàng đọc thông điệp và kiểm tra chữ ký số.');
    expect(stationTip('GATE_QR', 'beginner')).toContain('PromptPay QR (Thái Lan)');
  });

  it('writes the scanned label in English and translates it at display', () => {
    const sim = new BankSimulation({ seed: 2026, headless: true });
    sim.stepUntil(13 * 60);
    const labels = sim.snapshot().stations.GATE_QR.stats.lines.map((l) => l.label);
    expect(labels).toContain(QR_SCANNED_LABEL_EN);
    expect(VI_DICTIONARY[QR_SCANNED_LABEL_EN]).toBe(stationBrandMessages.messages.qr_metricScannedLabel.vi);
  });
});

describe('staff roleplay engine', () => {
  it('maps exactly the seven roleplay desks', () => {
    expect(STAFF_ROLES).toHaveLength(7);
    for (const role of STAFF_ROLES) expect(roleForStation(ROLE_STATION[role])).toBe(role);
    expect(roleForStation('GATE_POS')).toBeNull();
  });

  it('holds work for the learner at every roleplay desk, with English-only payload cards', () => {
    let built = 0;
    for (const role of STAFF_ROLES) {
      const { head } = deskWithCase(role);
      if (!head) continue;
      built++;
      expect(head.role).toBe(role);
      expect(head.fields.length).toBeGreaterThanOrEqual(4);
      expect(hasVietnamese(JSON.stringify(head))).toBe(false);
      for (const f of head.fields) expect(`field_${f.key}` in analystWorkspaceMessages.messages, f.key).toBe(true);
    }
    expect(built).toBeGreaterThanOrEqual(6);
  });

  it('gives the desk back to its own staff when the learner leaves', () => {
    const { sim, head } = deskWithCase('bnpl');
    expect(head).toBeDefined();
    sim.setStaffOverride(null);
    for (let i = 0; i < 6; i++) sim.step();
    expect(sim.staffCases('BNPL').some((c) => c.id === head!.id)).toBe(false);
  });

  it('grades a decision against the desk verdict, works the packet and keeps the ledger balanced', () => {
    const { sim, head: c } = deskWithCase('aml');
    expect(c).toBeDefined();
    const before = sim.snapshot().stations[c!.station].queueLength;
    const wrong = c!.expected === 'APPROVE' ? 'REJECT' : 'APPROVE';
    const result = sim.staffDecide(c!.station, c!.id, wrong, 12);
    expect(result).toMatchObject({ ok: true, correct: false, expected: c!.expected });
    expect(result.statusCode.length).toBeGreaterThan(0);
    const view = sim.snapshot().stations[c!.station];
    expect(view.queueLength).toBe(before - 1);
    const lines = Object.fromEntries(view.stats.lines.map((l) => [l.label, l.value]));
    expect(lines['Roleplay reviews']).toBe('1');
    expect(lines['Roleplay accuracy']).toBe('0%');
    expect(lines['Roleplay review latency (s)']).toBe('12');
    expect(sim.staffDecide(c!.station, c!.id, 'APPROVE', 1).ok).toBe(false);
    sim.runToEndOfDay();
    expect(isBalanced(sim.ledgerEntries)).toBe(true);
  });

  it('every SOP and role string exists in both languages with matching placeholders', () => {
    expect(bundleProblems(analystWorkspaceMessages)).toEqual([]);
    for (const role of STAFF_ROLES) {
      expect(`role_${role}_title` in analystWorkspaceMessages.messages).toBe(true);
      expect(`sop_${role}_1` in analystWorkspaceMessages.messages).toBe(true);
    }
  });
});

describe('staff roleplay in the store', () => {
  it('opens a desk paused, binds decisions to pendingQueueMap and unlocks the shift objective', () => {
    const store = createBankStore({ storage: null, seed: 2026 });
    const s = store.getState();
    s.openStaffDesk('GATE_POS');
    expect(store.getState().staffDesk).toBeNull();
    s.play();
    s.openStaffDesk('BNPL');
    expect(store.getState()).toMatchObject({ staffDesk: 'BNPL', playing: false });

    let reviews = 0;
    for (let guard = 0; guard < 400 && reviews < SHIFT_TARGET.reviews && !store.getState().sim.dayOver; guard++) {
      const pending = store.getState().pendingQueueMap.BNPL ?? [];
      const head = pending[0];
      if (!head) {
        store.getState().step();
        continue;
      }
      const result = store.getState().staffDecide(head.id, head.expected, 5, 30);
      expect(result.correct).toBe(true);
      expect((store.getState().pendingQueueMap.BNPL ?? []).some((q) => q.id === head.id)).toBe(false);
      reviews++;
    }
    const shift = store.getState().staffShift.bnpl!;
    expect(shift.reviews).toBe(SHIFT_TARGET.reviews);
    expect(shift.correct).toBe(SHIFT_TARGET.reviews);
    expect(shift.slaBreaches).toBe(0);

    store.getState().closeStaffDesk();
    expect(store.getState()).toMatchObject({ staffDesk: null, playing: true });
  });
});
