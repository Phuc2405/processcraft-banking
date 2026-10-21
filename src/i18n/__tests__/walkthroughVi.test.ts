import { afterEach, describe, expect, it } from 'vitest';
import { factLabel, factValue } from '../factsVi';
import { setActiveLocale } from '../locale';
import { noteText } from '../notesVi';
import { LESSONS, type ProcessId } from '../../sim/learning';
import { buildWalkthrough } from '../../sim/walkthrough';

const VI_LETTER = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹáàãéèíìóòõúùýĐ]/i;

describe('walkthrough in Vietnamese', () => {
  afterEach(() => setActiveLocale('en'));

  it('translates every engine note, verdict and fact of every bundled example', () => {
    setActiveLocale('vi');
    const english: string[] = [];
    for (const [id, lesson] of Object.entries(LESSONS)) {
      for (const ex of lesson.examples) {
        const walk = buildWalkthrough(id as ProcessId, ex.id);
        const lines = [...walk.steps.map((s) => s.happened), walk.verdict.headline, walk.verdict.detail];
        for (const line of lines) if (line && !VI_LETTER.test(line)) english.push(`${id}/${ex.id}: ${line}`);
        for (const f of [...walk.carries, ...walk.steps.flatMap((s) => s.facts)]) {
          if (factLabel(f.label) === f.label && !['Token', 'dCVV'].includes(f.label)) english.push(`${id}/${ex.id} label: ${f.label}`);
        }
      }
    }
    expect(english).toEqual([]);
  });

  it('keeps the English plan in English', () => {
    setActiveLocale('en');
    const [id, lesson] = Object.entries(LESSONS)[0]!;
    const walk = buildWalkthrough(id as ProcessId, lesson.examples[0]!.id);
    expect(walk.verdict.headline).not.toMatch(VI_LETTER);
  });

  it('rebuilds templated sentences around the same values', () => {
    setActiveLocale('vi');
    expect(noteText('dCVV matches and is 12.0 s old, window 60 s: valid.')).toBe('dCVV khớp và đã được 12.0 giây, cửa sổ 60 giây: hợp lệ.');
    expect(noteText('Structuring: 4 cash deposits just under $10,000.00 total $37,400.00.')).toBe('Chia nhỏ giao dịch: 4 lần nộp tiền mặt ngay dưới $10,000.00, tổng $37,400.00.');
    expect(noteText('An unknown sentence.')).toBe('An unknown sentence.');
    expect(factValue('3 in 30 days')).toBe('3 lần trong 30 ngày');
    expect(factLabel('Account holds')).toBe('Số dư tài khoản');
  });

  it('is a no-op in English', () => {
    setActiveLocale('en');
    expect(noteText('Released')).toBe('Released');
    expect(factLabel('Amount')).toBe('Amount');
  });
});
