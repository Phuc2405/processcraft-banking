/**
 * The Knowledge Base's STP article: what Straight-Through Processing is, how the core banking engine decides, the STR KPI and
 * exception handling, the fast-fail gates, and ISO 20022. The rule table is built from the engine's own defaults, so the
 * article never drifts from the simulation.
 */

import type { Localized } from '../i18n/locale';
import { formatMoney } from '../sim/kpis';
import { DEFAULT_STP, STP_LIMITS } from '../sim/stpEngine';
import type { KbTable } from './amlKnowledge';

const L = (en: string, vi: string): Localized<string> => ({ en, vi });

export interface StpSection {
  /** Every STP anchor starts with `stp-`, which is how a link finds the STP tab. */
  id: `stp-${string}`;
  title: Localized<string>;
  paragraphs: readonly Localized<string>[];
  advanced: readonly Localized<string>[];
  table?: KbTable;
  rule?: Localized<string>;
  level?: 'advanced';
  flow?: readonly Localized<string>[];
}

const RULES: KbTable = {
  columns: [L('Product', 'Sản phẩm'), L('Straight through when', 'Đi thẳng khi'), L('Otherwise', 'Ngược lại')],
  rows: [
    [L('BNPL / retail credit', 'BNPL / tín dụng bán lẻ'), L(`Amount ≤ ${formatMoney(DEFAULT_STP.bnplMaxCents)}, DTI ≤ ${DEFAULT_STP.maxDtiPct}%, eKYC PASS, CIC group 1`, `Số tiền ≤ ${formatMoney(DEFAULT_STP.bnplMaxCents)}, DTI ≤ ${DEFAULT_STP.maxDtiPct}%, eKYC ĐẠT, CIC nhóm 1`), L('Pay-in-4 appraisal desk', 'Quầy thẩm định BNPL')],
    [L('Term deposit at maturity', 'Tiết kiệm đến hạn'), L(`Not pledged and under ${formatMoney(STP_LIMITS.termDepositMaxCents)}: auto-renew or pay out`, `Không cầm cố và dưới ${formatMoney(STP_LIMITS.termDepositMaxCents)}: tự tái tục hoặc tất toán`), L('Savings Desk', 'Quầy Tiết kiệm')],
    [L('Card annual fee', 'Phí thường niên thẻ'), L(`Spend ≥ ${formatMoney(STP_LIMITS.premiumSpendCents)} a year: auto-waive; else CASA covers it: auto-debit`, `Chi tiêu ≥ ${formatMoney(STP_LIMITS.premiumSpendCents)}/năm: tự miễn; ngược lại CASA đủ: tự trích nợ`), L('Fee tracked off-book and retried', 'Theo dõi ngoại bảng và thu lại')],
    [L('Cash at the Smart Kiosk', 'Tiền mặt tại Smart Kiosk'), L(`Under ${formatMoney(STP_LIMITS.kioskMaxCents)} (the CTR line) and no AML hit`, `Dưới ${formatMoney(STP_LIMITS.kioskMaxCents)} (ngưỡng CTR) và không trùng AML`), L('Teller counter, CTR filed', 'Quầy giao dịch viên, lập CTR')],
  ],
};

/** The STP legal basis: the article's footer and every STP flashcard. */
export const STP_REF = L('SBV Circular 31/2024/TT-NHNN & the ISO 20022 e-payment message standard', 'Thông tư 31/2024/TT-NHNN & Tiêu chuẩn giao dịch điện tử ISO 20022');

export const STP_ARTICLE = {
  id: 'stp-automation',
  basis: STP_REF,
  title: L('Straight-Through Processing (STP): automation in modern core banking', 'Xử lý tự động STP: tự động hóa trong Core Banking hiện đại'),
  intro: L(
    'Straight-Through Processing means a case travels from the customer’s request to the posted ledger entry with no human touch. The rules a clerk would apply run as code in the core banking engine; only the exceptions reach a desk. Done well it cuts queues and cost; done badly it automates mistakes at machine speed.',
    'Xử lý thẳng (STP) nghĩa là một hồ sơ đi từ yêu cầu của khách đến bút toán đã hạch toán mà không cần con người can thiệp. Các quy tắc nhân viên vẫn áp dụng được chạy dưới dạng mã trong Core Banking; chỉ ngoại lệ mới đến quầy. Làm tốt thì giảm hàng chờ và chi phí; làm sai thì tự động hóa sai sót ở tốc độ máy.',
  ),
  sections: [
    {
      id: 'stp-concept',
      title: L('1. Concept and architecture', '1. Khái niệm và kiến trúc'),
      paragraphs: [
        L('An STP pipeline has four stages: ingestion (the gate validates the message), the rule engine (eKYC, DTI, credit bureau, limits, sanctions screen), real-time posting (Dr/Cr straight to the general ledger) and the response to the channel. In this bank the virtual node “STP Engine (Core Banking)” is that rule engine.', 'Một luồng STP có bốn chặng: tiếp nhận (cổng kiểm tra thông điệp), bộ quy tắc (eKYC, DTI, CIC, hạn mức, sàng lọc cấm vận), hạch toán thời gian thực (Nợ/Có thẳng vào sổ cái) và phản hồi về kênh. Trong ngân hàng mô phỏng, nút ảo “Trạm xử lý tự động STP (Core Banking Engine)” chính là bộ quy tắc đó.'),
        L('STP changes the path and the wait, never the books: the journal a straight-through case posts is exactly the one the manual desk would have posted.', 'STP thay đổi đường đi và thời gian chờ, không thay đổi sổ sách: bút toán hồ sơ STP hạch toán giống hệt bút toán quầy thủ công sẽ ghi.'),
      ],
      advanced: [L('Strategy pattern: each product (BNPL, term deposit, card fee, kiosk cash) is one interchangeable rule strategy, so a new product is one more strategy, not a change to the pipeline.', 'Mẫu Strategy: mỗi sản phẩm (BNPL, tiết kiệm, phí thẻ, tiền mặt kiosk) là một chiến lược quy tắc có thể thay thế, nên thêm sản phẩm là thêm một chiến lược, không phải sửa luồng.')],
      flow: [L('Gate: message valid?', 'Cổng: thông điệp hợp lệ?'), L('Fast-fail: eKYC / FDS / CIC 3-5', 'Loại sớm: eKYC / FDS / CIC 3-5'), L('Rules: amount, DTI, CIC 1, AML', 'Quy tắc: số tiền, DTI, CIC 1, AML'), L('Real-time GL posting', 'Hạch toán sổ cái tức thì'), L('Response to the channel', 'Phản hồi về kênh')],
      rule: L('Automate the rule, never the judgement: anything outside the rules falls back to a person.', 'Tự động hóa quy tắc, không tự động hóa phán đoán: mọi trường hợp ngoài quy tắc phải quay về con người.'),
    },
    {
      id: 'stp-rules',
      title: L('2. The STP rules in this bank', '2. Quy tắc STP trong ngân hàng mô phỏng'),
      paragraphs: [L('The defaults are below; the ⚡ STP drawer in the header changes them live. The BNPL limit runs $100 to $2,000 and the DTI cap 15% to 35%.', 'Giá trị mặc định ở bảng dưới; ngăn kéo ⚡ STP trên thanh tiêu đề thay đổi chúng tức thì. Hạn mức BNPL từ $100 đến $2,000 và trần DTI từ 15% đến 35%.')],
      advanced: [L('The DTI cap is inclusive (DTI ≤ cap) so the $400 Pay-in-4 demo at DTI 23% goes straight through on the default 23% cap.', 'Trần DTI tính cả giá trị bằng (DTI ≤ trần), nên ví dụ trả góp $400 với DTI 23% đi thẳng với trần mặc định 23%.')],
      table: RULES,
    },
    {
      id: 'stp-str',
      title: L('3. Straight-Through Rate (STR) and exception handling', '3. Tỷ lệ xử lý thẳng (STR) và xử lý ngoại lệ'),
      paragraphs: [
        L('STR = cases posted with no touch ÷ all cases decided. A retail bank aims high on simple products, but STR alone is a vanity number: watch it next to the default rate and the fallback queue.', 'STR = số hồ sơ hạch toán không cần can thiệp ÷ tổng số hồ sơ đã quyết định. Ngân hàng bán lẻ đặt STR cao cho sản phẩm đơn giản, nhưng chỉ nhìn STR là ảo: phải xem cùng tỷ lệ vỡ nợ và hàng chờ ngoại lệ.'),
        L('An exception (STP fallback) carries its flags to the desk: “amount over the limit”, “DTI over the cap”, “CIC not group 1”, “AML_SANCTION_MATCH”. The underwriter checks the flag, the credit history, and approves by manual override or refuses.', 'Một ngoại lệ (STP fallback) mang theo cờ lý do đến quầy: “vượt hạn mức”, “DTI vượt trần”, “CIC không phải nhóm 1”, “AML_SANCTION_MATCH”. Chuyên viên kiểm tra cờ, lịch sử tín dụng, rồi duyệt ngoại lệ (manual override) hoặc từ chối.'),
      ],
      advanced: [L('Tuning: raising the limit relieves the queue but widens default exposure. Change one dial at a time and watch the STR, the BNPL queue and the expected bad debt together.', 'Tinh chỉnh: nâng hạn mức giảm hàng chờ nhưng mở rộng rủi ro vỡ nợ. Mỗi lần chỉ đổi một tham số và quan sát đồng thời STR, hàng chờ BNPL và nợ xấu dự kiến.')],
      flow: [L('STP flags the case', 'STP gắn cờ hồ sơ'), L('Desk reads the flags', 'Quầy đọc cờ lý do'), L('Check CIC history', 'Kiểm tra lịch sử CIC'), L('Override approve or refuse', 'Duyệt ngoại lệ hoặc từ chối'), L('Audit trail kept', 'Lưu vết kiểm toán')],
      rule: L('Every override is logged with who, why and the flag it overrode.', 'Mọi lần duyệt ngoại lệ đều được ghi vết: ai duyệt, vì sao, và đã vượt cờ nào.'),
    },
    {
      id: 'stp-fastfail',
      title: L('4. Fast-fail gates', '4. Cổng loại sớm (fast-fail)'),
      paragraphs: [L('A dead payload must never queue. A failed biometric (BIOMETRIC_AUTH_FAILED), a high-risk device (FDS_HIGH_RISK_DEVICE) or bad debt on the bureau (CIC groups 3 to 5) is refused at the gate, before any human slot is used. These gates stay on even with STP switched off.', 'Hồ sơ “chết” không bao giờ được xếp hàng. Sinh trắc học thất bại (BIOMETRIC_AUTH_FAILED), thiết bị rủi ro cao (FDS_HIGH_RISK_DEVICE) hoặc nợ xấu trên CIC (nhóm 3 đến 5) bị từ chối ngay tại cổng, trước khi chiếm chỗ của bất kỳ nhân viên nào. Các cổng này vẫn bật kể cả khi tắt STP.')],
      advanced: [],
    },
    {
      id: 'stp-iso20022',
      title: L('5. ISO 20022: the message standard that makes STP possible', '5. ISO 20022: chuẩn thông điệp giúp STP khả thi'),
      paragraphs: [L('Structured XML messages (pacs.008 credit transfers, pacs.002 status, pacs.004 returns, camt.053 statements) carry every field a rule needs in its own tag: the debtor, the creditor’s BIC, the purpose code, the EndToEndId. Free-text fields are what breaks STP; structured data is what lets a machine decide.', 'Thông điệp XML có cấu trúc (pacs.008 chuyển tiền, pacs.002 trạng thái, pacs.004 hoàn trả, camt.053 sao kê) đặt mọi trường quy tắc cần vào thẻ riêng: người chuyển, mã BIC người nhận, mã mục đích, EndToEndId. Trường văn bản tự do làm hỏng STP; dữ liệu có cấu trúc giúp máy tự quyết định.')],
      advanced: [L('SWIFT’s cross-border coexistence period for MT and MX messages ended in November 2025; structured addresses are what sanctions screening matches on.', 'Giai đoạn song song MT và MX cho thanh toán xuyên biên giới của SWIFT kết thúc tháng 11/2025; địa chỉ có cấu trúc là dữ liệu sàng lọc cấm vận đối chiếu.')],
      level: 'advanced',
    },
  ] satisfies readonly StpSection[],
} as const;
