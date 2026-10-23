/**
 * The micro-quizzes at the decision gateways of a guided walkthrough.
 *
 * When the token reaches an XOR gateway it stops and asks the learner which way the payment goes. The questions are built
 * from the payment in front of them and the bank's current rules, and the right answer is never typed in: it is the wire
 * the real process diagram took (the next step of the plan). So a quiz can never disagree with the simulation.
 *
 * The wording lives in one `Localized` book, keyed by process and by the gateway's box id.
 */

import { pick, type Localized } from '../i18n/locale';
import { formatMoney } from './kpis';
import { LESSONS, type LessonExample, type ProcessId } from './learning';
import type { BankRules } from './rules';
import type { SpotPlan, SpotStep } from './spotlightPlan';

export interface WalkQuiz {
  /** The step the question belongs to. */
  step: number;
  nodeId: string;
  prompt: string;
  options: string[];
  /** Index of the right option. */
  correct: number;
  /** What the diagram actually did, shown after the answer. */
  explain: string;
}

/** Everything a question can be built from. */
interface Ctx {
  plan: SpotPlan;
  index: number;
  current: SpotStep;
  example: LessonExample;
  rules: BankRules;
  /** Looks a labelled fact up on the "what the payment carries" list. */
  carry(label: string): string;
  /** The box the previous step was at. */
  before: SpotStep | undefined;
}

interface Draft {
  prompt: string;
  options: string[];
  /** The box the payment goes to next, mapped to the option that describes it. */
  branches: Record<string, number>;
}

type Builder = (c: Ctx) => Draft;

const money = (cents: number): string => formatMoney(cents);

const STAGE_WORDS: Record<string, string> = { NEW: 'a new claim', RETRIEVAL_REQUEST: 'at the retrieval-request stage', FIRST_CHARGEBACK: 'at the first-chargeback stage', REPRESENTMENT: 'at the representment stage', PRE_ARBITRATION: 'at the pre-arbitration stage' };

/** "The claim is at the representment stage and the merchant’s evidence is weak." */
const claimLine = (d: { stage: string; merchantEvidence: string } | undefined): string => `The claim is ${STAGE_WORDS[d?.stage ?? 'NEW'] ?? 'open'} and the merchant’s evidence is ${(d?.merchantEvidence ?? 'NONE').toLowerCase()}.`;

const ledgerQuestion: Builder = (c) => ({
  prompt: `The ${c.carry('Account holds') !== '—' ? `account holds ${c.carry('Account holds')}` : `card holds ${c.carry('Card holds')}`} and the payment is ${c.carry('Amount')}. Does the ledger say yes?`,
  options: ['Yes: place the hold and approve', 'No: decline for lack of funds'],
  branches: { n_end_approved: 0, n_end_declined: 1 },
});

interface QuizBook {
  /** Per process, per gateway box. */
  builders: Record<ProcessId, Record<string, Builder>>;
}

const EN: QuizBook = {
  builders: {
    A: {
      n_xor_dcvv: (c) => {
        const p = c.example.payload;
        const vault = p.virtualCard?.vaultEntry;
        const age = vault ? Math.round((p.clientTimestamp - vault.dcvvIssuedAt) / 1000) : 0;
        return {
          prompt: `The shopper typed ${p.rawCvv}, the vault expects ${vault?.expectedDcvv ?? '—'}, and the code is ${age} seconds old. The bank accepts a code for ${c.rules.dcvvWindowSec} seconds. Is the dCVV good?`,
          options: ['Yes: right code, still fresh. On to the ledger.', 'No: wrong or expired. Decline.'],
          branches: { n_ledger: 0, n_end_declined: 1 },
        };
      },
      n_xor_ledger: ledgerQuestion,
    },
    B: {
      n_xor_3ds: (c): Draft => {
        if (c.current.step.pass === 2) {
          const done = c.example.otpCompletes ?? false;
          return {
            prompt: done ? 'The customer typed the code from their phone. Where does the payment go now?' : 'The customer closed the page without typing the code. Where does the payment go now?',
            options: ['On to the ledger to check the money', 'Decline: the challenge was not completed'],
            branches: { n_ledger: 0, n_end_declined: 1 },
          };
        }
        return {
          prompt: `The risk score is ${c.example.payload.riskScore}. Scores below ${c.rules.frictionlessBelow} go through untouched, and ${c.rules.rejectAtOrAbove} or more are rejected. Does the customer need to enter an OTP?`,
          options: ['No: straight through (frictionless)', 'Yes: stop and send an OTP (challenge)', 'Neither: reject the payment'],
          branches: { n_ledger: 0, n_end_challenge: 1, n_end_declined: 2 },
        };
      },
      n_xor_ledger: ledgerQuestion,
    },
    C: {
      n_xor_plan: (c) => {
        const bnpl = c.example.payload.bnpl;
        const pct = bnpl ? Math.round((bnpl.downPaymentMinor / c.example.payload.amount) * 100) : 0;
        return {
          prompt: `The customer’s score is ${bnpl?.underwritingScore ?? '—'} (the minimum is ${c.rules.bnplMinScore}) and they are putting ${pct}% down (the minimum is ${c.rules.bnplMinDownPct}%). Is the plan approved?`,
          options: ['Yes: collect the down payment and start the plan', 'No: fall back to paying the full price by card'],
          branches: { n_ledger_dp: 0, n_ledger_card: 1 },
        };
      },
      n_xor_funds: (c) => {
        const planned = c.before?.step.nodeId === 'n_ledger_dp';
        const bnpl = c.example.payload.bnpl;
        return {
          prompt: planned
            ? `The plan was approved, so the ledger checked the down payment of ${bnpl ? money(bnpl.downPaymentMinor) : '—'}. The card holds ${c.carry('Card holds')}. How does the payment end?`
            : `There is no plan, so the ledger checked the full ${c.carry('Amount')}. The card holds ${c.carry('Card holds')}. How does the payment end?`,
          options: ['Approved: Pay-in-4 plan', 'Approved: paid in full by card', 'Declined: the down payment could not be taken', 'Declined: the card cannot cover the full price'],
          branches: { n_end_bnpl: 0, n_end_card: 1, n_end_dp_declined: 2, n_end_card_declined: 3 },
        };
      },
    },
    D: {
      n_xor_recon: (c) => {
        const s = c.example.payload.settlement;
        const leg = (v: number | null | undefined): string => (v == null ? 'missing' : money(v));
        const times = (s?.clearingPresentments ?? 1) > 1 ? ` (presented ${s?.clearingPresentments} times)` : '';
        return {
          prompt: `The bank’s ledger says ${leg(s?.ledgerAmount)}, the scheme says ${leg(s?.clearingAmount)}${times}, and the shop’s bank says ${leg(s?.switchAmount)}. Differences up to ${money(c.rules.reconToleranceCents)} count as a match. What does the desk do?`,
          options: ['Match: the payment is settled', 'Break: the amounts differ. Park the gap in the holding box.', 'Break: a record is missing. Park the payment.', 'Break: a duplicate. Park the payment.'],
          branches: { n_end_settled: 0, n_end_amount: 1, n_end_missing: 2, n_end_dup: 3 },
        };
      },
    },
    E: {
      n_xor_valid: (c) => {
        const m = c.example.payload.a2a;
        const ref = m?.endToEndId ? `“${m.endToEndId}”` : 'none';
        return {
          prompt: `The message carries the reference ${ref}, a sending bank ${m?.debtorAgent ?? '—'} and a receiving bank ${m?.creditorAgent ?? '—'}. The customer asked to send ${c.carry('Amount')} and the banks will settle ${m ? money(m.interbankSettlementAmount) : '—'}. Is the pacs.008 well formed?`,
          options: ['Yes: every field is right. On to the ledger.', 'No: a field is wrong. Reject it at the door.'],
          branches: { n_ledger: 0, n_end_invalid: 1 },
        };
      },
      n_xor_funds: (c) => ({
        prompt: `The account holds ${c.carry('Account holds')} and the transfer is ${c.carry('Amount')}. Does the ledger say yes?`,
        options: ['Yes: set the money aside and release the transfer', 'No: decline for lack of funds'],
        branches: { n_end_approved: 0, n_end_declined: 1 },
      }),
    },
    F: {
      n_xor_hit: (c) => ({
        prompt: `Screening reports: “${c.before?.step.happened ?? ''}” Where does the payment go?`,
        options: ['A name hit: send it to Case Investigation', 'No name hit, but the deposits look like structuring: file a report', 'Nothing to see: release the payment'],
        branches: { n_case: 0, n_end_sar: 1, n_end_released: 2 },
      }),
      n_xor_verdict: (c) => ({
        prompt: `The investigation reads: “${c.before?.step.happened ?? ''}” What does the bank do?`,
        options: ['A false positive: release the payment', 'A true match on a sanctions list: block it', 'A true match on a PEP list: ask for the source of funds', 'Inconclusive: escalate for enhanced due diligence'],
        branches: { n_end_cleared: 0, n_end_sanctions: 1, n_end_edd: 2, n_end_escalate: 3 },
      }),
      n_xor_gate: (c) => ({
        prompt: `The dispute desk says: “${c.before?.step.happened ?? ''}” Can the claim go ahead?`,
        options: ['No: it is out of time, so it is dead whoever would have paid', 'No: the purchase was authenticated, so the issuer absorbs the loss', 'Yes: carry on to the dispute stage'],
        branches: { n_end_barred: 0, n_end_absorbed: 1, n_xor_stage: 2 },
      }),
      n_xor_stage: (c) => ({
        prompt: `${claimLine(c.example.payload.dispute)} What is the next move?`,
        options: ['Ask the merchant for the receipt', 'File the first chargeback', 'Review the merchant’s answer (representment)', 'Go further: pre-arbitration, or a final result'],
        branches: { n_end_retrieval: 0, n_end_filed: 1, n_end_represent: 2, n_xor_result: 3 },
      }),
      n_xor_result: (c) => ({
        prompt: `${claimLine(c.example.payload.dispute)} How does it end?`,
        options: ['The bank rejects the answer and escalates to pre-arbitration', 'The cardholder wins and keeps the refund', 'The merchant wins and the credit is taken back'],
        branches: { n_end_prearb: 0, n_end_refunded: 1, n_end_merchant: 2 },
      }),
    },
  },
};

const STAGE_WORDS_VI: Record<string, string> = { NEW: 'là khiếu nại mới', RETRIEVAL_REQUEST: 'đang ở giai đoạn yêu cầu chứng từ', FIRST_CHARGEBACK: 'đang ở giai đoạn tra soát lần đầu', REPRESENTMENT: 'đang ở giai đoạn cửa hàng phản hồi', PRE_ARBITRATION: 'đang ở giai đoạn tiền trọng tài' };
const EVIDENCE_VI: Record<string, string> = { NONE: 'không có', WEAK: 'yếu', COMPELLING: 'thuyết phục' };

const claimLineVi = (d: { stage: string; merchantEvidence: string } | undefined): string =>
  `Khiếu nại ${STAGE_WORDS_VI[d?.stage ?? 'NEW'] ?? 'đang mở'} và bằng chứng của cửa hàng ${EVIDENCE_VI[d?.merchantEvidence ?? 'NONE'] ?? (d?.merchantEvidence ?? 'NONE').toLowerCase()}.`;

const ledgerQuestionVi: Builder = (c) => ({
  prompt: `${c.carry('Account holds') !== '—' ? `Tài khoản có ${c.carry('Account holds')}` : `Thẻ có ${c.carry('Card holds')}`} và giao dịch là ${c.carry('Amount')}. Sổ cái có đồng ý không?`,
  options: ['Có: khoanh giữ tiền và duyệt', 'Không: từ chối vì không đủ tiền'],
  branches: { n_end_approved: 0, n_end_declined: 1 },
});

const VI: QuizBook = {
  builders: {
    A: {
      n_xor_dcvv: (c) => {
        const p = c.example.payload;
        const vault = p.virtualCard?.vaultEntry;
        const age = vault ? Math.round((p.clientTimestamp - vault.dcvvIssuedAt) / 1000) : 0;
        return {
          prompt: `Người mua nhập ${p.rawCvv}, kho token mong đợi ${vault?.expectedDcvv ?? '—'}, và mã đã được ${age} giây. Ngân hàng chấp nhận mã trong ${c.rules.dcvvWindowSec} giây. dCVV có hợp lệ không?`,
          options: ['Có: đúng mã, vẫn còn mới. Chuyển tới sổ cái.', 'Không: sai hoặc hết hạn. Từ chối.'],
          branches: { n_ledger: 0, n_end_declined: 1 },
        };
      },
      n_xor_ledger: ledgerQuestionVi,
    },
    B: {
      n_xor_3ds: (c): Draft => {
        if (c.current.step.pass === 2) {
          const done = c.example.otpCompletes ?? false;
          return {
            prompt: done ? 'Khách đã nhập mã từ điện thoại. Giờ giao dịch đi đâu?' : 'Khách đóng trang mà không nhập mã. Giờ giao dịch đi đâu?',
            options: ['Tới sổ cái để kiểm tra tiền', 'Từ chối: thử thách chưa hoàn tất'],
            branches: { n_ledger: 0, n_end_declined: 1 },
          };
        }
        return {
          prompt: `Điểm rủi ro là ${c.example.payload.riskScore}. Điểm dưới ${c.rules.frictionlessBelow} đi thẳng, từ ${c.rules.rejectAtOrAbove} trở lên bị từ chối. Khách có cần nhập OTP không?`,
          options: ['Không: đi thẳng (không ma sát)', 'Có: dừng lại và gửi OTP (thử thách)', 'Không cái nào: từ chối giao dịch'],
          branches: { n_ledger: 0, n_end_challenge: 1, n_end_declined: 2 },
        };
      },
      n_xor_ledger: ledgerQuestionVi,
    },
    C: {
      n_xor_plan: (c) => {
        const bnpl = c.example.payload.bnpl;
        const pct = bnpl ? Math.round((bnpl.downPaymentMinor / c.example.payload.amount) * 100) : 0;
        return {
          prompt: `Điểm của khách là ${bnpl?.underwritingScore ?? '—'} (tối thiểu ${c.rules.bnplMinScore}) và họ trả trước ${pct}% (tối thiểu ${c.rules.bnplMinDownPct}%). Kế hoạch có được duyệt không?`,
          options: ['Có: thu khoản trả trước và bắt đầu kế hoạch', 'Không: chuyển sang trả đủ giá bằng thẻ'],
          branches: { n_ledger_dp: 0, n_ledger_card: 1 },
        };
      },
      n_xor_funds: (c) => {
        const planned = c.before?.step.nodeId === 'n_ledger_dp';
        const bnpl = c.example.payload.bnpl;
        return {
          prompt: planned
            ? `Kế hoạch đã được duyệt, nên sổ cái kiểm tra khoản trả trước ${bnpl ? money(bnpl.downPaymentMinor) : '—'}. Thẻ có ${c.carry('Card holds')}. Giao dịch kết thúc thế nào?`
            : `Không có kế hoạch, nên sổ cái kiểm tra đủ ${c.carry('Amount')}. Thẻ có ${c.carry('Card holds')}. Giao dịch kết thúc thế nào?`,
          options: ['Duyệt: kế hoạch trả 4 kỳ', 'Duyệt: trả đủ bằng thẻ', 'Từ chối: không thu được khoản trả trước', 'Từ chối: thẻ không đủ trả toàn bộ giá'],
          branches: { n_end_bnpl: 0, n_end_card: 1, n_end_dp_declined: 2, n_end_card_declined: 3 },
        };
      },
    },
    D: {
      n_xor_recon: (c) => {
        const s = c.example.payload.settlement;
        const leg = (v: number | null | undefined): string => (v == null ? 'bị thiếu' : money(v));
        const times = (s?.clearingPresentments ?? 1) > 1 ? ` (được trình ${s?.clearingPresentments} lần)` : '';
        return {
          prompt: `Sổ cái ngân hàng ghi ${leg(s?.ledgerAmount)}, tổ chức thẻ ghi ${leg(s?.clearingAmount)}${times}, và ngân hàng của cửa hàng ghi ${leg(s?.switchAmount)}. Chênh lệch tới ${money(c.rules.reconToleranceCents)} được coi là khớp. Quầy làm gì?`,
          options: ['Khớp: giao dịch được quyết toán', 'Sai lệch: số tiền khác nhau. Đưa khoản chênh vào tài khoản treo.', 'Sai lệch: thiếu một bản ghi. Treo giao dịch lại.', 'Sai lệch: bị trùng. Treo giao dịch lại.'],
          branches: { n_end_settled: 0, n_end_amount: 1, n_end_missing: 2, n_end_dup: 3 },
        };
      },
    },
    E: {
      n_xor_valid: (c) => {
        const m = c.example.payload.a2a;
        const ref = m?.endToEndId ? `“${m.endToEndId}”` : 'không có';
        return {
          prompt: `Thông điệp có mã tham chiếu ${ref}, ngân hàng gửi ${m?.debtorAgent ?? '—'} và ngân hàng nhận ${m?.creditorAgent ?? '—'}. Khách yêu cầu gửi ${c.carry('Amount')} và hai ngân hàng sẽ quyết toán ${m ? money(m.interbankSettlementAmount) : '—'}. pacs.008 có đúng định dạng không?`,
          options: ['Có: mọi trường đều đúng. Chuyển tới sổ cái.', 'Không: có trường sai. Từ chối ngay tại cửa.'],
          branches: { n_ledger: 0, n_end_invalid: 1 },
        };
      },
      n_xor_funds: (c) => ({
        prompt: `Tài khoản có ${c.carry('Account holds')} và lệnh chuyển là ${c.carry('Amount')}. Sổ cái có đồng ý không?`,
        options: ['Có: trích giữ tiền và giải phóng lệnh chuyển', 'Không: từ chối vì không đủ tiền'],
        branches: { n_end_approved: 0, n_end_declined: 1 },
      }),
    },
    F: {
      n_xor_hit: (c) => ({
        prompt: `Sàng lọc báo: “${c.before?.step.happened ?? ''}” Giao dịch đi đâu?`,
        options: ['Trùng tên: chuyển sang Điều tra hồ sơ', 'Không trùng tên, nhưng tiền nộp có dấu hiệu chia nhỏ: lập báo cáo', 'Không có gì: giải phóng giao dịch'],
        branches: { n_case: 0, n_end_sar: 1, n_end_released: 2 },
      }),
      n_xor_verdict: (c) => ({
        prompt: `Kết quả điều tra: “${c.before?.step.happened ?? ''}” Ngân hàng làm gì?`,
        options: ['Cảnh báo sai: giải phóng giao dịch', 'Trùng thật với danh sách cấm vận: chặn lại', 'Trùng thật với danh sách PEP: yêu cầu giải trình nguồn tiền', 'Chưa kết luận được: chuyển cấp thẩm định tăng cường'],
        branches: { n_end_cleared: 0, n_end_sanctions: 1, n_end_edd: 2, n_end_escalate: 3 },
      }),
      n_xor_gate: (c) => ({
        prompt: `Quầy tra soát cho biết: “${c.before?.step.happened ?? ''}” Khiếu nại có tiếp tục được không?`,
        options: ['Không: đã quá hạn, nên hết hiệu lực dù ai lẽ ra phải trả', 'Không: giao dịch đã được xác thực, nên ngân hàng phát hành tự chịu tổn thất', 'Có: chuyển sang giai đoạn tra soát'],
        branches: { n_end_barred: 0, n_end_absorbed: 1, n_xor_stage: 2 },
      }),
      n_xor_stage: (c) => ({
        prompt: `${claimLineVi(c.example.payload.dispute)} Bước tiếp theo là gì?`,
        options: ['Yêu cầu cửa hàng xuất trình hóa đơn', 'Nộp tra soát lần đầu', 'Xem xét phản hồi của cửa hàng (representment)', 'Đi xa hơn: tiền trọng tài, hoặc kết quả cuối'],
        branches: { n_end_retrieval: 0, n_end_filed: 1, n_end_represent: 2, n_xor_result: 3 },
      }),
      n_xor_result: (c) => ({
        prompt: `${claimLineVi(c.example.payload.dispute)} Vụ việc kết thúc thế nào?`,
        options: ['Ngân hàng bác phản hồi và chuyển lên tiền trọng tài', 'Chủ thẻ thắng và giữ khoản hoàn tiền', 'Cửa hàng thắng và khoản ghi có bị thu lại'],
        branches: { n_end_prearb: 0, n_end_refunded: 1, n_end_merchant: 2 },
      }),
    },
  },
};

export const QUIZ_BOOK: Localized<QuizBook> = { en: EN, vi: VI };

/** The question at step `index` of a plan, or null when the step is not a decision with a question. */
export function quizFor(plan: SpotPlan, index: number): WalkQuiz | null {
  const current = plan.steps[index];
  const next = plan.steps[index + 1];
  if (!current || !next || current.step.kind !== 'gateway') return null;
  const build = pick(QUIZ_BOOK).builders[plan.process][current.step.nodeId];
  if (!build) return null;
  const example = LESSONS[plan.process].examples.find((e) => e.id === plan.exampleId);
  if (!example) return null;

  const ctx: Ctx = {
    plan,
    index,
    current,
    example,
    rules: plan.walk.rules,
    carry: (label) => plan.walk.carries.find((f) => f.label === label)?.value ?? '—',
    before: plan.steps[index - 1],
  };
  const draft = build(ctx);
  const correct = draft.branches[next.step.nodeId];
  if (correct === undefined) return null;
  return { step: index, nodeId: current.step.nodeId, prompt: draft.prompt, options: draft.options, correct, explain: current.step.happened };
}

/** Every question a plan asks, in order. */
export function quizzesOf(plan: SpotPlan): WalkQuiz[] {
  const out: WalkQuiz[] = [];
  for (let i = 0; i < plan.steps.length; i++) {
    const q = quizFor(plan, i);
    if (q) out.push(q);
  }
  return out;
}
