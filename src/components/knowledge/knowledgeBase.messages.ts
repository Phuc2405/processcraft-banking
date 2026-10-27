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
  close: { en: 'Close', vi: 'Đóng' },
});

export type KnowledgeBaseKey = keyof typeof knowledgeBaseMessages.messages;
