/**
 * The Knowledge Base's AML compliance article: the three stages of money laundering, the three fraud patterns the desk
 * reviews, the legal duties (no tipping-off, the EDD SLA, the SAR to the FIU), customer due diligence, and terrorist
 * financing. Each section has its plain prose, its Advanced notes, and optionally a comparison table and a golden rule.
 * The desk's penalty and reward matrix is built from the engine's own constants, so the article never drifts from the game.
 */

import type { Localized } from '../i18n/locale';
import { EDD_SLA_MIN, LEAK, REWARD, WRONG_FREEZE, WRONG_SAR } from '../sim/amlReview';
import { formatMoney } from '../sim/kpis';

const L = (en: string, vi: string): Localized<string> => ({ en, vi });

export interface KbTable {
  columns: readonly Localized<string>[];
  rows: readonly (readonly Localized<string>[])[];
}

export interface AmlSection {
  /** Every AML anchor starts with `aml`, which is how a link finds the AML tab. */
  id: `aml-${string}`;
  title: Localized<string>;
  paragraphs: readonly Localized<string>[];
  advanced: readonly Localized<string>[];
  table?: KbTable;
  /** The golden rule of the section, in a callout box. */
  rule?: Localized<string>;
  /** Shown only in the Advanced view (Chuyên sâu): the legal and technical foundations. */
  level?: 'advanced';
  /** A step-by-step SOP flow, drawn as a diagram. */
  flow?: readonly Localized<string>[];
  keywords: readonly string[];
}

/** The freeze/release matrix and the SAR outcomes: what each call costs or earns at the desk, from the engine's constants. */
export const AML_DECISION_MATRIX: KbTable = {
  columns: [L('What happened', 'Tình huống'), L('Fine (Dr 5510 / Cr 1510)', 'Tiền phạt (Nợ 5510 / Có 1510)'), L('Compliance points', 'Điểm tuân thủ'), L('Also', 'Kèm theo')],
  rows: [
    [L('1. Freeze + real laundering (valid freeze)', '1. Phong tỏa + Rửa tiền thật (phong tỏa đúng)'), L('—', '—'), L('0', '0'), L('Held safely in 2930, awaiting the SAR / FIU', 'Giữ an toàn ở TK 2930, chờ SAR / FIU')],
    [L('2. Freeze + legitimate customer (unjustified freeze)', '2. Phong tỏa + KH hợp pháp (phong tỏa sai)'), L(formatMoney(WRONG_FREEZE.fineCents), formatMoney(WRONG_FREEZE.fineCents)), L(`−${WRONG_FREEZE.points}`, `−${WRONG_FREEZE.points}`), L('At once; the customer at the branch, friction index +1', 'Ngay lập tức; khách hàng đến chi nhánh, chỉ số phiền lòng +1')],
    [L('3. Release + legitimate customer (valid release)', '3. Giải phóng + KH hợp pháp (giải phóng đúng)'), L('—', '—'), L('0', '0'), L('The account resumes normally', 'Tài khoản hoạt động bình thường')],
    [L('4. Release + real laundering (audit leak)', '4. Giải phóng + Rửa tiền thật (lọt tội phạm)'), L(formatMoney(LEAK.fineCents), formatMoney(LEAK.fineCents)), L(`−${LEAK.points}`, `−${LEAK.points}`), L('At once: the audit finds every one', 'Ngay lập tức: kiểm toán phát hiện mọi trường hợp')],
    [L('SAR on real laundering: the FIU’s directive 1–2 days later', 'SAR đúng đối tượng: chỉ thị của FIU sau 1–2 ngày'), L('—', '—'), L(`+${REWARD.validSar + REWARD.seizure}`, `+${REWARD.validSar + REWARD.seizure}`), L('Seized: Dr 2930 / Cr 2110; nothing at filing', 'Tịch thu: Nợ 2930 / Có 2110; không cộng điểm khi nộp')],
    [L('SAR on a legitimate customer: the FIU rejects it 1–2 days later', 'SAR sai đối tượng: FIU bác báo cáo sau 1–2 ngày'), L(formatMoney(WRONG_SAR.fineCents), formatMoney(WRONG_SAR.fineCents)), L(`−${WRONG_SAR.points}`, `−${WRONG_SAR.points}`), L('The frozen money returned: Dr 2930 / Cr 2011', 'Hoàn trả tiền phong tỏa: Nợ 2930 / Có 2011')],
  ],
};

export const AML_ARTICLE = {
  id: 'aml-compliance',
  title: L('AML compliance: how laundering works, how to spot it, and what the law requires', 'Tuân thủ AML: rửa tiền vận hành thế nào, nhận diện ra sao và pháp luật yêu cầu gì'),
  intro: L(
    'Money laundering turns the proceeds of crime into money that looks clean. A bank sits on the path that money must travel, so the law makes it a gatekeeper: know your customer, watch the flows, report what is suspicious, and never warn the suspect. This guide follows the AML Compliance Desk step by step.',
    'Rửa tiền là biến tiền do phạm tội mà có thành tiền trông như hợp pháp. Ngân hàng nằm trên con đường mà dòng tiền đó buộc phải đi qua, nên pháp luật giao cho ngân hàng vai trò người gác cổng: nhận biết khách hàng, giám sát dòng tiền, báo cáo giao dịch đáng ngờ và tuyệt đối không cảnh báo đối tượng. Bài này đi theo từng bước của Bàn tuân thủ AML.',
  ),
  sections: [
    {
      id: 'aml-concepts',
      title: L('0. What AML and CFT are, with real-life examples', '0. Rửa tiền (AML) và Tài trợ khủng bố (CFT) là gì: ví dụ thực tế'),
      paragraphs: [
        L(
          'Money laundering (AML is the fight against it) makes criminal money look clean. Example: a fraud ring collects $50,000 from victims, pays it in small amounts into dozens of student accounts, moves it around, and finally buys a car in a relative’s name. On paper the car looks like an ordinary purchase.',
          'Rửa tiền (AML là công tác phòng, chống rửa tiền) là làm cho tiền phạm tội trông như tiền sạch. Ví dụ: một nhóm lừa đảo thu $50,000 từ nạn nhân, nộp nhỏ lẻ vào hàng chục tài khoản sinh viên, chuyển qua lại nhiều lần, rồi mua một chiếc ô tô đứng tên người thân. Trên giấy tờ, chiếc xe trông như một giao dịch mua bán bình thường.',
        ),
        L(
          'Terrorist financing (CFT is the fight against it) runs the other way: the money is often clean (a salary, a donation) but it ends up paying for terrorism. Example: small monthly transfers from several people to the same foreign account flagged on a sanctions list.',
          'Tài trợ khủng bố (CFT là công tác chống tài trợ khủng bố) đi theo chiều ngược lại: tiền thường là tiền sạch (tiền lương, tiền quyên góp) nhưng được dùng để tài trợ khủng bố. Ví dụ: nhiều người chuyển các khoản nhỏ hằng tháng tới cùng một tài khoản ở nước ngoài có tên trong danh sách cấm vận.',
        ),
        L(
          'A bank teller or analyst is the first line of defence: you do not need to prove a crime, only to notice what does not fit and follow the procedure.',
          'Giao dịch viên và chuyên viên ngân hàng là tuyến phòng thủ đầu tiên: bạn không cần chứng minh tội phạm, chỉ cần nhận ra điều bất thường và làm đúng quy trình.',
        ),
      ],
      advanced: [
        L(
          'AML asks “where did the money come from?”; CFT asks “where is it going?”. That is why the same desk screens both the source of funds (KYC, EDD) and the recipient (sanctions screening).',
          'AML hỏi “tiền từ đâu đến?”; CFT hỏi “tiền sẽ đi đâu?”. Vì vậy cùng một bộ phận vừa kiểm tra nguồn tiền (KYC, EDD) vừa sàng lọc người nhận (danh sách cấm vận).',
        ),
      ],
      rule: L('You do not have to prove the crime: notice, record, report.', 'Bạn không cần chứng minh tội phạm: nhận diện, ghi nhận, báo cáo.'),
      keywords: ['aml', 'cft', 'rua tien', 'tai tro khung bo', 'money laundering', 'terrorist financing', 'khai niem', 'vi du'],
    },
    {
      id: 'aml-stages',
      title: L('1. The 3 stages of money laundering', '1. 3 Giai đoạn Rửa tiền'),
      paragraphs: [
        L(
          'Laundering is a process, not one transaction. It usually runs in three stages, and a bank can meet the money at any of them.',
          'Rửa tiền là một quá trình chứ không phải một giao dịch đơn lẻ. Quá trình này thường gồm ba giai đoạn, và ngân hàng có thể gặp dòng tiền ở bất kỳ giai đoạn nào.',
        ),
        L(
          'Placement puts dirty cash into the financial system; layering hides where it came from behind many transfers; integration brings it back as apparently legitimate wealth. Placement is where the money is easiest to catch: once layered, the trail is cold.',
          'Tách tiền (Placement) đưa tiền mặt bẩn vào hệ thống tài chính; Xáo trộn (Layering) che giấu nguồn gốc bằng nhiều lớp chuyển tiền; Hợp pháp hóa (Integration) đưa tiền trở lại dưới dạng tài sản có vẻ hợp pháp. Tách tiền là giai đoạn dễ phát hiện nhất: khi đã qua nhiều lớp, dấu vết gần như mất hẳn.',
        ),
      ],
      advanced: [
        L(
          'Stages overlap in practice: a money mule account both places (cash deposits from strangers) and layers (forwarding at once). That is why the desk scores patterns, not single transactions: velocity, pass-through ratio and the fit with the customer’s profile.',
          'Trên thực tế các giai đoạn chồng lên nhau: một tài khoản money mule vừa tách tiền (nhận tiền từ người lạ) vừa xáo trộn (chuyển đi ngay). Vì vậy bàn AML chấm điểm theo mẫu hình chứ không theo từng giao dịch: tần suất, tỷ lệ tiền đi qua và mức độ phù hợp với hồ sơ khách hàng.',
        ),
        L(
          'Trade-based laundering hides layering inside invoices (over- or under-invoicing goods), which is why an import-export customer’s volume is judged against its documented trade, not against a retail norm.',
          'Rửa tiền qua thương mại giấu bước xáo trộn trong hóa đơn (khai khống hoặc khai thấp giá hàng hóa), vì vậy doanh số của khách hàng xuất nhập khẩu được so với hoạt động thương mại có chứng từ, không so với chuẩn của khách hàng cá nhân.',
        ),
      ],
      table: {
        columns: [L('Stage', 'Giai đoạn'), L('What happens', 'Diễn biến'), L('Typical example', 'Ví dụ điển hình'), L('What the desk sees', 'Dấu hiệu tại bàn AML')],
        rows: [
          [L('Placement', 'Tách tiền (Placement)'), L('Dirty cash enters the system', 'Tiền mặt bẩn đi vào hệ thống'), L('Many deposits just under the reporting line', 'Nhiều lần nộp tiền ngay dưới ngưỡng báo cáo'), L('Structuring alerts at the CDM and ATM', 'Cảnh báo chia nhỏ tại máy CDM và ATM')],
          [L('Layering', 'Xáo trộn (Layering)'), L('The origin is hidden behind transfers', 'Nguồn gốc bị che giấu sau nhiều lần chuyển', ), L('In from many senders, straight out to one', 'Nhận từ nhiều người, chuyển ngay cho một người'), L('Money-mule pass-through, velocity bursts', 'Tài khoản trung chuyển, tần suất bất thường')],
          [L('Integration', 'Hợp pháp hóa (Integration)'), L('The money returns as “clean” wealth', 'Tiền quay lại dưới dạng tài sản “sạch”'), L('Property, a business, fake invoices', 'Bất động sản, doanh nghiệp, hóa đơn khống'), L('Documents that do not add up in EDD', 'Chứng từ EDD không khớp')],
        ],
      },
      rule: L('Catch it at placement: the further the money travels, the harder it is to follow.', 'Chặn từ giai đoạn tách tiền: dòng tiền càng đi xa càng khó lần theo.'),
      keywords: ['placement', 'layering', 'integration', 'tach tien', 'xao tron', 'hop phap hoa', 'stages', 'giai doan rua tien'],
    },
    {
      id: 'aml-typologies',
      title: L('2. The 3 AML fraud patterns', '2. 3 Mẫu hình Gian lận AML'),
      paragraphs: [
        L(
          'The desk reviews three classic patterns every day. Each has a legitimate lookalike, so a red flag is a question, not a verdict: the KYC context card is what answers it.',
          'Mỗi ngày bàn AML xem xét ba mẫu hình kinh điển. Mỗi mẫu hình đều có một trường hợp hợp pháp trông giống hệt, nên dấu hiệu đỏ là câu hỏi chứ chưa phải kết luận: thẻ Hồ sơ KYC chính là nơi trả lời.',
        ),
        L(
          'Compare the money with the customer: a student’s account opened 5 days ago that takes in $10,500 in an hour is extreme; the same sum through an import-export firm trading $150,000 a month is ordinary.',
          'Hãy so dòng tiền với khách hàng: tài khoản sinh viên mới mở 5 ngày nhận $10,500 trong một giờ là cực kỳ bất thường; cùng số tiền đó qua một doanh nghiệp XNK có doanh số $150,000 mỗi tháng là bình thường.',
        ),
      ],
      advanced: [
        L(
          'Structuring is an offence in itself in many jurisdictions, even when the cash is clean: splitting deposits to avoid a report defeats the report.',
          'Ở nhiều quốc gia, chia nhỏ giao dịch tự nó đã là hành vi vi phạm, kể cả khi tiền mặt sạch: chia nhỏ để né báo cáo là làm vô hiệu nghĩa vụ báo cáo.',
        ),
        L(
          'Mules are often recruited through fake job offers and may not know they launder. The account is still a laundering channel: report it; do not warn the holder.',
          'Người làm money mule thường bị dụ qua các lời mời việc làm giả và có thể không biết mình đang rửa tiền. Tài khoản vẫn là kênh rửa tiền: hãy báo cáo, không cảnh báo chủ tài khoản.',
        ),
        L(
          'A synthetic identity mixes real and invented data (a real ID number with another face and address). Chip-ID reading and face matching defeat most of them, which is why basic eKYC alone is a risk factor.',
          'Danh tính tổng hợp trộn dữ liệu thật và giả (số giấy tờ thật với khuôn mặt, địa chỉ khác). Đọc chip CCCD và đối chiếu khuôn mặt loại bỏ phần lớn trường hợp này, nên chỉ có eKYC cơ bản tự nó đã là yếu tố rủi ro.',
        ),
      ],
      table: {
        columns: [L('Pattern', 'Mẫu hình'), L('Red flags', 'Dấu hiệu đỏ'), L('Legitimate lookalike', 'Trường hợp hợp pháp trông giống'), L('Usual right call', 'Hướng xử lý thường đúng')],
        rows: [
          [L('Structuring / smurfing', 'Chia nhỏ giao dịch (Structuring/Smurfing)'), L('Repeated cash just under the line, minutes apart', 'Nộp tiền mặt liên tục ngay dưới ngưỡng, cách nhau vài phút'), L('A market stall banking the day’s takings', 'Tiểu thương nộp doanh thu trong ngày'), L('Thin profile: SAR. Steady trader: EDD or close', 'Hồ sơ mỏng: SAR. Tiểu thương lâu năm: EDD hoặc đóng')],
          [L('Money mule account', 'Tài khoản trung chuyển (Money Mule)'), L('Many unknown senders, all forwarded within the hour', 'Nhiều người gửi lạ, chuyển đi hết trong vòng một giờ'), L('A group-buy organiser collecting and paying a supplier', 'Người gom đơn mua chung thu tiền rồi trả nhà cung cấp'), L('New account, no history: SAR', 'Tài khoản mới, chưa có lịch sử: SAR')],
          [L('Synthetic identity', 'Danh tính giả (Synthetic ID)'), L('Day-old account, identity score mismatch, balance out at once', 'Tài khoản 1 ngày tuổi, điểm danh tính lệch, rút hết số dư ngay'), L('A newcomer moving their savings', 'Người mới chuyển đến chuyển khoản tiết kiệm'), L('Face + chip ID verified: EDD. Basic eKYC only: SAR', 'Đã xác minh chân dung & CCCD gắn chip: EDD. Chỉ eKYC cơ bản: SAR')],
        ],
      },
      rule: L('A red flag is a question: compare the money with the customer (KYC) before you act.', 'Dấu hiệu đỏ là một câu hỏi: hãy so dòng tiền với hồ sơ khách hàng (KYC) trước khi hành động.'),
      keywords: ['structuring', 'smurfing', 'chia nho', 'money mule', 'tai khoan trung chuyen', 'synthetic identity', 'danh tinh gia', 'typology', 'mau hinh'],
    },
    {
      id: 'aml-redflags',
      title: L('2b. Red flags at a glance, and what to do', '2b. Nhận diện nhanh dấu hiệu đỏ và cách thao tác'),
      paragraphs: [
        L(
          'The most common red flags: cash just under a reporting line again and again; money in from many strangers and straight out; a brand-new account moving far more than its owner’s profile; a customer who is nervous, in a hurry, or asks how to avoid a report.',
          'Các dấu hiệu đỏ thường gặp: nộp tiền mặt sát dưới ngưỡng báo cáo nhiều lần; nhận tiền từ nhiều người lạ rồi chuyển đi ngay; tài khoản mới mở nhưng dòng tiền vượt xa hồ sơ chủ tài khoản; khách hàng lo lắng, vội vàng, hoặc hỏi cách tránh bị báo cáo.',
        ),
        L(
          'At the AML desk every case follows the same flow. Read it as a checklist: never skip the KYC step, and never tell the customer about a report.',
          'Tại Bàn AML mọi ca đều đi theo cùng một quy trình. Hãy coi đây là danh sách kiểm tra: không bỏ qua bước KYC, và không bao giờ cho khách hàng biết về báo cáo.',
        ),
      ],
      advanced: [
        L(
          'The four paths map onto the freeze/release matrix: a hold on real laundering is right, on a legitimate customer it is a fined friction; a release is right for a legitimate customer and a fined leak on laundering. EDD buys time when the evidence is mixed; a SAR is judged by the FIU later.',
          'Bốn hướng xử lý tương ứng với ma trận phong tỏa / giải phóng: phong tỏa ca rửa tiền thật là đúng, phong tỏa khách hàng hợp pháp là gây phiền hà và bị phạt; giải phóng đúng với khách hàng hợp pháp và bị phạt vì lọt tội phạm nếu là rửa tiền. EDD giúp có thêm thời gian khi bằng chứng chưa rõ; SAR được FIU đánh giá sau.',
        ),
      ],
      flow: [
        L('Alert: read the red flags', 'Cảnh báo: đọc các dấu hiệu đỏ'),
        L('KYC: compare the money with the profile', 'KYC: so dòng tiền với hồ sơ khách hàng'),
        L('Mixed evidence → EDD (24h)', 'Bằng chứng chưa rõ → EDD (24 giờ)'),
        L('Clear suspicion → SAR, silent freeze', 'Nghi ngờ rõ ràng → SAR, phong tỏa ngầm'),
        L('Fits the profile → close, release', 'Phù hợp hồ sơ → đóng ca, giải phóng'),
        L('Never tell the customer', 'Tuyệt đối không tiết lộ cho khách'),
      ],
      rule: L('Evidence first, then the path: KYC before any freeze or release.', 'Bằng chứng trước, quyết định sau: luôn KYC trước khi phong tỏa hay giải phóng.'),
      keywords: ['red flag', 'dau hieu do', 'dau hieu bat thuong', 'sop', 'quy trinh', 'thao tac', 'checklist'],
    },
    {
      id: 'aml-rules',
      title: L('3. Legal rules & compliance', '3. Quy định Pháp lý & Tuân thủ'),
      paragraphs: [
        L(
          'No tipping-off. Once a report is being made or has been made, telling the customer (or anyone outside the bank’s compliance chain) about it is a criminal offence. The SAR freeze is silent for that reason: the customer sees a delay, never the reason.',
          'Cấm tiết lộ thông tin (Tipping-off). Khi đang hoặc đã lập báo cáo, việc cho khách hàng (hay bất kỳ ai ngoài bộ phận tuân thủ) biết về báo cáo là vi phạm pháp luật hình sự. Vì vậy lệnh phong tỏa kèm SAR là phong tỏa ngầm: khách hàng chỉ thấy giao dịch bị chậm, không bao giờ biết lý do.',
        ),
        L(
          `EDD with a ${EDD_SLA_MIN / 60}-hour SLA. When the evidence is mixed, the desk holds the payment (not the whole account) and asks for proof of funds. The SLA runs on the bank’s clock and carries across the night; with no proof when it runs out, the payment is refused and the money frozen silently.`,
          `EDD với SLA ${EDD_SLA_MIN / 60} giờ. Khi bằng chứng chưa rõ, bàn AML giữ giao dịch (không khóa cả tài khoản) và yêu cầu chứng minh nguồn tiền. SLA tính theo đồng hồ ngân hàng và kéo dài qua đêm; hết hạn mà không có chứng từ thì giao dịch bị từ chối và tiền bị phong tỏa ngầm.`,
        ),
        L(
          'The duty to report a SAR to the FIU. A reasonable suspicion is enough: the bank does not have to prove the crime. The report goes to the Financial Intelligence Unit, which investigates and may order the money seized.',
          'Nghĩa vụ báo cáo SAR lên FIU. Chỉ cần có cơ sở nghi ngờ hợp lý: ngân hàng không phải chứng minh hành vi phạm tội. Báo cáo được gửi Cục Phòng, chống rửa tiền (FIU), nơi điều tra và có thể ra chỉ thị tịch thu tiền.',
        ),
      ],
      advanced: [
        L(
          'In Viet Nam the framework is the Law on Anti-Money Laundering No. 14/2022/QH15 (in force since 1 March 2023), guided by Decree 19/2023/ND-CP and Circular 09/2023/TT-NHNN. Suspicious transactions go to the AML Department of the State Bank; large cash transactions are reported from VND 400 million (Decision 11/2023/QD-TTg); records are kept for at least 5 years.',
          'Tại Việt Nam khung pháp lý là Luật Phòng, chống rửa tiền số 14/2022/QH15 (hiệu lực từ 01/03/2023), hướng dẫn bởi Nghị định 19/2023/NĐ-CP và Thông tư 09/2023/TT-NHNN. Giao dịch đáng ngờ được báo cáo Cục Phòng, chống rửa tiền thuộc Ngân hàng Nhà nước; giao dịch tiền mặt giá trị lớn phải báo cáo từ 400 triệu đồng (Quyết định 11/2023/QĐ-TTg); hồ sơ lưu trữ tối thiểu 5 năm.',
        ),
        L(
          'Internationally the FATF Recommendations set the standard: R.10 (customer due diligence), R.11 (record keeping), R.20 (reporting suspicious transactions) and R.21 (tipping-off and confidentiality). Reporting in good faith is protected: a bank is not liable to the customer for a SAR that turns out unfounded.',
          'Trên bình diện quốc tế, các Khuyến nghị của FATF là chuẩn mực: R.10 (thẩm định khách hàng), R.11 (lưu giữ hồ sơ), R.20 (báo cáo giao dịch đáng ngờ) và R.21 (cấm tiết lộ và bảo mật). Báo cáo với thiện chí được pháp luật bảo vệ: ngân hàng không chịu trách nhiệm với khách hàng về một SAR mà sau đó được xác định là không có căn cứ.',
        ),
        L(
          'The simulator’s numbers (the $50,000, $20,000 and $30,000 fines and the points) are teaching values, not legal penalties: they make each trade-off felt.',
          'Các con số trong mô phỏng (mức phạt $50,000, $20,000 và $30,000 và điểm tuân thủ) là giá trị phục vụ học tập, không phải mức phạt theo luật: chúng giúp người học cảm nhận rõ từng đánh đổi.',
        ),
      ],
      table: AML_DECISION_MATRIX,
      rule: L('When in doubt, report; never tell the customer.', 'Khi nghi ngờ, hãy báo cáo; tuyệt đối không cho khách hàng biết.'),
      keywords: ['tipping off', 'tiet lo thong tin', 'edd', 'sla', 'sar', 'str', 'fiu', 'cuc phong chong rua tien', 'bao cao giao dich dang ngo', 'penalty', 'phat'],
    },
    {
      id: 'aml-cdd',
      title: L('4. Know your customer: CDD, EDD and PEPs', '4. Nhận biết khách hàng: CDD, EDD và PEP'),
      paragraphs: [
        L(
          'Customer due diligence (CDD) answers three questions at onboarding and keeps answering them: who the customer is, who really owns or controls the money (the beneficial owner), and what the account is for. That answer is the baseline every alert is judged against.',
          'Thẩm định khách hàng (CDD) trả lời ba câu hỏi khi mở tài khoản và tiếp tục cập nhật trong suốt quan hệ: khách hàng là ai, ai thực sự sở hữu hay kiểm soát dòng tiền (chủ sở hữu hưởng lợi), và tài khoản dùng vào mục đích gì. Câu trả lời đó là chuẩn để đánh giá mọi cảnh báo.',
        ),
        L(
          'The checks scale with the risk: simplified for low-risk products, standard for most customers, and enhanced (EDD) for high-risk ones: unusual flows, high-risk countries, or politically exposed persons (PEPs).',
          'Mức độ thẩm định tăng theo rủi ro: rút gọn với sản phẩm rủi ro thấp, tiêu chuẩn với đa số khách hàng, và tăng cường (EDD) với khách hàng rủi ro cao: dòng tiền bất thường, quốc gia rủi ro cao, hoặc người có ảnh hưởng chính trị (PEP).',
        ),
      ],
      advanced: [
        L(
          'A PEP (FATF R.12) needs senior management approval to onboard, a check of the source of wealth and funds, and ongoing enhanced monitoring. A PEP is not a suspect: the status raises the scrutiny, not the verdict.',
          'Khách hàng PEP (Khuyến nghị 12 của FATF) cần lãnh đạo cấp cao phê duyệt khi thiết lập quan hệ, xác minh nguồn gốc tài sản và nguồn tiền, và giám sát tăng cường liên tục. PEP không phải là nghi phạm: tư cách PEP nâng mức kiểm tra, không quyết định kết luận.',
        ),
        L(
          'A risk-based approach (FATF R.1) spends the most effort where the risk is highest. It is also why over-freezing is penalised: friction on legitimate customers is a real cost, and it buries the true positives in noise.',
          'Tiếp cận dựa trên rủi ro (Khuyến nghị 1 của FATF) dồn nhiều công sức nhất vào nơi rủi ro cao nhất. Đó cũng là lý do phong tỏa tràn lan bị phạt: gây phiền hà cho khách hàng hợp pháp là chi phí thật, và làm các ca đúng bị chìm trong nhiễu.',
        ),
      ],
      table: {
        columns: [L('Level', 'Mức độ'), L('When', 'Khi nào'), L('What it checks', 'Kiểm tra gì')],
        rows: [
          [L('Simplified (SDD)', 'Rút gọn (SDD)'), L('Low-risk products and customers', 'Sản phẩm, khách hàng rủi ro thấp'), L('Identity, with lighter monitoring', 'Danh tính, giám sát nhẹ hơn')],
          [L('Standard (CDD)', 'Tiêu chuẩn (CDD)'), L('Every customer by default', 'Mặc định với mọi khách hàng'), L('Identity, beneficial owner, purpose of the account', 'Danh tính, chủ sở hữu hưởng lợi, mục đích tài khoản')],
          [L('Enhanced (EDD)', 'Tăng cường (EDD)'), L('High risk: unusual flows, PEPs, high-risk countries', 'Rủi ro cao: dòng tiền bất thường, PEP, quốc gia rủi ro cao'), L('Source of funds and wealth, with documents; tighter monitoring', 'Nguồn tiền và nguồn gốc tài sản, có chứng từ; giám sát chặt hơn')],
        ],
      },
      rule: L('Know the customer first: an alert only means something against the profile.', 'Hiểu khách hàng trước: cảnh báo chỉ có ý nghĩa khi đặt cạnh hồ sơ.'),
      keywords: ['kyc', 'cdd', 'edd', 'sdd', 'pep', 'beneficial owner', 'chu so huu huong loi', 'tham dinh khach hang', 'risk based approach'],
    },
    {
      id: 'aml-cft',
      title: L('5. Terrorist financing & sanctions (CFT)', '5. Tài trợ khủng bố & cấm vận (CFT)'),
      paragraphs: [
        L(
          'Terrorist financing runs the other way: often clean money (salaries, donations, small business income) going to a criminal purpose. The sums are small, so thresholds rarely catch it; who receives the money matters more than how much.',
          'Tài trợ khủng bố đi theo chiều ngược lại: thường là tiền sạch (lương, quyên góp, thu nhập kinh doanh nhỏ) đi tới mục đích phạm tội. Số tiền nhỏ nên các ngưỡng hiếm khi phát hiện được; người nhận tiền quan trọng hơn số tiền.',
        ),
        L(
          'That is why every party to a payment is screened against sanctions and terrorist lists, and a true match is frozen at once: no threshold, no EDD first.',
          'Vì vậy mọi bên trong một giao dịch đều được sàng lọc với danh sách cấm vận và danh sách khủng bố, và khi trùng khớp thật thì phong tỏa ngay lập tức: không cần ngưỡng, không cần EDD trước.',
        ),
      ],
      advanced: [
        L(
          'FATF R.6 requires targeted financial sanctions to be applied without delay. Screening produces many name matches; each is cleared or confirmed on the secondary identifiers (date of birth, nationality, ID number), never on the name alone.',
          'Khuyến nghị 6 của FATF yêu cầu áp dụng biện pháp trừng phạt tài chính có mục tiêu ngay lập tức. Việc sàng lọc tạo ra nhiều kết quả trùng tên; mỗi kết quả được loại trừ hoặc xác nhận dựa trên thông tin nhận dạng phụ (ngày sinh, quốc tịch, số giấy tờ), không bao giờ chỉ dựa vào tên.',
        ),
      ],
      rule: L('For sanctions, the name of the recipient outweighs the size of the payment.', 'Với cấm vận, danh tính người nhận quan trọng hơn quy mô giao dịch.'),
      keywords: ['cft', 'terrorist financing', 'tai tro khung bo', 'sanctions', 'cam van', 'screening', 'sang loc'],
    },
    {
      id: 'aml-legal',
      level: 'advanced',
      title: L('6. Legal and technical foundations (Viet Nam)', '6. Nền tảng pháp lý và kỹ thuật (Việt Nam)'),
      paragraphs: [
        L(
          'The legal framework: the Law on Anti-Money Laundering No. 14/2022/QH15 (in force 1 March 2023), Decree 19/2023/ND-CP detailing it, and Circular 09/2023/TT-NHNN for banks. Reporting entities must run internal AML rules, identify and verify customers, keep records for at least 5 years, and report to the AML Department of the State Bank.',
          'Khung pháp lý: Luật Phòng, chống rửa tiền số 14/2022/QH15 (hiệu lực 01/03/2023), Nghị định 19/2023/NĐ-CP quy định chi tiết, và Thông tư 09/2023/TT-NHNN áp dụng cho ngân hàng. Đối tượng báo cáo phải ban hành quy định nội bộ về PCRT, nhận biết và xác minh khách hàng, lưu giữ hồ sơ tối thiểu 5 năm, và báo cáo Cục Phòng, chống rửa tiền thuộc Ngân hàng Nhà nước.',
        ),
        L(
          'Large-value transaction reporting (CTR): cash transactions of VND 400,000,000 or more in a day (Decision 11/2023/QD-TTg) are reported whether or not they are suspicious. Suspicious transactions (STR/SAR) are reported regardless of amount, as soon as there is a reasonable ground for suspicion.',
          'Báo cáo giao dịch giá trị lớn (CTR): giao dịch tiền mặt từ 400.000.000 đồng trở lên trong một ngày (Quyết định 11/2023/QĐ-TTg) phải báo cáo dù có đáng ngờ hay không. Giao dịch đáng ngờ (STR/SAR) được báo cáo không phụ thuộc số tiền, ngay khi có cơ sở hợp lý để nghi ngờ.',
        ),
        L(
          'Tipping-off: the AML law forbids disclosing a report, or the information behind it, to the customer or anyone not entitled to know. A breach is sanctioned administratively and, where it helps a criminal escape or hide proceeds, can lead to criminal liability under the Penal Code (for example as complicity in money laundering). Elsewhere it is an offence in itself, such as section 333A of the UK Proceeds of Crime Act 2002.',
          'Tiết lộ thông tin (tipping-off): Luật PCRT cấm tiết lộ việc báo cáo, hoặc thông tin liên quan, cho khách hàng hay người không có thẩm quyền. Vi phạm bị xử phạt hành chính và, nếu giúp tội phạm trốn tránh hoặc che giấu tài sản, có thể bị truy cứu trách nhiệm hình sự theo Bộ luật Hình sự (ví dụ với vai trò đồng phạm rửa tiền). Ở một số quốc gia đây là tội danh độc lập, như Điều 333A Luật Tiền thu được từ tội phạm 2002 của Vương quốc Anh.',
        ),
        L(
          'CFT and sanctions: every party is screened against the UN Security Council lists and the lists published in Viet Nam (by the Ministry of Public Security and the State Bank). A confirmed match is frozen without delay and reported. PEPs (domestic and foreign politically exposed persons and their close associates) need senior approval, a source-of-wealth check and enhanced ongoing monitoring.',
          'CFT và cấm vận: mọi bên liên quan được sàng lọc với danh sách của Hội đồng Bảo an Liên hợp quốc và các danh sách công bố tại Việt Nam (Bộ Công an, Ngân hàng Nhà nước). Trùng khớp đã xác nhận phải phong tỏa ngay và báo cáo. PEP (người có ảnh hưởng chính trị trong nước, nước ngoài và người có liên quan) cần lãnh đạo cấp cao phê duyệt, xác minh nguồn gốc tài sản và giám sát tăng cường liên tục.',
        ),
        L(
          'The case workflow and its money: CDD at onboarding; EDD with a 24-hour SLA when a case is mixed (the payment parked in 2912); a SAR to the FIU with a silent freeze (2930); the FIU’s directive either seizes the money for the state (Dr 2930 / Cr 2110) or rejects the report and the money goes back (Dr 2930 / Cr 2011). Nothing is deleted: every step is a journal and an audit row.',
          'Quy trình xử lý và dòng tiền: CDD khi mở tài khoản; EDD với SLA 24 giờ khi chưa rõ (tiền treo tại TK 2912); SAR gửi FIU kèm phong tỏa ngầm (TK 2930); chỉ thị của FIU hoặc tịch thu tiền nộp Nhà nước (Nợ 2930 / Có 2110), hoặc bác báo cáo và hoàn trả tiền (Nợ 2930 / Có 2011). Không có gì bị xóa: mỗi bước là một bút toán và một dòng nhật ký kiểm toán.',
        ),
      ],
      advanced: [],
      flow: [
        L('CDD at onboarding', 'CDD khi mở tài khoản'),
        L('Monitoring alert', 'Cảnh báo giám sát'),
        L('EDD · 24h SLA · 2912', 'EDD · SLA 24 giờ · TK 2912'),
        L('SAR → FIU · silent freeze 2930', 'SAR → FIU · phong tỏa ngầm TK 2930'),
        L('FIU directive: seize 2930 → 2110', 'Chỉ thị FIU: tịch thu 2930 → 2110'),
      ],
      rule: L('Report on suspicion, keep it confidential, keep every record for 5 years.', 'Báo cáo khi có nghi ngờ, giữ bí mật tuyệt đối, lưu hồ sơ tối thiểu 5 năm.'),
      keywords: ['luat phong chong rua tien', '14/2022', '19/2023', '09/2023', 'ctr', '400 trieu', 'tipping off', 'trach nhiem hinh su', 'sanctions', 'pep', 'tich thu', 'phong toa'],
    },
  ] satisfies AmlSection[],
};
