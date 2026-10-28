import { defineMessages } from '../../utils/i18nHelper';

/** The Knowledge Base window: its chrome and the labels of the generated tables. Article prose lives in data/knowledgeBase.ts. */
export const knowledgeBaseMessages = defineMessages('knowledgeBase', {
  title: { en: '📖 Knowledge Base', vi: '📖 Thư viện kiến thức' },
  subtitle: { en: 'Reference articles behind the desks and the core ledger', vi: 'Bài viết tham khảo về các quầy nghiệp vụ và sổ cái lõi' },
  onThisPage: { en: 'On this page', vi: 'Nội dung' },
  equation: { en: 'Assets = Liabilities + Equity', vi: 'Tài sản = Nợ phải trả + Vốn chủ sở hữu' },
  colSide: { en: 'Account group', vi: 'Nhóm tài khoản' },
  colDebit: { en: 'A debit (Dr)…', vi: 'Ghi Nợ (Dr)…' },
  colCredit: { en: 'A credit (Cr)…', vi: 'Ghi Có (Cr)…' },
  colCode: { en: 'GL', vi: 'Số hiệu' },
  colAccount: { en: 'Account', vi: 'Tài khoản' },
  colPlain: { en: 'In plain words', vi: 'Diễn giải đơn giản' },
  colType: { en: 'Type', vi: 'Loại' },
  typeOperational: { en: 'Operational', vi: 'Nghiệp vụ' },
  typeIntermediate: { en: 'Intermediate', vi: 'Trung gian' },
  typeIntermediateHint: { en: 'Holds money in between, until a fact is known. A healthy one drains back to zero.', vi: 'Giữ tiền tạm thời cho đến khi có thông tin. Tài khoản lành mạnh sẽ trở về số dư 0.' },
  step: { en: 'Step {n}', vi: 'Bước {n}' },
  viewLabel: { en: 'Glossary view', vi: 'Chế độ xem bảng' },
  viewBasic: { en: '🔰 Basic', vi: '🔰 Cơ bản' },
  viewAdvanced: { en: '🔬 Advanced', vi: '🔬 Chuyên sâu' },
  viewAdvancedHint: { en: 'Adds when each account is posted and its typical Debit/Credit journal, read from the simulator’s own postings.', vi: 'Thêm thời điểm mỗi tài khoản được hạch toán và bút toán Nợ/Có điển hình, lấy từ chính các bút toán của trình mô phỏng.' },
  colTrigger: { en: 'When does it happen? (trigger event)', vi: 'Khi nào xảy ra? (Trigger event)' },
  colEntry: { en: 'Contra entry (Dr/Cr)', vi: 'Bút toán đối ứng (Dr/Cr)' },
  triggerCrisis: { en: 'Emergency Crisis Queue', vi: 'Hàng chờ Cứu hộ' },
  triggerOpening: { en: 'Opening balance only: no desk decision posts here', vi: 'Chỉ có số dư đầu kỳ: không quyết định nào tại quầy hạch toán vào đây' },
  close: { en: 'Close', vi: 'Đóng' },
});

export type KnowledgeBaseKey = keyof typeof knowledgeBaseMessages.messages;
