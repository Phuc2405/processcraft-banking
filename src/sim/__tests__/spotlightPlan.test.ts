import { describe, expect, it } from 'vitest';
import { LESSON_LIST, LESSONS } from '../learning';
import { SPOTLIGHT_DEFAULT_EXAMPLE, routeBetween, spotPlan, spotScope, trailUpTo, wiresOfRoute } from '../spotlightPlan';
import { hasWire } from '../topology';
import { quizFor, quizzesOf } from '../walkQuiz';

describe('routes along the wires', () => {
  it('stays put when there is nowhere to go', () => {
    expect(routeBetween('RECON', 'RECON')).toEqual(['RECON']);
  });

  it('takes a wire when there is one', () => {
    expect(routeBetween('SEC_VAULT', 'SEC_DCVV')).toEqual(['SEC_VAULT', 'SEC_DCVV']);
    expect(routeBetween('SEC_3DS', 'CUSTOMER_OTP')).toEqual(['SEC_3DS', 'CUSTOMER_OTP']);
  });

  it('chains wires when the desks are further apart', () => {
    const route = routeBetween('GATE_VIRTUAL', 'OUT_APPROVED');
    expect(route[0]).toBe('GATE_VIRTUAL');
    expect(route[route.length - 1]).toBe('OUT_APPROVED');
    for (let i = 1; i < route.length; i++) expect(hasWire(route[i - 1]!, route[i]!)).toBe(true);
  });

  it('draws a straight hop between two places no wire leads between', () => {
    expect(routeBetween('OUT_DECLINED', 'GATE_POS')).toEqual(['OUT_DECLINED', 'GATE_POS']);
  });

  it('names the wires of a route', () => {
    expect(wiresOfRoute(['SEC_VAULT', 'SEC_DCVV', 'LEDGER_DEBIT'])).toEqual(['SEC_VAULT>SEC_DCVV', 'SEC_DCVV>LEDGER_DEBIT']);
    expect(wiresOfRoute(['RECON'])).toEqual([]);
  });
});

describe('the plan for every example of every process', () => {
  for (const lesson of LESSON_LIST) {
    for (const example of lesson.examples) {
      it(`${lesson.id}/${example.id}: every step has a desk, and the token only rides real wires`, () => {
        const plan = spotPlan(lesson.id, example.id);
        expect(plan.steps.length).toBeGreaterThan(2);
        expect(plan.steps.length).toBe(plan.walk.steps.length);
        let at = plan.origin;
        for (const s of plan.steps) {
          expect(s.route[s.route.length - 1]).toBe(s.place);
          if (at) expect(s.route[0]).toBe(at);
          for (let i = 1; i < s.route.length; i++) expect(hasWire(s.route[i - 1]!, s.route[i]!)).toBe(true);
          at = s.place;
        }
      });

      it(`${lesson.id}/${example.id}: every step says what can go wrong`, () => {
        for (const s of spotPlan(lesson.id, example.id).steps) expect(s.step.fails.length, `${lesson.id}/${example.id}/${s.step.nodeId}`).toBeGreaterThan(0);
      });
    }
  }
});

describe('where each story begins and ends', () => {
  it('A: a virtual card goes gate, vault, dCVV, ledger, approved', () => {
    const places = spotPlan('A', 'fresh').steps.map((s) => s.place);
    expect(places[0]).toBe('GATE_VIRTUAL');
    expect(places).toContain('SEC_VAULT');
    expect(places).toContain('SEC_DCVV');
    expect(places[places.length - 1]).toBe('OUT_APPROVED');
  });

  it('A: a decision stays at the desk that just worked', () => {
    const plan = spotPlan('A', 'fresh');
    const i = plan.steps.findIndex((s) => s.step.nodeId === 'n_xor_dcvv');
    expect(plan.steps[i]?.place).toBe(plan.steps[i - 1]?.place);
    expect(plan.steps[i]?.route).toHaveLength(1);
  });

  it('A: an unknown card number is declined by the vault', () => {
    const plan = spotPlan('A', 'unknown');
    expect(plan.steps[plan.steps.length - 1]?.place).toBe('OUT_DECLINED');
    expect(plan.steps.map((s) => s.place)).not.toContain('SEC_DCVV');
  });

  it('B: a challenged payment goes to the customer’s phone and comes back to the same desk', () => {
    const places = spotPlan('B', 'borderline').steps.map((s) => s.place);
    const phone = places.indexOf('CUSTOMER_OTP');
    expect(phone).toBeGreaterThan(0);
    expect(places[phone - 1]).toBe('SEC_3DS');
    expect(places[phone + 1]).toBe('SEC_3DS');
  });

  it('C: a strong score takes the plan; a weak one falls back to the card', () => {
    const strong = spotPlan('C', 'strong').steps.map((s) => s.step.nodeId);
    const weak = spotPlan('C', 'weak').steps.map((s) => s.step.nodeId);
    expect(strong).toContain('n_ledger_dp');
    expect(weak).toContain('n_ledger_card');
  });

  it('D: the night starts from the Approved tally and ends settled or in the holding box', () => {
    const clean = spotPlan('D', 'clean');
    expect(clean.origin).toBe('OUT_APPROVED');
    expect(clean.steps[0]?.route).toEqual(['OUT_APPROVED', 'EOD_BATCH']);
    expect(clean.steps[clean.steps.length - 1]?.place).toBe('OUT_SETTLED');
    const variance = spotPlan('D', 'variance');
    expect(variance.steps.map((s) => s.place)).toContain('SUSPENSE');
  });

  it('the rules change the story the plan tells', () => {
    const tight = spotPlan('B', 'calm', { frictionlessBelow: 10 });
    const loose = spotPlan('B', 'calm', { frictionlessBelow: 90 });
    expect(tight.steps.map((s) => s.place)).toContain('CUSTOMER_OTP');
    expect(loose.steps.map((s) => s.place)).not.toContain('CUSTOMER_OTP');
  });

  it('plans are remembered', () => {
    expect(spotPlan('A', 'fresh')).toBe(spotPlan('A', 'fresh'));
  });
});

describe('what stays lit', () => {
  it('keeps the desks of a process and dims the rest', () => {
    const a = spotScope('A');
    expect(a.places.has('GATE_VIRTUAL')).toBe(true);
    expect(a.places.has('SEC_VAULT')).toBe(true);
    expect(a.places.has('LEDGER_DEBIT')).toBe(true);
    expect(a.places.has('LEDGER_CREDIT')).toBe(true);
    expect(a.places.has('GATE_POS')).toBe(false);
    expect(a.places.has('RECON')).toBe(false);
    expect(a.departments.has('SECURITY')).toBe(true);
    expect(a.departments.has('BNPL')).toBe(false);
  });

  it('lights the customer’s phone only for the 3DS process', () => {
    expect(spotScope('B').places.has('CUSTOMER_OTP')).toBe(true);
    expect(spotScope('A').places.has('CUSTOMER_OTP')).toBe(false);
  });

  it('lights the wires the process rides and no others', () => {
    const wires = spotScope('A').wires;
    expect(wires.has('SEC_VAULT>SEC_DCVV')).toBe(true);
    expect(wires.has('GATE_POS>LEDGER_DEBIT')).toBe(false);
  });

  it('knows what the token has already passed', () => {
    const plan = spotPlan('A', 'fresh');
    const early = trailUpTo(plan, 0);
    expect(early.places.has('GATE_VIRTUAL')).toBe(true);
    expect(early.places.has('SEC_DCVV')).toBe(false);
    const late = trailUpTo(plan, plan.steps.length - 1);
    expect(late.places.has('OUT_APPROVED')).toBe(true);
    expect(late.wires.has('SEC_VAULT>SEC_DCVV')).toBe(true);
    expect(trailUpTo(plan, 999).places.size).toBe(late.places.size);
  });

  it('opens each process on the example named for it, and that example exists', () => {
    for (const lesson of LESSON_LIST) expect(lesson.examples.some((e) => e.id === SPOTLIGHT_DEFAULT_EXAMPLE[lesson.id])).toBe(true);
  });
});

describe('the questions at the decision gateways', () => {
  for (const lesson of LESSON_LIST) {
    for (const example of lesson.examples) {
      it(`${lesson.id}/${example.id}: each question sits on a decision, and its answer is the wire the diagram took`, () => {
        const plan = spotPlan(lesson.id, example.id);
        for (const q of quizzesOf(plan)) {
          const here = plan.steps[q.step]!;
          const next = plan.steps[q.step + 1]!;
          expect(here.step.kind).toBe('gateway');
          expect(q.options.length).toBeGreaterThanOrEqual(2);
          expect(q.correct).toBeGreaterThanOrEqual(0);
          expect(q.correct).toBeLessThan(q.options.length);
          expect(q.prompt.endsWith('?')).toBe(true);
          expect(q.explain.length).toBeGreaterThan(0);
          expect(next.step.nodeId.length).toBeGreaterThan(0);
        }
      });
    }
  }

  it('asks about the OTP at the 3DS decision, with the real risk score in it', () => {
    const plan = spotPlan('B', 'calm');
    const q = quizzesOf(plan).find((x) => x.nodeId === 'n_xor_3ds')!;
    expect(q.prompt).toContain(`risk score is ${LESSONS.B.examples.find((e) => e.id === 'calm')!.payload.riskScore}`);
    expect(q.prompt).toMatch(/OTP/);
    expect(q.options[q.correct]).toMatch(/frictionless/);
  });

  it('gets the right answer for a challenged payment and for the same payment when the customer comes back', () => {
    const plan = spotPlan('B', 'borderline');
    const asks = quizzesOf(plan).filter((x) => x.nodeId === 'n_xor_3ds');
    expect(asks).toHaveLength(2);
    expect(asks[0]!.options[asks[0]!.correct]).toMatch(/OTP/);
    expect(asks[1]!.options[asks[1]!.correct]).toMatch(/ledger/);
  });

  it('asks again with the customer’s choice when they never type the code', () => {
    const plan = spotPlan('B', 'walkaway');
    const asks = quizzesOf(plan).filter((x) => x.nodeId === 'n_xor_3ds');
    expect(asks[1]!.prompt).toMatch(/closed the page/);
    expect(asks[1]!.options[asks[1]!.correct]).toMatch(/Decline/);
  });

  it('puts the live rules into the question', () => {
    const q = quizzesOf(spotPlan('B', 'calm', { frictionlessBelow: 25, rejectAtOrAbove: 70 })).find((x) => x.nodeId === 'n_xor_3ds')!;
    expect(q.prompt).toContain('below 25');
    expect(q.prompt).toContain('70 or more');
  });

  it('asks about the plan, the funds and the three records on the other processes', () => {
    expect(quizzesOf(spotPlan('C', 'strong')).map((q) => q.nodeId)).toEqual(['n_xor_plan', 'n_xor_funds']);
    expect(quizzesOf(spotPlan('D', 'variance')).map((q) => q.nodeId)).toEqual(['n_xor_recon']);
    expect(quizzesOf(spotPlan('A', 'fresh')).map((q) => q.nodeId)).toEqual(['n_xor_dcvv', 'n_xor_ledger']);
  });

  it('asks nothing at a step that is not a decision', () => {
    const plan = spotPlan('A', 'fresh');
    expect(quizFor(plan, 0)).toBeNull();
    expect(quizFor(plan, 999)).toBeNull();
    expect(quizFor(plan, plan.steps.length - 1)).toBeNull();
  });
});
