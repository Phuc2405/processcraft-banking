/**
 * The regulatory registry: every law, decree, circular, decision and standard the project cites, in one place, with its effective
 * date, what it says in plain words, and the demo scenarios that show it at work. The Knowledge Base's "Circulars & Decrees" tab
 * renders it and searches it (searchRegistry, below). No React here: the tab, the search index and the tests read the same list.
 *
 * Summaries are for learning. A date given as a year only means the exact day was not checked for this training sandbox; always
 * confirm the current text and status of a document at its official source before relying on it.
 */

import type { Localized } from '../i18n/localeCore';
import type { DemoActionId } from '../sim/demoActions';

const L = (en: string, vi: string): Localized<string> => ({ en, vi });
/** A document number: the official Vietnamese spelling, and the same in plain letters for English ("NĐ-CP" is "ND-CP"). */
const N = (official: string): Localized<string> => ({ en: official.replace(/Đ/g, 'D').replace(/đ/g, 'd'), vi: official });
/** Search words: the English side keeps the ones written in plain letters, the Vietnamese side all of them. */
const T = (...words: string[]): Localized<string> => ({ en: words.filter((w) => !/[^\x00-\x7F]/.test(w)).join(' '), vi: words.join(' ') });

export type RegKind = 'law' | 'decree' | 'circular' | 'decision' | 'standard' | 'basel' | 'accounting';
export type Jurisdiction = 'VN' | 'INTL' | 'AU';

export interface RegulatorInfo {
  id: string;
  name: Localized<string>;
  short: string;
  jurisdiction: Jurisdiction;
  role: Localized<string>;
  website: string;
}

export interface RegDocument {
  id: string;
  kind: RegKind;
  jurisdiction: Jurisdiction;
  /** The document's number as it is cited: "18/2024/TT-NHNN", "IFRS 9" (the Vietnamese spelling, and plain letters for English). */
  number: Localized<string>;
  title: Localized<string>;
  /** Who issued it (an id of REGULATORS). */
  issuer: string;
  /** The authority that administers and enforces it, when that is not the issuer (an Act of Parliament is enforced by a regulator). */
  regulator?: string;
  /** dd/mm/yyyy, or a year when the exact day is not given. */
  issued?: string;
  effective: string;
  /** What it replaced, or what has since amended it, in a few words. */
  status?: Localized<string>;
  summary: Localized<string>;
  /** The rules of it the demos actually use. */
  keyPoints: readonly Localized<string>[];
  /** The demo buttons that show it at work. */
  scenarios: readonly DemoActionId[];
  /** Extra words people search with: abbreviations, the topic in both languages. */
  tags: Localized<string>;
}

export const REGULATORS: readonly RegulatorInfo[] = [
  { id: 'NA', short: 'QH', jurisdiction: 'VN', name: L('National Assembly of Vietnam', 'Quốc hội Việt Nam'), role: L('Passes the laws: the Law on Credit Institutions, the AML Law, the Civil Code.', 'Ban hành luật: Luật Các tổ chức tín dụng, Luật Phòng, chống rửa tiền, Bộ luật Dân sự.'), website: 'https://quochoi.vn' },
  { id: 'GOV', short: 'CP', jurisdiction: 'VN', name: L('Government of Vietnam', 'Chính phủ Việt Nam'), role: L('Issues decrees that detail the laws.', 'Ban hành nghị định hướng dẫn chi tiết luật.'), website: 'https://chinhphu.vn' },
  { id: 'PM', short: 'TTg', jurisdiction: 'VN', name: L('Prime Minister of Vietnam', 'Thủ tướng Chính phủ Việt Nam'), role: L('Issues decisions, such as the large-value reporting threshold.', 'Ban hành quyết định, ví dụ mức giao dịch giá trị lớn phải báo cáo.'), website: 'https://chinhphu.vn' },
  { id: 'SBV', short: 'NHNN', jurisdiction: 'VN', name: L('State Bank of Vietnam', 'Ngân hàng Nhà nước Việt Nam'), role: L('The central bank and banking supervisor: issues circulars on cards, accounts, lending, deposits, classification and payments; issues the currency.', 'Ngân hàng trung ương và cơ quan giám sát ngân hàng: ban hành thông tư về thẻ, tài khoản, cho vay, tiền gửi, phân loại nợ và thanh toán; phát hành tiền.'), website: 'https://sbv.gov.vn' },
  { id: 'CIC', short: 'CIC', jurisdiction: 'VN', name: L('National Credit Information Centre', 'Trung tâm Thông tin tín dụng Quốc gia Việt Nam'), role: L('The credit bureau: every bank reports its loans and debt groups, and checks an applicant’s history before lending.', 'Văn phòng thông tin tín dụng: mọi ngân hàng báo cáo dư nợ và nhóm nợ, và tra cứu lịch sử của khách trước khi cho vay.'), website: 'https://cic.gov.vn' },
  { id: 'NAPAS', short: 'NAPAS', jurisdiction: 'VN', name: L('National Payment Corporation of Vietnam', 'Công ty Cổ phần Thanh toán Quốc gia Việt Nam'), role: L('The domestic switch: ATM and card switching, Napas247 instant transfers, VietQR.', 'Chuyển mạch trong nước: chuyển mạch ATM và thẻ, chuyển tiền nhanh Napas247, VietQR.'), website: 'https://napas.com.vn' },
  { id: 'BCBS', short: 'BCBS', jurisdiction: 'INTL', name: L('Basel Committee on Banking Supervision', 'Ủy ban Basel về Giám sát Ngân hàng'), role: L('Sets the global prudential standards for banks (Basel II, Basel III, liquidity monitoring), hosted by the BIS.', 'Ban hành chuẩn mực an toàn vốn toàn cầu cho ngân hàng (Basel II, Basel III, giám sát thanh khoản), trực thuộc BIS.'), website: 'https://www.bis.org/bcbs' },
  { id: 'IASB', short: 'IASB', jurisdiction: 'INTL', name: L('International Accounting Standards Board', 'Hội đồng Chuẩn mực Kế toán Quốc tế'), role: L('Issues the IFRS accounting standards (IFRS 9, IFRS 15).', 'Ban hành chuẩn mực báo cáo tài chính quốc tế IFRS (IFRS 9, IFRS 15).'), website: 'https://www.ifrs.org' },
  { id: 'FATF', short: 'FATF', jurisdiction: 'INTL', name: L('Financial Action Task Force', 'Lực lượng đặc nhiệm tài chính về chống rửa tiền'), role: L('Sets the international AML/CFT standard (the 40 Recommendations) and lists high-risk jurisdictions.', 'Ban hành chuẩn mực quốc tế về chống rửa tiền và tài trợ khủng bố (40 Khuyến nghị), công bố danh sách quốc gia rủi ro cao.'), website: 'https://www.fatf-gafi.org' },
  { id: 'ISO', short: 'ISO', jurisdiction: 'INTL', name: L('International Organization for Standardization', 'Tổ chức Tiêu chuẩn hóa Quốc tế'), role: L('Publishes the message standards payments speak: ISO 8583 for cards, ISO 20022 for transfers.', 'Ban hành chuẩn thông điệp thanh toán: ISO 8583 cho thẻ, ISO 20022 cho chuyển tiền.'), website: 'https://www.iso.org' },
  { id: 'SWIFT', short: 'SWIFT', jurisdiction: 'INTL', name: L('SWIFT', 'Hiệp hội Viễn thông Tài chính Liên ngân hàng Toàn cầu (SWIFT)'), role: L('Runs the cross-border messaging network and its ISO 20022 (CBPR+) usage rules.', 'Vận hành mạng điện thanh toán quốc tế và quy tắc sử dụng ISO 20022 (CBPR+).'), website: 'https://www.swift.com' },
  { id: 'EMVCO', short: 'EMVCo', jurisdiction: 'INTL', name: L('EMVCo', 'EMVCo'), role: L('Sets the chip, QR and 3-D Secure specifications for card payments.', 'Ban hành đặc tả chip, mã QR và 3-D Secure cho thanh toán thẻ.'), website: 'https://www.emvco.com' },
  { id: 'PCI', short: 'PCI SSC', jurisdiction: 'INTL', name: L('PCI Security Standards Council', 'Hội đồng Tiêu chuẩn Bảo mật PCI'), role: L('Owns PCI DSS, the security standard for anyone who stores, processes or transmits card data.', 'Sở hữu PCI DSS, tiêu chuẩn bảo mật cho mọi đơn vị lưu trữ, xử lý hoặc truyền dữ liệu thẻ.'), website: 'https://www.pcisecuritystandards.org' },
  { id: 'AUSTRAC', short: 'AUSTRAC', jurisdiction: 'AU', name: L('Australian Transaction Reports and Analysis Centre', 'Trung tâm Báo cáo và Phân tích Giao dịch Úc'), role: L('Australia’s AML/CTF regulator and financial intelligence unit: threshold and suspicious matter reports.', 'Cơ quan quản lý AML/CTF và đơn vị tình báo tài chính của Úc: nhận báo cáo giao dịch vượt ngưỡng và giao dịch đáng ngờ.'), website: 'https://www.austrac.gov.au' },
  { id: 'APRA', short: 'APRA', jurisdiction: 'AU', name: L('Australian Prudential Regulation Authority', 'Cơ quan Quản lý An toàn Tài chính Úc'), role: L('The prudential supervisor of Australian banks (ADIs) under the Banking Act 1959: capital (APS 110), liquidity (APS 210), credit risk (APS 220), operational risk (CPS 230), information security (CPS 234).', 'Cơ quan giám sát an toàn của ngân hàng Úc (ADI) theo Luật Ngân hàng 1959: vốn (APS 110), thanh khoản (APS 210), rủi ro tín dụng (APS 220), rủi ro hoạt động (CPS 230), an toàn thông tin (CPS 234).'), website: 'https://www.apra.gov.au' },
  { id: 'ASIC', short: 'ASIC', jurisdiction: 'AU', name: L('Australian Securities and Investments Commission', 'Ủy ban Chứng khoán và Đầu tư Úc'), role: L('The conduct and consumer-credit regulator: the Corporations Act 2001 (financial services), the National Consumer Credit Protection Act 2009 (responsible lending, RG 209) and the ePayments Code.', 'Cơ quan quản lý hành vi kinh doanh và tín dụng tiêu dùng: Luật Doanh nghiệp 2001 (dịch vụ tài chính), Luật Bảo vệ tín dụng tiêu dùng quốc gia 2009 (cho vay có trách nhiệm, RG 209) và Bộ quy tắc ePayments.'), website: 'https://asic.gov.au' },
  { id: 'AFCA', short: 'AFCA', jurisdiction: 'AU', name: L('Australian Financial Complaints Authority', 'Cơ quan Giải quyết Khiếu nại Tài chính Úc'), role: L('The free, independent external dispute resolution scheme for retail banking complaints, disputed transactions and chargebacks, once the bank’s own process has run.', 'Cơ chế giải quyết tranh chấp bên ngoài, độc lập và miễn phí cho khiếu nại ngân hàng bán lẻ, giao dịch tranh chấp và hoàn tiền thẻ, sau khi quy trình nội bộ của ngân hàng đã kết thúc.'), website: 'https://www.afca.org.au' },
  { id: 'AU_PARL', short: 'Cth', jurisdiction: 'AU', name: L('Parliament of the Commonwealth of Australia', 'Nghị viện Liên bang Úc'), role: L('Passes the Commonwealth Acts (Banking Act 1959, Corporations Act 2001, NCCP Act 2009, AML/CTF Act 2006) that the regulators administer.', 'Thông qua các đạo luật Liên bang (Luật Ngân hàng 1959, Luật Doanh nghiệp 2001, Luật NCCP 2009, Luật AML/CTF 2006) do các cơ quan quản lý thực thi.'), website: 'https://www.aph.gov.au' },
  { id: 'AASB', short: 'AASB', jurisdiction: 'AU', name: L('Australian Accounting Standards Board', 'Hội đồng Chuẩn mực Kế toán Úc'), role: L('Issues the Australian equivalents of IFRS (AASB 9).', 'Ban hành chuẩn mực kế toán Úc tương đương IFRS (AASB 9).'), website: 'https://www.aasb.gov.au' },
];

export const regulatorById = (id: string): RegulatorInfo | undefined => REGULATORS.find((r) => r.id === id);

export const REG_DOCUMENTS: readonly RegDocument[] = [
  // Vietnam: laws
  {
    id: 'law-32-2024',
    kind: 'law',
    jurisdiction: 'VN',
    number: N('32/2024/QH15'),
    title: L('Law on Credit Institutions 2024', 'Luật Các tổ chức tín dụng 2024'),
    issuer: 'NA',
    issued: '18/01/2024',
    effective: '01/07/2024',
    status: L('Replaces the Law on Credit Institutions 2010.', 'Thay thế Luật Các tổ chức tín dụng 2010.'),
    summary: L('The framework law for banks: licensing, governance, permitted activities, lending limits, credit information and the handling of bad debt and collateral.', 'Luật khung cho ngân hàng: cấp phép, quản trị, hoạt động được phép, giới hạn cấp tín dụng, thông tin tín dụng, xử lý nợ xấu và tài sản bảo đảm.'),
    keyPoints: [L('Banks must check an applicant’s credit history before lending.', 'Ngân hàng phải thẩm định lịch sử tín dụng của khách trước khi cho vay.'), L('Collateral may be seized and sold to recover bad debt, under the conditions the law sets.', 'Tài sản bảo đảm được thu giữ, xử lý để thu hồi nợ xấu theo điều kiện luật định.')],
    scenarios: ['bnpl-approve-400', 'bnpl-decline-cic', 'collateral-lock', 'collateral-release', 'collateral-liquidate', 'collateral-shortfall'],
    tags: T('TCTD', 'credit institutions', 'luật ngân hàng', 'nợ xấu', 'bad debt', 'collateral', 'TSĐB'),
  },
  {
    id: 'law-14-2022',
    kind: 'law',
    jurisdiction: 'VN',
    number: N('14/2022/QH15'),
    title: L('Law on Anti-Money Laundering', 'Luật Phòng, chống rửa tiền'),
    issuer: 'NA',
    issued: '15/11/2022',
    effective: '01/03/2023',
    status: L('Replaces the AML Law of 2012.', 'Thay thế Luật Phòng, chống rửa tiền 2012.'),
    summary: L('Who must run AML controls and how: customer due diligence, the risk-based approach, reports of large-value and suspicious transactions, record keeping, and freezing assets of listed persons.', 'Đối tượng và cách thức phòng, chống rửa tiền: nhận biết khách hàng, tiếp cận dựa trên rủi ro, báo cáo giao dịch giá trị lớn và giao dịch đáng ngờ, lưu trữ hồ sơ, phong tỏa tài sản của người trong danh sách.'),
    keyPoints: [L('Report large-value transactions at or over the threshold the Prime Minister sets.', 'Báo cáo giao dịch giá trị lớn bằng hoặc vượt ngưỡng do Thủ tướng quy định.'), L('Report suspicious transactions (STR), such as deposits split to stay under the threshold.', 'Báo cáo giao dịch đáng ngờ (STR), ví dụ chia nhỏ khoản nộp để né ngưỡng.'), L('Screen customers and payments against the sanctions and watch lists, and hold a match.', 'Sàng lọc khách hàng và giao dịch với danh sách cấm vận, danh sách đen, và tạm giữ khi trùng khớp.')],
    scenarios: ['teller-12k', 'teller-smurf', 'swift-sanction', 'ekyc-open'],
    tags: T('AML', 'PCRT', 'rửa tiền', 'money laundering', 'STR', 'CTR', 'KYC', 'sanctions', 'cấm vận'),
  },
  {
    id: 'law-46-2010',
    kind: 'law',
    jurisdiction: 'VN',
    number: N('46/2010/QH12'),
    title: L('Law on the State Bank of Vietnam', 'Luật Ngân hàng Nhà nước Việt Nam'),
    issuer: 'NA',
    issued: '16/06/2010',
    effective: '01/01/2011',
    summary: L('The central bank’s mandate: monetary policy, banking supervision, the payment system, and the sole right to issue the currency.', 'Chức năng của ngân hàng trung ương: chính sách tiền tệ, thanh tra giám sát ngân hàng, hệ thống thanh toán, và độc quyền phát hành tiền.'),
    keyPoints: [L('The SBV alone issues the dong, so notes suspected to be counterfeit go to it for assessment, never back to the customer.', 'Chỉ NHNN phát hành tiền đồng, nên tiền nghi giả được chuyển NHNN giám định, không trả lại khách.')],
    scenarios: ['teller-counterfeit'],
    tags: T('NHNN', 'SBV', 'central bank', 'tiền giả', 'counterfeit', 'phát hành tiền'),
  },
  {
    id: 'code-91-2015',
    kind: 'law',
    jurisdiction: 'VN',
    number: N('91/2015/QH13'),
    title: L('Civil Code 2015', 'Bộ luật Dân sự 2015'),
    issuer: 'NA',
    issued: '24/11/2015',
    effective: '01/01/2017',
    summary: L('The general law of property and obligations: whoever receives money without a legal basis (a mistaken transfer) must return it.', 'Luật chung về tài sản và nghĩa vụ: người nhận được tiền không có căn cứ pháp luật (chuyển nhầm) phải hoàn trả.'),
    keyPoints: [L('The bank can ask for a mistaken transfer back but cannot take it from the beneficiary’s account without consent or a court order: if they refuse, the sender’s route is the courts.', 'Ngân hàng có thể đề nghị hoàn trả khoản chuyển nhầm nhưng không được tự trích tài khoản người nhận khi chưa có sự đồng ý hoặc quyết định của tòa: nếu họ từ chối, người chuyển phải khởi kiện.')],
    scenarios: ['claim-return', 'claim-rejected'],
    tags: T('dân sự', 'civil code', 'chuyển nhầm', 'mistaken transfer', 'hoàn trả', 'tra soát'),
  },
  // Vietnam: decrees and decisions
  {
    id: 'decree-19-2023',
    kind: 'decree',
    jurisdiction: 'VN',
    number: N('19/2023/NĐ-CP'),
    title: L('Decree detailing the Law on Anti-Money Laundering', 'Nghị định quy định chi tiết Luật Phòng, chống rửa tiền'),
    issuer: 'GOV',
    issued: '28/04/2023',
    effective: '15/06/2023',
    summary: L('The detail behind the AML Law: the national risk assessment, customer due diligence steps, suspicious-transaction signs and the reporting regime.', 'Chi tiết thi hành Luật PCRT: đánh giá rủi ro quốc gia, các bước nhận biết khách hàng, dấu hiệu giao dịch đáng ngờ và chế độ báo cáo.'),
    keyPoints: [L('Signs of suspicion include transactions split to avoid the reporting threshold.', 'Dấu hiệu đáng ngờ gồm giao dịch bị chia nhỏ để tránh ngưỡng báo cáo.')],
    scenarios: ['teller-smurf', 'swift-sanction'],
    tags: T('AML', 'PCRT', 'STR', 'smurfing', 'chia nhỏ'),
  },
  {
    id: 'decision-11-2023',
    kind: 'decision',
    jurisdiction: 'VN',
    number: N('11/2023/QĐ-TTg'),
    title: L('Decision on the large-value transaction reporting threshold', 'Quyết định về mức giá trị giao dịch phải báo cáo'),
    issuer: 'PM',
    issued: '27/04/2023',
    effective: '01/06/2023',
    summary: L('Sets the amount at which a transaction must be reported to the AML authority as large-value: 400 million VND or more in a day.', 'Quy định mức giao dịch giá trị lớn phải báo cáo: từ 400 triệu đồng trở lên trong một ngày.'),
    keyPoints: [L('The demo bank works in AUD with a $10,000 line, which plays the same role as the 400 million VND threshold.', 'Ngân hàng mô phỏng dùng AUD với ngưỡng $10,000, đóng vai trò tương tự ngưỡng 400 triệu đồng.')],
    scenarios: ['teller-12k', 'teller-smurf'],
    tags: T('CTR', 'large value', 'giá trị lớn', '400 triệu', 'threshold', 'ngưỡng'),
  },
  {
    id: 'decree-52-2024',
    kind: 'decree',
    jurisdiction: 'VN',
    number: N('52/2024/NĐ-CP'),
    title: L('Decree on non-cash payments', 'Nghị định về thanh toán không dùng tiền mặt'),
    issuer: 'GOV',
    issued: '15/05/2024',
    effective: '01/07/2024',
    status: L('Replaces Decree 101/2012/ND-CP and its amendments.', 'Thay thế Nghị định 101/2012/NĐ-CP và các văn bản sửa đổi.'),
    summary: L('The rules for payment services and payment accounts: transfers, direct debits (collection orders), payment instruments, clearing and settlement, and dispute handling.', 'Quy định về dịch vụ thanh toán và tài khoản thanh toán: chuyển tiền, ủy nhiệm thu, phương tiện thanh toán, bù trừ và quyết toán, xử lý tra soát.'),
    keyPoints: [L('A direct debit runs only under the payer’s authorisation, and only if the account can cover it.', 'Ủy nhiệm thu chỉ thực hiện khi có ủy quyền của người trả và tài khoản đủ số dư.'), L('An order that gets no answer is checked before it is retried, so a bill is never paid twice.', 'Lệnh không có phản hồi được tra soát trước khi thực hiện lại, để hóa đơn không bị thanh toán hai lần.')],
    scenarios: ['bill-electric-85', 'bill-nsf-51', 'bill-timeout-68', 'autopay-loan-250', 'autopay-nsf-250', 'qr-780', 'claim-return', 'claim-rejected'],
    tags: T('TTKDTM', 'non-cash', 'không dùng tiền mặt', 'ủy nhiệm thu', 'direct debit', 'bill pay', 'hóa đơn', 'tra soát'),
  },
  {
    id: 'decree-86-2024',
    kind: 'decree',
    jurisdiction: 'VN',
    number: N('86/2024/NĐ-CP'),
    title: L('Decree on provisioning and the use of provisions to handle risk', 'Nghị định quy định về trích lập dự phòng rủi ro và sử dụng dự phòng để xử lý rủi ro'),
    issuer: 'GOV',
    issued: '11/07/2024',
    effective: '11/07/2024',
    summary: L('How much a bank sets aside for each debt group, and how a fully provided loan is written off against the allowance while recovery goes on off the books.', 'Mức trích lập dự phòng theo từng nhóm nợ, và cách dùng dự phòng để xử lý khoản vay đã trích đủ trong khi vẫn theo dõi thu hồi ngoại bảng.'),
    keyPoints: [L('Specific provision rates by group: 0%, 5%, 20%, 50% and 100%, on the balance less eligible collateral.', 'Tỷ lệ dự phòng cụ thể theo nhóm: 0%, 5%, 20%, 50% và 100%, trên dư nợ trừ giá trị TSĐB được khấu trừ.'), L('A cured loan releases its provision back to profit.', 'Khoản vay đã được trả hết quá hạn được hoàn nhập dự phòng vào lợi nhuận.')],
    scenarios: ['risk-migrate-95dpd', 'risk-migrate-group5', 'risk-cure', 'collateral-liquidate', 'collateral-shortfall'],
    tags: T('dự phòng', 'provision', 'provisioning', 'write-off', 'xử lý rủi ro', 'nợ xấu'),
  },
  // Vietnam: SBV circulars
  {
    id: 'circ-17-2024',
    kind: 'circular',
    jurisdiction: 'VN',
    number: N('17/2024/TT-NHNN'),
    title: L('Circular on opening and using payment accounts', 'Thông tư quy định việc mở và sử dụng tài khoản thanh toán'),
    issuer: 'SBV',
    issued: '28/06/2024',
    effective: '01/07/2024',
    status: L('Replaces Circular 23/2014 and its amendments, including the eKYC rules of Circular 16/2020.', 'Thay thế Thông tư 23/2014 và các văn bản sửa đổi, gồm quy định eKYC của Thông tư 16/2020.'),
    summary: L('Who may open a payment account and how: face-to-face or by eKYC with chip-ID and biometric checks, the account holder’s duties, and when an account may be blocked or frozen.', 'Điều kiện và cách mở tài khoản thanh toán: tại quầy hoặc eKYC với đọc chip CCCD và đối chiếu sinh trắc học, nghĩa vụ của chủ tài khoản, và khi nào tài khoản bị phong tỏa, tạm khóa.'),
    keyPoints: [L('An online account needs the chip ID read and a live face matched to it.', 'Mở tài khoản trực tuyến cần đọc chip CCCD và khớp khuôn mặt người thật.'), L('A blocked or frozen account may not be debited, whatever its balance.', 'Tài khoản bị phong tỏa không được ghi nợ, dù số dư còn bao nhiêu.')],
    scenarios: ['ekyc-open', 'ekyc-deepfake', 'teller-frozen', 'autopay-loan-250', 'autopay-nsf-250'],
    tags: T('tài khoản thanh toán', 'payment account', 'eKYC', 'CCCD', 'sinh trắc học', 'biometric', 'phong tỏa', 'frozen'),
  },
  {
    id: 'circ-16-2020',
    kind: 'circular',
    jurisdiction: 'VN',
    number: N('16/2020/TT-NHNN'),
    title: L('Circular allowing payment accounts to be opened by eKYC', 'Thông tư cho phép mở tài khoản thanh toán bằng phương thức điện tử (eKYC)'),
    issuer: 'SBV',
    issued: '04/12/2020',
    effective: '05/03/2021',
    status: L('Superseded by Circular 17/2024/TT-NHNN.', 'Đã được thay thế bởi Thông tư 17/2024/TT-NHNN.'),
    summary: L('The first rules letting a customer open a payment account entirely online, with identity checked against their ID document and face.', 'Quy định đầu tiên cho phép khách mở tài khoản thanh toán hoàn toàn trực tuyến, đối chiếu giấy tờ tùy thân và khuôn mặt.'),
    keyPoints: [L('Liveness detection must stop a photo or replayed video standing in for the customer.', 'Kiểm tra người thật phải ngăn ảnh chụp hoặc video phát lại thay cho khách.')],
    scenarios: ['ekyc-open', 'ekyc-deepfake'],
    tags: T('eKYC', 'liveness', 'deepfake', 'mở tài khoản', 'onboarding'),
  },
  {
    id: 'circ-18-2024',
    kind: 'circular',
    jurisdiction: 'VN',
    number: N('18/2024/TT-NHNN'),
    title: L('Circular on bank card operations', 'Thông tư quy định về hoạt động thẻ ngân hàng'),
    issuer: 'SBV',
    issued: '28/06/2024',
    effective: '01/07/2024',
    status: L('Replaces Circular 19/2016 and its amendments.', 'Thay thế Thông tư 19/2016 và các văn bản sửa đổi.'),
    summary: L('Issuing and using debit, credit and prepaid cards: the card contract and its fees, authentication, limits, card locking, and the rights of the cardholder.', 'Phát hành và sử dụng thẻ ghi nợ, thẻ tín dụng, thẻ trả trước: hợp đồng và phí thẻ, xác thực, hạn mức, khóa thẻ, và quyền của chủ thẻ.'),
    keyPoints: [L('Card fees must be in the contract and disclosed beforehand; a debit card is not pushed below zero without an overdraft agreement.', 'Phí thẻ phải có trong hợp đồng và được công bố trước; thẻ ghi nợ không bị âm tiền nếu không có thỏa thuận thấu chi.'), L('Online card payments are authenticated, and repeated wrong codes lock the card.', 'Thanh toán thẻ trực tuyến phải xác thực, và nhập sai mã nhiều lần sẽ khóa thẻ.')],
    scenarios: ['pos-20', 'pos-500', 'token-45', 'otp-250', 'otp-locked', '3ds-timeout', 'fee-card-10', 'fee-annual-45', 'fee-collect-fail', 'card-late-fee', 'atm-61'],
    tags: T('thẻ', 'card', 'phí thường niên', 'annual fee', 'phát hành thẻ', 'issuance', 'OTP', '3DS', 'khóa thẻ'),
  },
  {
    id: 'circ-40-2024',
    kind: 'circular',
    jurisdiction: 'VN',
    number: N('40/2024/TT-NHNN'),
    title: L('Circular on intermediary payment services (e-wallets)', 'Thông tư hướng dẫn hoạt động cung ứng dịch vụ trung gian thanh toán (ví điện tử)'),
    issuer: 'SBV',
    issued: '28/06/2024',
    effective: '01/07/2024',
    status: L('Replaces Circular 39/2014 and its amendments.', 'Thay thế Thông tư 39/2014 và các văn bản sửa đổi.'),
    summary: L('How wallet providers operate: the wallet is linked to its holder’s own bank account, topped up and withdrawn only through it, within daily and monthly limits.', 'Hoạt động của đơn vị ví điện tử: ví phải liên kết với tài khoản ngân hàng chính chủ, chỉ nạp và rút qua tài khoản đó, trong hạn mức ngày và tháng.'),
    keyPoints: [L('A wallet may only be funded from an account in its holder’s own name.', 'Ví chỉ được nạp từ tài khoản đứng tên chính chủ ví.')],
    scenarios: ['wallet-cashin-100', 'wallet-name-mismatch', 'qr-780'],
    tags: T('ví điện tử', 'e-wallet', 'MoMo', 'trung gian thanh toán', 'chính chủ', 'own name'),
  },
  {
    id: 'circ-39-2016',
    kind: 'circular',
    jurisdiction: 'VN',
    number: N('39/2016/TT-NHNN'),
    title: L('Circular on lending by credit institutions to customers', 'Thông tư quy định về hoạt động cho vay của tổ chức tín dụng đối với khách hàng'),
    issuer: 'SBV',
    issued: '30/12/2016',
    effective: '15/03/2017',
    status: L('Amended several times since; check the consolidated text.', 'Đã được sửa đổi, bổ sung nhiều lần; cần đối chiếu văn bản hợp nhất.'),
    summary: L('Lending conditions and procedure: the borrower’s capacity to repay, the purpose of the loan, interest and fees, repayment order, and what happens when a payment is missed.', 'Điều kiện và quy trình cho vay: khả năng trả nợ của khách, mục đích vay, lãi và phí, thứ tự thu nợ, và xử lý khi khách trả chậm.'),
    keyPoints: [L('The bank appraises capacity to repay (the DTI test) before it lends.', 'Ngân hàng thẩm định khả năng trả nợ (tỷ lệ nợ/thu nhập) trước khi cho vay.'), L('Repayments go to penalty and interest before principal, in the order the contract sets.', 'Tiền trả nợ được thu phạt và lãi trước gốc, theo thứ tự hợp đồng quy định.'), L('An overdraft is lending, and a missed instalment becomes overdue debt with a late charge.', 'Thấu chi là cho vay, và kỳ trả nợ bị lỡ trở thành nợ quá hạn có lãi phạt.')],
    scenarios: ['bnpl-approve-400', 'bnpl-decline-dti', 'bnpl-decline-cic', 'fee-annual-45', 'waterfall-120', 'waterfall-50', 'waterfall-nsf'],
    tags: T('cho vay', 'lending', 'DTI', 'trả góp', 'BNPL', 'thấu chi', 'overdraft', 'waterfall', 'thứ tự thu nợ'),
  },
  {
    id: 'circ-31-2024',
    kind: 'circular',
    jurisdiction: 'VN',
    number: N('31/2024/TT-NHNN'),
    title: L('Circular on the classification of assets of commercial banks', 'Thông tư quy định về phân loại tài sản có của ngân hàng thương mại'),
    issuer: 'SBV',
    issued: '30/06/2024',
    effective: '01/07/2024',
    status: L('Takes over debt classification from Circular 11/2021/TT-NHNN.', 'Tiếp nhận quy định phân loại nợ từ Thông tư 11/2021/TT-NHNN.'),
    summary: L('Puts every loan in one of five debt groups by how many days it is past due and the customer’s situation; groups 3 to 5 are non-performing.', 'Phân mỗi khoản vay vào một trong năm nhóm nợ theo số ngày quá hạn và tình hình khách hàng; nhóm 3 đến 5 là nợ xấu.'),
    keyPoints: [L('Group 2 from 10 days past due, group 3 from 91, group 4 from 181, group 5 over 360.', 'Nhóm 2 từ 10 ngày quá hạn, nhóm 3 từ 91 ngày, nhóm 4 từ 181 ngày, nhóm 5 trên 360 ngày.'), L('All of a customer’s loans follow the worst one to the same group, and the group is reported to the credit bureau.', 'Mọi khoản vay của khách chuyển theo khoản xấu nhất về cùng nhóm, và nhóm nợ được báo cáo lên CIC.')],
    scenarios: ['risk-migrate-95dpd', 'risk-migrate-group5', 'risk-cure', 'waterfall-nsf', 'bnpl-decline-cic'],
    tags: T('phân loại nợ', 'debt classification', 'nhóm nợ', 'debt group', 'nợ xấu', 'NPL', 'quá hạn', 'DPD'),
  },
  {
    id: 'circ-11-2021',
    kind: 'circular',
    jurisdiction: 'VN',
    number: N('11/2021/TT-NHNN'),
    title: L('Circular on asset classification and provisioning', 'Thông tư quy định về phân loại tài sản có, mức trích, phương pháp trích lập dự phòng rủi ro'),
    issuer: 'SBV',
    issued: '30/07/2021',
    effective: '01/10/2021',
    status: L('Classification now under Circular 31/2024, provisioning under Decree 86/2024.', 'Phân loại nay theo Thông tư 31/2024, trích lập theo Nghị định 86/2024.'),
    summary: L('The earlier rule set for the five debt groups and their provision rates, still the reference much of the industry training uses.', 'Bộ quy định trước đây về năm nhóm nợ và tỷ lệ trích lập, vẫn là tài liệu tham chiếu trong nhiều chương trình đào tạo.'),
    keyPoints: [L('Provision = (balance − eligible collateral) × the group’s rate.', 'Dự phòng cụ thể = (dư nợ − giá trị TSĐB được khấu trừ) × tỷ lệ của nhóm.')],
    scenarios: ['risk-migrate-95dpd', 'risk-migrate-group5'],
    tags: T('dự phòng', 'provision', 'nhóm nợ', 'phân loại nợ'),
  },
  {
    id: 'circ-48-2018',
    kind: 'circular',
    jurisdiction: 'VN',
    number: N('48/2018/TT-NHNN'),
    title: L('Circular on savings deposits', 'Thông tư quy định về tiền gửi tiết kiệm'),
    issuer: 'SBV',
    issued: '31/12/2018',
    effective: '01/07/2019',
    summary: L('How a savings book is opened, paid out and closed: who may withdraw, identity checks at the counter, early withdrawal, and pledging a savings book.', 'Cách mở, chi trả và tất toán sổ tiết kiệm: ai được rút, kiểm tra giấy tờ tại quầy, rút trước hạn, và cầm cố sổ tiết kiệm.'),
    keyPoints: [L('Only the depositor, or their lawful representative, may withdraw, after the ID and signature are checked.', 'Chỉ người gửi hoặc người đại diện hợp pháp được rút, sau khi kiểm tra giấy tờ và chữ ký.'), L('Early withdrawal earns at most the demand rate; a pledged book cannot be closed until released.', 'Rút trước hạn chỉ hưởng tối đa lãi không kỳ hạn; sổ đang cầm cố không được tất toán đến khi giải chấp.')],
    scenarios: ['td-break-10k', 'td-mature-close', 'td-break-pledged', 'td-break-id-mismatch', 'collateral-lock'],
    tags: T('tiết kiệm', 'savings', 'tất toán', 'rút trước hạn', 'early withdrawal', 'cầm cố', 'pledge'),
  },
  {
    id: 'circ-49-2018',
    kind: 'circular',
    jurisdiction: 'VN',
    number: N('49/2018/TT-NHNN'),
    title: L('Circular on term deposits', 'Thông tư quy định về tiền gửi có kỳ hạn'),
    issuer: 'SBV',
    issued: '31/12/2018',
    effective: '01/07/2019',
    summary: L('Term deposits other than savings books: the agreement, interest at maturity, early withdrawal and its rate.', 'Tiền gửi có kỳ hạn ngoài sổ tiết kiệm: thỏa thuận, trả lãi khi đến hạn, rút trước hạn và lãi suất áp dụng.'),
    keyPoints: [L('Held to maturity, the deposit earns the agreed rate in full.', 'Gửi đến hạn, khách hưởng đủ lãi suất đã thỏa thuận.')],
    scenarios: ['td-break-10k', 'td-mature-close'],
    tags: T('tiền gửi có kỳ hạn', 'term deposit', 'đáo hạn', 'maturity'),
  },
  {
    id: 'circ-36-2012',
    kind: 'circular',
    jurisdiction: 'VN',
    number: N('36/2012/TT-NHNN'),
    title: L('Circular on installing, managing and operating ATMs', 'Thông tư quy định về trang bị, quản lý, vận hành và đảm bảo an toàn hoạt động của máy giao dịch tự động'),
    issuer: 'SBV',
    issued: '28/12/2012',
    effective: '2013',
    status: L('Amended since; check the consolidated text.', 'Đã được sửa đổi; cần đối chiếu văn bản hợp nhất.'),
    summary: L('ATM operation, security, cash replenishment and complaint handling, including what the bank must do when a machine fails to dispense after debiting the customer.', 'Vận hành, an ninh, tiếp quỹ ATM và xử lý khiếu nại, gồm trách nhiệm của ngân hàng khi máy đã trừ tiền mà không nhả tiền.'),
    keyPoints: [L('A failed dispense is parked in suspense and settled by the cash count, then refunded if the notes stayed in the machine.', 'Giao dịch lỗi nhả tiền được treo và xử lý theo kết quả kiểm quỹ, hoàn tiền nếu tiền còn trong máy.'), L('Machines must be kept supplied: a low cassette is refilled before it runs out.', 'Máy phải được tiếp quỹ kịp thời: hộp tiền thấp phải được bổ sung trước khi hết.')],
    scenarios: ['atm-withdraw-100', 'atm-jam-200', 'cassette-low', 'atm-51', 'atm-61', 'cdm-200'],
    tags: T('ATM', 'CDM', 'kẹt tiền', 'cash jam', 'tiếp quỹ', 'CIT', 'cassette'),
  },
  {
    id: 'circ-01-2014',
    kind: 'circular',
    jurisdiction: 'VN',
    number: N('01/2014/TT-NHNN'),
    title: L('Circular on receiving, storing and transporting cash and valuables', 'Thông tư quy định về giao nhận, bảo quản, vận chuyển tiền mặt, tài sản quý, giấy tờ có giá'),
    issuer: 'SBV',
    issued: '2014',
    effective: '2014',
    status: L('Amended since; check the consolidated text.', 'Đã được sửa đổi; cần đối chiếu văn bản hợp nhất.'),
    summary: L('Cash handling inside the bank: counting at the counter, the vault, dual control, cash limits at a till, and transport between vault, counters and ATMs.', 'Quản lý tiền mặt trong ngân hàng: kiểm đếm tại quầy, kho quỹ, kiểm soát kép, hạn mức tồn quỹ tại quầy, và vận chuyển giữa kho, quầy và ATM.'),
    keyPoints: [L('A till over its limit hands the surplus to the vault, counted by two people.', 'Ngăn kéo vượt hạn mức phải nộp phần dư về kho quỹ, có hai người cùng kiểm đếm.')],
    scenarios: ['teller-deposit-5000', 'teller-exceed-limit', 'teller-counterfeit', 'cassette-low'],
    tags: T('tiền mặt', 'cash', 'kho quỹ', 'vault', 'kiểm soát kép', 'dual control', 'ngăn kéo', 'till'),
  },
  {
    id: 'circ-13-2018',
    kind: 'circular',
    jurisdiction: 'VN',
    number: N('13/2018/TT-NHNN'),
    title: L('Circular on the internal control systems of commercial banks', 'Thông tư quy định về hệ thống kiểm soát nội bộ của ngân hàng thương mại'),
    issuer: 'SBV',
    issued: '18/05/2018',
    effective: '01/07/2018',
    summary: L('The three lines of defence: business controls, risk management and compliance, and internal audit; reconciliations and the audit trail.', 'Ba tuyến bảo vệ: kiểm soát tại đơn vị kinh doanh, quản lý rủi ro và tuân thủ, kiểm toán nội bộ; đối chiếu và dấu vết kiểm toán.'),
    keyPoints: [L('Every day ends with reconciliation, and breaks are investigated, never written off quietly.', 'Mỗi ngày kết thúc bằng đối chiếu, và chênh lệch phải được điều tra, không tự ý xóa.')],
    scenarios: ['eod', 'teller-exceed-limit', 'atm-jam-200'],
    tags: T('kiểm soát nội bộ', 'internal control', 'đối soát', 'reconciliation', 'audit', 'kiểm toán', 'EOD'),
  },
  {
    id: 'tccs-03-2018',
    kind: 'standard',
    jurisdiction: 'VN',
    number: N('TCCS 03:2018/NHNN'),
    title: L('SBV standard for QR codes in payments', 'Tiêu chuẩn cơ sở về mã QR trong thanh toán'),
    issuer: 'SBV',
    issued: '2018',
    effective: '2018',
    summary: L('The VietQR format: an EMVCo QR payload with the bank’s BIN, the account, the amount and a CRC checksum.', 'Định dạng VietQR: dữ liệu QR theo EMVCo gồm BIN ngân hàng, số tài khoản, số tiền và mã kiểm tra CRC.'),
    keyPoints: [L('A QR whose checksum does not match is refused before any money moves.', 'Mã QR sai checksum bị từ chối trước khi tiền dịch chuyển.')],
    scenarios: ['qr-780', 'qr-rooted'],
    tags: T('QR', 'VietQR', 'EMVCo', 'CRC', 'Napas247'),
  },
  // International
  {
    id: 'basel-ii',
    kind: 'basel',
    jurisdiction: 'INTL',
    number: N('Basel II'),
    title: L('Basel II: International Convergence of Capital Measurement', 'Basel II: Hiệp ước vốn quốc tế'),
    issuer: 'BCBS',
    issued: '06/2004',
    effective: '2004',
    status: L('Applied in Vietnam through Circular 41/2016/TT-NHNN on capital adequacy.', 'Áp dụng tại Việt Nam qua Thông tư 41/2016/TT-NHNN về tỷ lệ an toàn vốn.'),
    summary: L('Three pillars: minimum capital for credit, market and operational risk; supervisory review; market discipline through disclosure.', 'Ba trụ cột: vốn tối thiểu cho rủi ro tín dụng, thị trường và hoạt động; giám sát của cơ quan quản lý; kỷ luật thị trường qua công bố thông tin.'),
    keyPoints: [L('A loan migrating to a worse grade raises its risk weight and the capital it consumes.', 'Khoản vay chuyển sang nhóm xấu hơn làm tăng hệ số rủi ro và vốn phải dành cho nó.')],
    scenarios: ['risk-migrate-95dpd', 'risk-migrate-group5'],
    tags: T('Basel', 'CAR', 'capital', 'vốn', 'an toàn vốn', 'risk weight'),
  },
  {
    id: 'basel-iii',
    kind: 'basel',
    jurisdiction: 'INTL',
    number: N('Basel III'),
    title: L('Basel III: a global regulatory framework for more resilient banks', 'Basel III: khung quản lý toàn cầu cho ngân hàng vững vàng hơn'),
    issuer: 'BCBS',
    issued: '12/2010',
    effective: '2013',
    status: L('Phased in from 2013; the final reforms of 2017 from 2023.', 'Áp dụng dần từ 2013; gói hoàn thiện năm 2017 áp dụng từ 2023.'),
    summary: L('Higher and better capital, buffers, a leverage ratio, and two liquidity standards (LCR and NSFR).', 'Vốn nhiều hơn và chất lượng hơn, các bộ đệm vốn, tỷ lệ đòn bẩy, và hai chuẩn thanh khoản (LCR và NSFR).'),
    keyPoints: [L('Deposits that can be withdrawn early count as a liquidity outflow risk.', 'Tiền gửi có thể rút trước hạn được tính là rủi ro dòng tiền ra.')],
    scenarios: ['risk-migrate-95dpd', 'td-break-10k'],
    tags: T('Basel', 'LCR', 'NSFR', 'liquidity', 'thanh khoản', 'capital buffer'),
  },
  {
    id: 'bcbs-248',
    kind: 'basel',
    jurisdiction: 'INTL',
    number: N('BCBS 248'),
    title: L('Monitoring tools for intraday liquidity management', 'Công cụ giám sát quản lý thanh khoản trong ngày'),
    issuer: 'BCBS',
    issued: '04/2013',
    effective: '2015',
    summary: L('How a bank tracks its intraday liquidity: the largest daily outflows, available liquidity at the start of the day, and the timing of payments on its nostro accounts.', 'Cách ngân hàng theo dõi thanh khoản trong ngày: dòng tiền ra lớn nhất trong ngày, thanh khoản sẵn có đầu ngày, và thời điểm thanh toán trên tài khoản nostro.'),
    keyPoints: [L('A large outgoing SWIFT payment is checked against the intraday forecast before release.', 'Lệnh chuyển SWIFT lớn được đối chiếu với dự báo thanh khoản trong ngày trước khi giải phóng.')],
    scenarios: ['swift-6800', 'eod'],
    tags: T('intraday', 'liquidity', 'thanh khoản trong ngày', 'nostro', 'SWIFT'),
  },
  {
    id: 'ifrs-9',
    kind: 'accounting',
    jurisdiction: 'INTL',
    number: N('IFRS 9'),
    title: L('IFRS 9 Financial Instruments', 'IFRS 9 Công cụ tài chính'),
    issuer: 'IASB',
    issued: '07/2014',
    effective: '01/01/2018',
    status: L('Australia applies it as AASB 9.', 'Úc áp dụng dưới tên AASB 9.'),
    summary: L('Classification of financial assets and the expected credit loss (ECL) model in three stages: 12-month ECL, lifetime ECL, and credit-impaired.', 'Phân loại tài sản tài chính và mô hình tổn thất tín dụng dự kiến (ECL) ba giai đoạn: ECL 12 tháng, ECL toàn thời hạn, và suy giảm giá trị tín dụng.'),
    keyPoints: [L('Losses are provided before they happen: a loan 30 days late moves to stage 2, a defaulted one to stage 3.', 'Dự phòng tổn thất trước khi xảy ra: khoản vay quá hạn 30 ngày chuyển giai đoạn 2, khoản vỡ nợ chuyển giai đoạn 3.')],
    scenarios: ['risk-migrate-95dpd', 'risk-migrate-group5', 'risk-cure', 'collateral-shortfall'],
    tags: T('IFRS', 'ECL', 'expected credit loss', 'tổn thất dự kiến', 'stage', 'AASB 9'),
  },
  {
    id: 'ifrs-15',
    kind: 'accounting',
    jurisdiction: 'INTL',
    number: N('IFRS 15'),
    title: L('IFRS 15 Revenue from Contracts with Customers', 'IFRS 15 Doanh thu từ hợp đồng với khách hàng'),
    issuer: 'IASB',
    issued: '05/2014',
    effective: '01/01/2018',
    summary: L('When fee income is recognised: as the service is delivered. A card’s annual fee is earned across the year; an ATM fee when the cash is paid.', 'Thời điểm ghi nhận thu nhập phí: khi dịch vụ được cung cấp. Phí thường niên thẻ được ghi nhận dần trong năm; phí ATM khi tiền được chi.'),
    keyPoints: [L('Fee income is the bank’s share only: a pass-through to the switch is a liability, not revenue.', 'Thu nhập phí chỉ là phần của ngân hàng: phần thu hộ cho chuyển mạch là nợ phải trả, không phải doanh thu.')],
    scenarios: ['fee-annual-45', 'fee-card-10', 'atm-withdraw-100'],
    tags: T('IFRS', 'revenue', 'doanh thu', 'phí', 'fee income'),
  },
  {
    id: 'iso-8583',
    kind: 'standard',
    jurisdiction: 'INTL',
    number: N('ISO 8583'),
    title: L('ISO 8583 Financial transaction card originated messages', 'ISO 8583 Thông điệp giao dịch thẻ'),
    issuer: 'ISO',
    issued: '1987',
    effective: '1987',
    summary: L('The message format of card authorisations: the MTI (0100 / 0110), data elements such as the PAN and amount, and the response code (field 39).', 'Định dạng thông điệp cấp phép thẻ: MTI (0100 / 0110), các trường dữ liệu như số thẻ và số tiền, và mã phản hồi (trường 39).'),
    keyPoints: [L('RC 00 approved, 51 insufficient funds, 61 over the withdrawal limit, 68 response too late, 75 too many PIN or code tries.', 'RC 00 chấp thuận, 51 không đủ số dư, 61 vượt hạn mức rút, 68 phản hồi quá hạn, 75 nhập sai quá số lần.')],
    scenarios: ['pos-20', 'pos-500', 'atm-51', 'atm-61', 'bill-timeout-68', 'otp-locked'],
    tags: T('ISO8583', 'MTI', 'response code', 'mã phản hồi', 'RC 51', 'RC 00', 'authorisation'),
  },
  {
    id: 'iso-20022',
    kind: 'standard',
    jurisdiction: 'INTL',
    number: N('ISO 20022'),
    title: L('ISO 20022 Universal financial industry message scheme', 'ISO 20022 Chuẩn thông điệp tài chính'),
    issuer: 'ISO',
    issued: '2004',
    effective: '2004',
    status: L('SWIFT cross-border payments moved to it (CBPR+); the MT coexistence period ended in November 2025.', 'Thanh toán quốc tế SWIFT đã chuyển sang chuẩn này (CBPR+); giai đoạn song song với MT kết thúc tháng 11/2025.'),
    summary: L('Rich, structured payment messages: pacs.008 to pay, pacs.002 for the status (accepted or rejected), pacs.004 to return a payment.', 'Thông điệp thanh toán có cấu trúc, giàu dữ liệu: pacs.008 để chuyển tiền, pacs.002 báo trạng thái (chấp nhận hoặc từ chối), pacs.004 để hoàn trả.'),
    keyPoints: [L('A malformed BIC is rejected with pacs.002 RJCT before money leaves the account.', 'Mã BIC sai định dạng bị từ chối bằng pacs.002 RJCT trước khi tiền rời tài khoản.')],
    scenarios: ['swift-6800', 'swift-reject', 'swift-sanction', 'claim-return', 'claim-rejected', 'wallet-cashin-100'],
    tags: T('ISO20022', 'pacs.008', 'pacs.002', 'pacs.004', 'SWIFT', 'MX', 'CBPR+', 'BIC', 'IBAN'),
  },
  {
    id: 'emv-3ds',
    kind: 'standard',
    jurisdiction: 'INTL',
    number: N('EMV 3DS'),
    title: L('EMV 3-D Secure', 'EMV 3-D Secure (xác thực thanh toán trực tuyến)'),
    issuer: 'EMVCO',
    issued: '2016',
    effective: '2016',
    summary: L('Authenticating the cardholder online: a risk score lets low-risk payments through (frictionless) and challenges the rest with a one-time code.', 'Xác thực chủ thẻ khi thanh toán trực tuyến: điểm rủi ro cho giao dịch rủi ro thấp đi thẳng, các giao dịch còn lại phải nhập mã OTP.'),
    keyPoints: [L('A challenge left unanswered times out, and the payment is refused.', 'Phiên xác thực không được hoàn tất sẽ hết hạn, và giao dịch bị từ chối.')],
    scenarios: ['otp-250', 'otp-locked', '3ds-timeout'],
    tags: T('3DS', 'OTP', 'challenge', 'frictionless', 'xác thực'),
  },
  {
    id: 'pci-dss',
    kind: 'standard',
    jurisdiction: 'INTL',
    number: N('PCI DSS v4.0'),
    title: L('Payment Card Industry Data Security Standard', 'Tiêu chuẩn bảo mật dữ liệu ngành thẻ thanh toán'),
    issuer: 'PCI',
    issued: '03/2022',
    effective: '31/03/2024',
    status: L('Its future-dated requirements became mandatory on 31/03/2025.', 'Các yêu cầu có lộ trình trở thành bắt buộc từ 31/03/2025.'),
    summary: L('Protecting card data: never store the CVV, encrypt or tokenise the card number, restrict access and log it.', 'Bảo vệ dữ liệu thẻ: không lưu CVV, mã hóa hoặc token hóa số thẻ, giới hạn và ghi nhật ký truy cập.'),
    keyPoints: [L('A token stands in for the real card number, so a stolen token is useless elsewhere.', 'Token thay cho số thẻ thật, nên token bị lộ không dùng được ở nơi khác.')],
    scenarios: ['token-45', 'token-51'],
    tags: T('PCI', 'token', 'tokenization', 'CVV', 'bảo mật thẻ', 'card data'),
  },
  {
    id: 'fatf-recs',
    kind: 'standard',
    jurisdiction: 'INTL',
    number: N('FATF Recommendations'),
    title: L('The FATF Recommendations', 'Các Khuyến nghị của FATF'),
    issuer: 'FATF',
    issued: '02/2012',
    effective: '2012',
    status: L('Updated regularly since 2012.', 'Được cập nhật thường xuyên từ năm 2012.'),
    summary: L('The 40 international AML/CFT standards: risk-based approach, due diligence, wire transfer information, targeted financial sanctions, suspicious transaction reporting.', '40 chuẩn mực quốc tế về chống rửa tiền và tài trợ khủng bố: tiếp cận dựa trên rủi ro, thẩm định khách hàng, thông tin chuyển tiền, trừng phạt tài chính có mục tiêu, báo cáo giao dịch đáng ngờ.'),
    keyPoints: [L('Recommendation 6: freeze without delay the funds of designated persons.', 'Khuyến nghị 6: phong tỏa ngay tài sản của cá nhân, tổ chức bị chỉ định.'), L('Recommendation 16: a cross-border transfer carries the payer’s and payee’s details.', 'Khuyến nghị 16: lệnh chuyển tiền quốc tế phải kèm thông tin người chuyển và người nhận.')],
    scenarios: ['swift-sanction', 'teller-smurf', 'swift-6800'],
    tags: T('FATF', 'AML', 'CFT', 'sanctions', 'cấm vận', 'wire transfer'),
  },
  // Australia
  {
    id: 'au-amlctf-2006',
    kind: 'law',
    jurisdiction: 'AU',
    number: N('AML/CTF Act 2006'),
    title: L('Anti-Money Laundering and Counter-Terrorism Financing Act 2006 (Cth)', 'Luật Chống rửa tiền và Chống tài trợ khủng bố 2006 của Úc'),
    issuer: 'AU_PARL',
    regulator: 'AUSTRAC',
    issued: '2006',
    effective: '2006',
    status: L('Reformed by the AML/CTF Amendment Act 2024, phased in from 2026.', 'Được sửa đổi bởi Luật sửa đổi AML/CTF 2024, áp dụng dần từ năm 2026.'),
    summary: L('Australia’s AML regime: customer identification, threshold transaction reports for cash of A$10,000 or more, suspicious matter reports and international funds transfer instructions to AUSTRAC.', 'Chế độ AML của Úc: định danh khách hàng, báo cáo giao dịch tiền mặt từ A$10,000, báo cáo vấn đề đáng ngờ và chỉ thị chuyển tiền quốc tế gửi AUSTRAC.'),
    keyPoints: [
      L('Cash of A$10,000 or more is a threshold transaction report (TTR, s 43).', 'Tiền mặt từ A$10,000 phải lập báo cáo giao dịch vượt ngưỡng (TTR, Điều 43).'),
      L('A reporting entity must run an AML/CTF program and identify its customers before it serves them (Parts 2 and 7).', 'Đơn vị báo cáo phải có chương trình AML/CTF và định danh khách hàng trước khi cung cấp dịch vụ (Phần 2 và 7).'),
      L('Splitting cash to stay under the threshold is itself an offence (structuring, s 142).', 'Chia nhỏ tiền mặt để né ngưỡng tự thân là hành vi phạm tội (structuring, Điều 142).'),
    ],
    scenarios: ['teller-12k', 'teller-smurf', 'swift-sanction', 'ekyc-open'],
    tags: T('AUSTRAC', 'TTR', 'SMR', 'AML/CTF', 'Australia', 'Úc'),
  },
  {
    id: 'au-aps-220',
    kind: 'standard',
    jurisdiction: 'AU',
    number: N('APRA APS 220'),
    title: L('Prudential Standard APS 220 Credit Risk Management', 'Chuẩn mực an toàn APS 220 Quản lý rủi ro tín dụng'),
    issuer: 'APRA',
    issued: '2021',
    effective: '01/01/2022',
    summary: L('Credit risk management for Australian banks: sound underwriting, asset classification, provisioning in line with AASB 9.', 'Quản lý rủi ro tín dụng của ngân hàng Úc: thẩm định cho vay chặt chẽ, phân loại tài sản, trích lập dự phòng theo AASB 9.'),
    keyPoints: [L('Loans 90 days past due are non-performing.', 'Khoản vay quá hạn 90 ngày là nợ xấu.')],
    scenarios: ['risk-migrate-95dpd', 'bnpl-decline-dti'],
    tags: T('APRA', 'APS 220', 'credit risk', 'rủi ro tín dụng', 'Australia'),
  },
  {
    id: 'au-cps-230',
    kind: 'standard',
    jurisdiction: 'AU',
    number: N('APRA CPS 230'),
    title: L('Prudential Standard CPS 230 Operational Risk Management', 'Chuẩn mực an toàn CPS 230 Quản lý rủi ro hoạt động'),
    issuer: 'APRA',
    issued: '07/2023',
    effective: '01/07/2025',
    summary: L('Operational resilience: identify critical operations, set tolerance levels for disruption, and manage material service providers such as switches and cash-in-transit firms.', 'Khả năng chống chịu hoạt động: xác định nghiệp vụ trọng yếu, đặt ngưỡng chịu đựng gián đoạn, và quản lý nhà cung cấp dịch vụ trọng yếu như chuyển mạch, vận chuyển tiền.'),
    keyPoints: [L('A partner that does not answer is an operational incident with a fallback, not a silent retry.', 'Đối tác không phản hồi là sự cố hoạt động cần phương án dự phòng, không âm thầm thử lại.')],
    scenarios: ['atm-jam-200', 'bill-timeout-68', 'cassette-low'],
    tags: T('APRA', 'CPS 230', 'operational risk', 'rủi ro hoạt động', 'resilience'),
  },
  {
    id: 'au-austrac-rules',
    kind: 'standard',
    jurisdiction: 'AU',
    number: N('AML/CTF Rules 2007 (No. 1)'),
    title: L('Anti-Money Laundering and Counter-Terrorism Financing Rules Instrument 2007 (No. 1) — AUSTRAC Rules', 'Bộ quy tắc AML/CTF 2007 (Số 1) của AUSTRAC'),
    issuer: 'AUSTRAC',
    issued: '2007',
    effective: '2007',
    status: L('Being remade alongside the 2024 reforms to the AML/CTF Act.', 'Đang được ban hành lại cùng đợt sửa đổi Luật AML/CTF năm 2024.'),
    summary: L('The detail under the Act: what a customer identification procedure must collect and verify, the content of an AML/CTF program, ongoing customer due diligence, and the form of each report to AUSTRAC.', 'Quy định chi tiết dưới Luật: thủ tục định danh khách hàng phải thu thập và xác minh gì, nội dung chương trình AML/CTF, thẩm định khách hàng liên tục, và mẫu từng loại báo cáo gửi AUSTRAC.'),
    keyPoints: [
      L('An individual is verified on full name plus date of birth or address, from reliable and independent documents or electronic data (Part 4.2).', 'Cá nhân được xác minh theo họ tên đầy đủ cùng ngày sinh hoặc địa chỉ, từ giấy tờ hoặc dữ liệu điện tử tin cậy, độc lập (Phần 4.2).'),
      L('A verification that cannot be completed means the service is not provided.', 'Không hoàn tất được xác minh thì không cung cấp dịch vụ.'),
    ],
    scenarios: ['ekyc-open', 'ekyc-deepfake', 'teller-12k'],
    tags: T('AUSTRAC', 'AML/CTF Rules', 'KYC', 'CDD', 'customer identification', 'định danh', 'eKYC', 'Australia', 'Úc'),
  },
  {
    id: 'au-ttr',
    kind: 'law',
    jurisdiction: 'AU',
    number: N('AML/CTF Act s 43 (TTR)'),
    title: L('Threshold Transaction Reports (TTR): physical cash of A$10,000 or more', 'Báo cáo giao dịch vượt ngưỡng (TTR): tiền mặt từ A$10,000'),
    issuer: 'AU_PARL',
    regulator: 'AUSTRAC',
    issued: '2006',
    effective: '2006',
    summary: L('Any transfer of physical currency of A$10,000 or more (or the foreign equivalent) in one transaction is reported to AUSTRAC within 10 business days, whether or not anything about it is suspicious.', 'Mọi giao dịch tiền mặt từ A$10,000 trở lên (hoặc tương đương ngoại tệ) trong một lần phải báo cáo AUSTRAC trong vòng 10 ngày làm việc, dù có đáng ngờ hay không.'),
    keyPoints: [
      L('The $12,000 counter withdrawal is paid out and a TTR is lodged automatically: a TTR is not a refusal.', 'Khoản rút $12,000 tại quầy vẫn được chi và TTR được lập tự động: TTR không phải là từ chối.'),
      L('Deposits split just under A$10,000 are structuring (s 142) and lead to an SMR, not a TTR.', 'Các khoản nộp chia nhỏ ngay dưới A$10,000 là structuring (Điều 142) và dẫn tới SMR, không phải TTR.'),
    ],
    scenarios: ['teller-12k', 'teller-smurf'],
    tags: T('TTR', 'threshold transaction', 'CTR', 'cash', 'tiền mặt', 'A$10,000', 'AUSTRAC', 'Úc'),
  },
  {
    id: 'au-smr',
    kind: 'law',
    jurisdiction: 'AU',
    number: N('AML/CTF Act s 41 (SMR)'),
    title: L('Suspicious Matter Reports (SMR)', 'Báo cáo vấn đề đáng ngờ (SMR)'),
    issuer: 'AU_PARL',
    regulator: 'AUSTRAC',
    issued: '2006',
    effective: '2006',
    summary: L('When a bank suspects on reasonable grounds that a customer or transaction is linked to money laundering, terrorism financing, tax evasion or other crime, or that a customer is not who they claim to be, it reports to AUSTRAC.', 'Khi ngân hàng có căn cứ hợp lý nghi ngờ khách hàng hoặc giao dịch liên quan rửa tiền, tài trợ khủng bố, trốn thuế hay tội phạm khác, hoặc khách không đúng danh tính khai báo, ngân hàng phải báo cáo AUSTRAC.'),
    keyPoints: [
      L('Report within 3 business days of forming the suspicion, or within 24 hours if it relates to terrorism financing.', 'Báo cáo trong 3 ngày làm việc kể từ khi hình thành nghi ngờ, hoặc trong 24 giờ nếu liên quan tài trợ khủng bố.'),
      L('Never tip the customer off that a report has been made (s 123).', 'Không được tiết lộ cho khách biết đã lập báo cáo (Điều 123).'),
    ],
    scenarios: ['teller-smurf', 'swift-sanction', 'ekyc-deepfake', 'qr-rooted'],
    tags: T('SMR', 'STR', 'suspicious', 'đáng ngờ', 'tipping off', 'AUSTRAC', 'Úc'),
  },
  {
    id: 'au-ifti',
    kind: 'law',
    jurisdiction: 'AU',
    number: N('AML/CTF Act s 45 (IFTI)'),
    title: L('International Funds Transfer Instruction reports (IFTI)', 'Báo cáo chỉ thị chuyển tiền quốc tế (IFTI)'),
    issuer: 'AU_PARL',
    regulator: 'AUSTRAC',
    issued: '2006',
    effective: '2006',
    summary: L('Every instruction to send money into or out of Australia is reported to AUSTRAC within 10 business days, with the payer and payee details the instruction carries. Unlike a TTR there is no minimum amount; the A$10,000 figure is the cash threshold.', 'Mọi chỉ thị chuyển tiền vào hoặc ra khỏi Úc phải báo cáo AUSTRAC trong 10 ngày làm việc, kèm thông tin người chuyển và người nhận trong chỉ thị. Khác TTR, IFTI không có mức tối thiểu; con số A$10,000 là ngưỡng tiền mặt.'),
    keyPoints: [
      L('The $6,800 SWIFT pacs.008 is still an IFTI: it is reported because it crosses the border, not because of its size.', 'Lệnh SWIFT pacs.008 $6,800 vẫn là IFTI: phải báo cáo vì đi qua biên giới, không phải vì giá trị.'),
      L('Payer information must travel with the transfer (the travel rule, FATF Recommendation 16).', 'Thông tin người chuyển phải đi kèm lệnh (quy tắc travel rule, Khuyến nghị 16 của FATF).'),
    ],
    scenarios: ['swift-6800', 'swift-reject', 'swift-sanction'],
    tags: T('IFTI', 'IFTA', 'international transfer', 'chuyển tiền quốc tế', 'SWIFT', 'travel rule', 'AUSTRAC', 'Úc'),
  },
  {
    id: 'au-banking-act-1959',
    kind: 'law',
    jurisdiction: 'AU',
    number: N('Banking Act 1959 (Cth)'),
    title: L('Banking Act 1959', 'Luật Ngân hàng 1959 của Úc'),
    issuer: 'AU_PARL',
    regulator: 'APRA',
    issued: '1959',
    effective: '1959',
    status: L('Amended many times; the Financial Claims Scheme was added in 2008.', 'Được sửa đổi nhiều lần; Cơ chế bảo đảm tiền gửi (FCS) được bổ sung năm 2008.'),
    summary: L('Only an authorised deposit-taking institution (ADI) licensed by APRA may carry on banking business. APRA sets prudential standards the ADI must follow, and the Financial Claims Scheme protects deposits if an ADI fails.', 'Chỉ tổ chức nhận tiền gửi được APRA cấp phép (ADI) mới được kinh doanh ngân hàng. APRA ban hành chuẩn mực an toàn ADI phải tuân thủ, và Cơ chế bảo đảm tiền gửi (FCS) bảo vệ tiền gửi khi ADI đổ vỡ.'),
    keyPoints: [
      L('Deposits are protected up to A$250,000 per account holder per ADI under the Financial Claims Scheme.', 'Tiền gửi được bảo đảm tới A$250,000 cho mỗi chủ tài khoản tại mỗi ADI theo Cơ chế FCS.'),
      L('APRA may issue binding prudential standards (s 11AF) and direct an ADI that breaches them.', 'APRA được ban hành chuẩn mực an toàn có tính bắt buộc (Điều 11AF) và ra chỉ đạo khi ADI vi phạm.'),
    ],
    scenarios: ['teller-deposit-5000', 'td-mature-close', 'td-break-10k', 'collateral-lock', 'collateral-release'],
    tags: T('Banking Act', 'ADI', 'FCS', 'Financial Claims Scheme', 'bảo hiểm tiền gửi', 'APRA', 'Úc'),
  },
  {
    id: 'au-aps-110',
    kind: 'standard',
    jurisdiction: 'AU',
    number: N('APRA APS 110'),
    title: L('Prudential Standard APS 110 Capital Adequacy', 'Chuẩn mực an toàn APS 110 Mức đủ vốn'),
    issuer: 'APRA',
    issued: '2022',
    effective: '01/01/2023',
    status: L('Revised for the "unquestionably strong" capital framework from 2023.', 'Được sửa đổi theo khung vốn "vững mạnh không nghi ngờ" từ năm 2023.'),
    summary: L('An ADI holds capital against its risk-weighted assets: minimum ratios for Common Equity Tier 1, Tier 1 and total capital, plus a capital conservation buffer on top.', 'ADI phải giữ vốn tương ứng với tài sản có rủi ro: tỷ lệ tối thiểu cho vốn cấp 1 cơ bản (CET1), vốn cấp 1 và tổng vốn, cộng thêm bộ đệm bảo toàn vốn.'),
    keyPoints: [
      L('Minimums: CET1 4.5%, Tier 1 6%, total capital 8% of risk-weighted assets, before buffers.', 'Mức tối thiểu: CET1 4,5%, vốn cấp 1 6%, tổng vốn 8% tài sản có rủi ro, chưa tính bộ đệm.'),
      L('A loan moved to a worse group needs a bigger provision, which comes straight out of profit and so out of capital.', 'Khoản vay chuyển sang nhóm xấu hơn cần dự phòng lớn hơn, trừ thẳng vào lợi nhuận và do đó vào vốn.'),
    ],
    scenarios: ['risk-migrate-95dpd', 'risk-migrate-group5', 'collateral-shortfall'],
    tags: T('APRA', 'APS 110', 'capital', 'vốn', 'CET1', 'Basel III', 'Úc'),
  },
  {
    id: 'au-aps-210',
    kind: 'standard',
    jurisdiction: 'AU',
    number: N('APRA APS 210'),
    title: L('Prudential Standard APS 210 Liquidity', 'Chuẩn mực an toàn APS 210 Thanh khoản'),
    issuer: 'APRA',
    issued: '2017',
    effective: '01/01/2018',
    summary: L('An ADI must be able to meet its obligations as they fall due, in ordinary and stressed conditions: a liquidity risk framework, the Liquidity Coverage Ratio and the Net Stable Funding Ratio.', 'ADI phải luôn đáp ứng nghĩa vụ đến hạn, trong điều kiện bình thường và căng thẳng: khung quản lý rủi ro thanh khoản, tỷ lệ bao phủ thanh khoản (LCR) và tỷ lệ nguồn vốn ổn định ròng (NSFR).'),
    keyPoints: [
      L('LCR and NSFR at or above 100% for the larger ADIs.', 'LCR và NSFR từ 100% trở lên với các ADI lớn.'),
      L('Cash in tills, vaults and ATMs is part of day-to-day liquidity: a till over its limit or an empty cassette is a liquidity-management event.', 'Tiền mặt tại quầy, kho và ATM là một phần thanh khoản hằng ngày: ngăn kéo vượt hạn mức hay hộp tiền cạn là sự kiện quản lý thanh khoản.'),
    ],
    scenarios: ['eod', 'teller-exceed-limit', 'cassette-low', 'cassette-refill', 'swift-6800'],
    tags: T('APRA', 'APS 210', 'liquidity', 'thanh khoản', 'LCR', 'NSFR', 'Úc'),
  },
  {
    id: 'au-cps-234',
    kind: 'standard',
    jurisdiction: 'AU',
    number: N('APRA CPS 234'),
    title: L('Prudential Standard CPS 234 Information Security', 'Chuẩn mực an toàn CPS 234 An toàn thông tin'),
    issuer: 'APRA',
    issued: '11/2018',
    effective: '01/07/2019',
    summary: L('An APRA-regulated entity must keep information security capability in line with the threats it faces, control access, test its controls, and tell APRA about material incidents.', 'Tổ chức do APRA quản lý phải duy trì năng lực an toàn thông tin tương xứng với mối đe dọa, kiểm soát truy cập, kiểm thử các biện pháp kiểm soát và báo cáo APRA sự cố trọng yếu.'),
    keyPoints: [
      L('Notify APRA within 72 hours of a material information security incident.', 'Thông báo APRA trong 72 giờ khi có sự cố an toàn thông tin trọng yếu.'),
      L('Rooted devices, replayed selfies and brute-forced OTPs are the threats the controls exist for: block, lock and log.', 'Thiết bị đã root, selfie phát lại và OTP bị dò là các mối đe dọa mà kiểm soát nhắm tới: chặn, khóa và ghi nhật ký.'),
    ],
    scenarios: ['qr-rooted', 'otp-locked', 'ekyc-deepfake', 'token-45'],
    tags: T('APRA', 'CPS 234', 'information security', 'an toàn thông tin', 'cyber', 'Úc'),
  },
  {
    id: 'au-corps-act-2001',
    kind: 'law',
    jurisdiction: 'AU',
    number: N('Corporations Act 2001 (Cth)'),
    title: L('Corporations Act 2001 — Chapter 7 Financial Services and Markets', 'Luật Doanh nghiệp 2001 — Chương 7 Dịch vụ và thị trường tài chính'),
    issuer: 'AU_PARL',
    regulator: 'ASIC',
    issued: '2001',
    effective: '15/07/2001',
    summary: L('A bank that issues deposit and payment products holds an Australian financial services licence: it must act efficiently, honestly and fairly, disclose fees and terms, and design and distribute products to the right customers.', 'Ngân hàng phát hành sản phẩm tiền gửi và thanh toán phải có giấy phép dịch vụ tài chính Úc (AFSL): hoạt động hiệu quả, trung thực, công bằng, công bố phí và điều khoản, và thiết kế, phân phối sản phẩm đúng đối tượng.'),
    keyPoints: [
      L('General obligations of a licensee (s 912A): efficiently, honestly and fairly.', 'Nghĩa vụ chung của bên được cấp phép (Điều 912A): hiệu quả, trung thực và công bằng.'),
      L('Fees, such as an annual card fee or the interest lost on breaking a term deposit, are disclosed before the customer is bound.', 'Các khoản phí, như phí thường niên thẻ hay tiền lãi mất khi tất toán trước hạn, phải công bố trước khi khách bị ràng buộc.'),
    ],
    scenarios: ['fee-annual-45', 'td-break-10k', 'wallet-cashin-100'],
    tags: T('Corporations Act', 'AFSL', 'Chapter 7', 'disclosure', 'công bố thông tin', 'ASIC', 'Úc'),
  },
  {
    id: 'au-nccp-2009',
    kind: 'law',
    jurisdiction: 'AU',
    number: N('NCCP Act 2009 (Cth)'),
    title: L('National Consumer Credit Protection Act 2009 — Responsible Lending Obligations', 'Luật Bảo vệ tín dụng tiêu dùng quốc gia 2009 — Nghĩa vụ cho vay có trách nhiệm'),
    issuer: 'AU_PARL',
    regulator: 'ASIC',
    issued: '2009',
    effective: '01/07/2010',
    status: L('Buy Now Pay Later contracts were brought under it from 10 June 2025.', 'Hợp đồng Mua trước trả sau (BNPL) được đưa vào phạm vi điều chỉnh từ ngày 10/06/2025.'),
    summary: L('Before lending to a consumer the credit provider must make reasonable inquiries about their requirements and objectives, verify their financial situation, and assess that the credit is not unsuitable.', 'Trước khi cho người tiêu dùng vay, bên cho vay phải tìm hiểu hợp lý nhu cầu và mục tiêu của khách, xác minh tình hình tài chính, và đánh giá khoản vay không phải là không phù hợp.'),
    keyPoints: [
      L('Credit is unsuitable if the consumer could only repay with substantial hardship: a DTI over the limit is a decline.', 'Khoản vay không phù hợp nếu khách chỉ trả được khi gặp khó khăn đáng kể: DTI vượt ngưỡng là từ chối.'),
      L('Verified credit history counts: a record of serious default (Vietnam’s CIC group 3 and worse) is a decline.', 'Lịch sử tín dụng đã xác minh được tính đến: nợ xấu nghiêm trọng (tương đương CIC nhóm 3 trở lên) là từ chối.'),
    ],
    scenarios: ['bnpl-approve-400', 'bnpl-decline-dti', 'bnpl-decline-cic', 'card-late-fee'],
    tags: T('NCCP', 'responsible lending', 'cho vay có trách nhiệm', 'BNPL', 'DTI', 'ASIC', 'Úc'),
  },
  {
    id: 'au-rg-209',
    kind: 'standard',
    jurisdiction: 'AU',
    number: N('ASIC RG 209'),
    title: L('ASIC Regulatory Guide 209 Credit licensing: Responsible lending conduct', 'Hướng dẫn RG 209 của ASIC: Hành vi cho vay có trách nhiệm'),
    issuer: 'ASIC',
    issued: '12/2019',
    effective: '12/2019',
    summary: L('How ASIC expects lenders to meet the NCCP responsible lending obligations in practice: scale the inquiries to the risk, use real data on income and expenses, and keep records of the assessment.', 'Cách ASIC kỳ vọng bên cho vay thực hiện nghĩa vụ cho vay có trách nhiệm theo Luật NCCP: mức độ tìm hiểu tương xứng rủi ro, dùng dữ liệu thực về thu nhập và chi tiêu, và lưu hồ sơ đánh giá.'),
    keyPoints: [
      L('Benchmarks such as an expense index are a check, not a substitute for the customer’s real expenses.', 'Chỉ số chuẩn như chỉ số chi tiêu chỉ để đối chiếu, không thay cho chi tiêu thực của khách.'),
      L('Record why the credit was found not unsuitable, or why it was refused.', 'Lưu lại lý do khoản vay được đánh giá phù hợp, hoặc lý do bị từ chối.'),
    ],
    scenarios: ['bnpl-approve-400', 'bnpl-decline-dti', 'bnpl-decline-cic'],
    tags: T('RG 209', 'ASIC', 'responsible lending', 'cho vay có trách nhiệm', 'thẩm định', 'Úc'),
  },
  {
    id: 'au-epayments-code',
    kind: 'standard',
    jurisdiction: 'AU',
    number: N('ePayments Code'),
    title: L('ePayments Code (ASIC)', 'Bộ quy tắc Thanh toán điện tử ePayments (ASIC)'),
    issuer: 'ASIC',
    issued: '2016',
    effective: '02/06/2022',
    status: L('Updated in 2022; subscribed to by Australian banks.', 'Được cập nhật năm 2022; các ngân hàng Úc tham gia áp dụng.'),
    summary: L('The consumer protection rules for electronic payments: who bears the loss of an unauthorised transaction, and the process for a mistaken internet payment sent to the wrong account.', 'Quy tắc bảo vệ người tiêu dùng trong thanh toán điện tử: ai chịu tổn thất khi giao dịch không được phép, và quy trình xử lý khoản chuyển nhầm sang tài khoản khác.'),
    keyPoints: [
      L('A mistaken payment is recovered from the unintended recipient’s bank when the funds are still there.', 'Khoản chuyển nhầm được thu hồi qua ngân hàng của người nhận nhầm khi tiền vẫn còn trong tài khoản.'),
      L('If the recipient has already withdrawn the funds, the bank cannot force a return: the claim fails and the customer is pointed to other remedies.', 'Nếu người nhận đã rút tiền, ngân hàng không thể buộc hoàn trả: yêu cầu không thành và khách được hướng dẫn biện pháp khác.'),
    ],
    scenarios: ['claim-return', 'claim-rejected', 'otp-locked', 'token-45'],
    tags: T('ePayments Code', 'mistaken payment', 'chuyển nhầm', 'unauthorised', 'tra soát', 'ASIC', 'Úc'),
  },
  {
    id: 'au-afca-rules',
    kind: 'standard',
    jurisdiction: 'AU',
    number: N('AFCA Rules'),
    title: L('AFCA Complaint Resolution Scheme Rules', 'Quy tắc giải quyết khiếu nại của AFCA'),
    issuer: 'AFCA',
    issued: '2018',
    effective: '01/11/2018',
    summary: L('A customer who is not satisfied with the bank’s internal dispute resolution (IDR) can take a banking complaint, a disputed card transaction or a refused chargeback to AFCA for free. A determination the customer accepts binds the bank.', 'Khách không hài lòng với quy trình giải quyết khiếu nại nội bộ (IDR) của ngân hàng có thể đưa khiếu nại, giao dịch thẻ tranh chấp hay yêu cầu hoàn tiền bị từ chối lên AFCA miễn phí. Quyết định mà khách chấp nhận có tính ràng buộc với ngân hàng.'),
    keyPoints: [
      L('The bank answers through its own IDR first: within 30 calendar days for most complaints (ASIC RG 271).', 'Ngân hàng giải quyết qua IDR trước: trong 30 ngày theo lịch với đa số khiếu nại (ASIC RG 271).'),
      L('A rejected claim is a final IDR response, and it must tell the customer they can go to AFCA.', 'Yêu cầu bị từ chối là phản hồi IDR cuối cùng, và phải thông báo khách có quyền khiếu nại lên AFCA.'),
    ],
    scenarios: ['claim-return', 'claim-rejected', 'atm-jam-200'],
    tags: T('AFCA', 'complaint', 'khiếu nại', 'dispute', 'chargeback', 'IDR', 'RG 271', 'Úc'),
  },
];

export const KIND_LABEL: Readonly<Record<RegKind, Localized<string>>> = {
  law: L('Law', 'Luật'),
  decree: L('Decree', 'Nghị định'),
  circular: L('Circular', 'Thông tư'),
  decision: L('Decision', 'Quyết định'),
  standard: L('Standard', 'Tiêu chuẩn'),
  basel: L('Basel', 'Basel'),
  accounting: L('Accounting standard', 'Chuẩn mực kế toán'),
};

export const JURISDICTION_LABEL: Readonly<Record<Jurisdiction, Localized<string>>> = {
  VN: L('Vietnam', 'Việt Nam'),
  INTL: L('International', 'Quốc tế'),
  AU: L('Australia', 'Úc'),
};

export const regDocById = (id: string): RegDocument | undefined => REG_DOCUMENTS.find((d) => d.id === id);

/** Folds a string for searching: lower case, no Vietnamese diacritics (đ becomes d), so "thong tu 18" finds "Thông tư 18/2024". */
export function foldSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/** Every word of a document a search can match: its number in both spellings, titles, summaries, points, issuer, tags. */
function haystack(d: RegDocument, scenarioLabel: (id: DemoActionId) => string): string {
  const issuer = regulatorById(d.issuer);
  const parts = [
    d.number.en,
    d.number.vi,
    d.number.vi.replace(/[/-]/g, ' '),
    d.title.en,
    d.title.vi,
    d.summary.en,
    d.summary.vi,
    ...d.keyPoints.flatMap((p) => [p.en, p.vi]),
    d.status?.en ?? '',
    d.status?.vi ?? '',
    KIND_LABEL[d.kind].en,
    KIND_LABEL[d.kind].vi,
    JURISDICTION_LABEL[d.jurisdiction].en,
    JURISDICTION_LABEL[d.jurisdiction].vi,
    issuer?.short ?? '',
    issuer?.name.en ?? '',
    issuer?.name.vi ?? '',
    ...(d.regulator ? [regulatorById(d.regulator)?.short ?? '', regulatorById(d.regulator)?.name.en ?? '', regulatorById(d.regulator)?.name.vi ?? ''] : []),
    d.effective,
    d.issued ?? '',
    d.tags.vi,
    ...d.scenarios.map(scenarioLabel),
  ];
  return foldSearch(parts.join(' \u0001 '));
}

export interface RegSearch {
  query: string;
  kinds?: readonly RegKind[];
  jurisdictions?: readonly Jurisdiction[];
}

/**
 * The documents that match a search, best first. Every word of the query must appear somewhere in the document (in either language,
 * accents optional); a hit in the number or the title ranks above one in the body.
 */
export function searchRegistry(search: RegSearch, scenarioLabel: (id: DemoActionId) => string = (id) => id): RegDocument[] {
  const words = foldSearch(search.query).split(/\s+/).filter(Boolean);
  const kinds = search.kinds?.length ? new Set(search.kinds) : null;
  const places = search.jurisdictions?.length ? new Set(search.jurisdictions) : null;
  const scored: { d: RegDocument; score: number; i: number }[] = [];
  REG_DOCUMENTS.forEach((d, i) => {
    if (kinds && !kinds.has(d.kind)) return;
    if (places && !places.has(d.jurisdiction)) return;
    if (words.length === 0) {
      scored.push({ d, score: 0, i });
      return;
    }
    const all = haystack(d, scenarioLabel);
    if (!words.every((w) => all.includes(w))) return;
    const head = foldSearch(`${d.number.vi} ${d.number.vi.replace(/[/-]/g, ' ')} ${d.title.en} ${d.title.vi}`);
    const score = words.reduce((s, w) => s + (head.includes(w) ? 3 : 1), 0);
    scored.push({ d, score, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((x) => x.d);
}

/** The regulators whose name, short name or role matches a search. */
export function searchRegulators(query: string): RegulatorInfo[] {
  const words = foldSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...REGULATORS];
  return REGULATORS.filter((r) => {
    const all = foldSearch([r.short, r.name.en, r.name.vi, r.role.en, r.role.vi, r.website].join(' '));
    return words.every((w) => all.includes(w));
  });
}

/** The Australian authorities the registry maps scenarios to; a document belongs to one when it issued or enforces it. */
export const AU_AUTHORITIES = ['AUSTRAC', 'APRA', 'ASIC', 'AFCA'] as const;
export const documentsOfAuthority = (id: string): RegDocument[] => REG_DOCUMENTS.filter((d) => d.issuer === id || d.regulator === id);

/** The documents a demo button is grounded in: what the inspector or a lesson can point to. */
export const documentsForScenario = (id: DemoActionId): RegDocument[] => REG_DOCUMENTS.filter((d) => d.scenarios.includes(id));

// Where to read a document's official text

/**
 * The page that holds the document itself, where one is stable and known: the standard setter's own page, or the Federal Register
 * of Legislation's "latest" compilation of an Australian Act. Every other document (the Vietnamese laws, decrees and circulars,
 * whose official copies live in the National Legal Database vbpl.vn, the Government portal and the SBV's site) is found by number.
 */
export const SOURCE_URLS: Readonly<Record<string, string>> = {
  'basel-ii': 'https://www.bis.org/publ/bcbs128.htm',
  'basel-iii': 'https://www.bis.org/bcbs/basel3.htm',
  'bcbs-248': 'https://www.bis.org/publ/bcbs248.htm',
  'ifrs-9': 'https://www.ifrs.org/issued-standards/list-of-standards/ifrs-9-financial-instruments/',
  'ifrs-15': 'https://www.ifrs.org/issued-standards/list-of-standards/ifrs-15-revenue-from-contracts-with-customers/',
  'iso-8583': 'https://www.iso.org/standard/31628.html',
  'iso-20022': 'https://www.iso20022.org/',
  'emv-3ds': 'https://www.emvco.com/emv-technologies/3-d-secure/',
  'pci-dss': 'https://www.pcisecuritystandards.org/document_library/',
  'fatf-recs': 'https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Fatf-recommendations.html',
  'au-amlctf-2006': 'https://www.legislation.gov.au/C2006A00169/latest',
  'au-ttr': 'https://www.legislation.gov.au/C2006A00169/latest',
  'au-smr': 'https://www.legislation.gov.au/C2006A00169/latest',
  'au-ifti': 'https://www.legislation.gov.au/C2006A00169/latest',
  'au-austrac-rules': 'https://www.legislation.gov.au/F2007L01000/latest',
  'au-banking-act-1959': 'https://www.legislation.gov.au/C1959A00006/latest',
  'au-corps-act-2001': 'https://www.legislation.gov.au/C2004A00818/latest',
  'au-nccp-2009': 'https://www.legislation.gov.au/C2009A00134/latest',
  'au-rg-209': 'https://asic.gov.au/regulatory-resources/find-a-document/regulatory-guides/rg-209-credit-licensing-responsible-lending-conduct/',
  'au-epayments-code': 'https://asic.gov.au/regulatory-resources/financial-services/epayments-code/',
};

/** The official portals a Vietnamese document is looked up on: the National Legal Database first, then the issuers' own sites, then the most complete public library of legal texts. */
const VN_SOURCES = ['vbpl.vn', 'chinhphu.vn', 'sbv.gov.vn', 'thuvienphapluat.vn'] as const;

const hostOf = (url: string): string => url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

export interface SourceLink {
  url: string;
  /** True when it opens the document's own page; false when it is a search for its number on the official portals. */
  direct: boolean;
  /** Where it leads, for the tooltip: a host, or the hosts searched. */
  where: string;
}

/** Where the learner reads the official text of `doc`: its own page when known, else a search for its exact number on the official portals. Always an absolute https URL. */
export function sourceLink(doc: RegDocument): SourceLink {
  const known = SOURCE_URLS[doc.id];
  if (known) return { url: known, direct: true, where: hostOf(known) };
  const issuer = regulatorById(doc.issuer);
  const sites: readonly string[] = doc.jurisdiction === 'VN' ? VN_SOURCES : issuer ? [hostOf(issuer.website)] : [];
  const query = `"${doc.number.vi}" ${sites.map((h) => `site:${h}`).join(' OR ')}`.trim();
  return { url: `https://www.google.com/search?q=${encodeURIComponent(query)}`, direct: false, where: sites.join(', ') };
}
