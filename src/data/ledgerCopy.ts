/**
 * Everything the ledger drawer says. One `Localized` table, so a second language is one more entry and no component changes.
 * The names of the accounts and the memo on each line come from the engine (engine/ledger.ts, engine/postings.ts).
 */

import { pick, type Localized } from '../i18n/locale';
import type { PostingKind } from '../types/processLearning';

export interface LedgerUi {
  title: string;
  /** One sentence under the title: what double entry is. */
  lede: string;
  empty: string;
  emptyLab: string;
  debit: string;
  credit: string;
  debitShort: string;
  creditShort: string;
  amount: string;
  entries: (n: number) => string;
  transaction: string;
  trialBalance: string;
  account: string;
  totalDebits: string;
  totalCredits: string;
  balanced: string;
  outOfBalance: string;
  everyLineBalances: string;
  replaySource: string;
  gradedSource: string;
  noGraded: string;
  declinedNothing: string;
  /** "3 payments, 5 lines" */
  summary: (payments: number, lines: number) => string;
  /** The Living Bank's drawer. */
  bank: {
    button: string;
    buttonTitle: string;
    close: string;
    title: string;
    lede: string;
    /** Nothing has finished yet today. */
    quiet: string;
    /** "Showing the latest 40 of 812 lines. The trial balance below adds up all 812." */
    showing: (shown: number, total: number) => string;
    /** The title of one block of lines, from the transaction id: "Payment d1-0287", "Overnight settlement of d1-0287". */
    payment: (txId: string) => string;
    /** "1,419 transactions, 1,482 lines" */
    summary: (transactions: number, lines: number) => string;
    /** "Settled at 23:10" */
    postedAt: (clock: string) => string;
    allBalance: string;
  };
}

interface LedgerBook {
  ui: LedgerUi;
  kinds: Record<PostingKind, string>;
}

const EN: LedgerBook = {
  ui: {
    title: 'Live double-entry mini ledger',
    lede: 'Every movement of money is written twice: once as a debit to one account, once as a credit to another, for the same amount. Add up every debit and every credit and the totals must match.',
    empty: 'Nothing has been posted yet.',
    emptyLab: 'Replay a test payment on the canvas, or press Submit. When a payment finishes, the lines it posts to the general ledger appear here.',
    debit: 'Debit',
    credit: 'Credit',
    debitShort: 'Dr',
    creditShort: 'Cr',
    amount: 'Amount',
    entries: (n) => `${n} line${n === 1 ? '' : 's'}`,
    transaction: 'Payment',
    trialBalance: 'Trial balance',
    account: 'Account',
    totalDebits: 'Total debits',
    totalCredits: 'Total credits',
    balanced: 'Balanced',
    outOfBalance: 'Out of balance',
    everyLineBalances: 'Every payment balances on its own.',
    replaySource: 'This replay',
    gradedSource: 'Every graded test',
    noGraded: 'Press Submit to grade the diagram. The lines each visible test would post appear here.',
    declinedNothing: 'This payment moved no money, so it posted nothing.',
    summary: (payments, lines) => `${payments} payment${payments === 1 ? '' : 's'}, ${lines} line${lines === 1 ? '' : 's'}`,
    bank: {
      button: 'Ledger',
      buttonTitle: 'Open the live double-entry ledger: every payment that finishes today writes its lines here',
      close: 'Close the ledger',
      title: 'Live double-entry mini ledger',
      lede: 'Each payment that finishes writes its money movements here, a debit and a credit of the same amount. The trial balance adds up the whole day and must always agree.',
      quiet: 'No payment has finished yet today. Press play and the lines will appear here as customers are approved, settled or cleared.',
      showing: (shown, total) => (shown >= total ? `All ${total} line${total === 1 ? '' : 's'} so far.` : `Showing the latest ${shown} of ${total} lines. The trial balance adds up all ${total}.`),
      payment: (txId) => {
        const base = txId.replace(/-CLR$/, '').replace(/^tx_/, '');
        if (txId.endsWith('-CLR')) return `Suspense paid out for ${base}`;
        return txId.startsWith('tx_') ? `Overnight settlement of ${base}` : `Payment ${base}`;
      },
      summary: (transactions, lines) => `${transactions.toLocaleString('en-US')} transaction${transactions === 1 ? '' : 's'}, ${lines.toLocaleString('en-US')} line${lines === 1 ? '' : 's'}`,
      postedAt: (clock) => `posted ${clock}`,
      allBalance: 'Every payment balances on its own, and so does the day.',
    },
  },
  kinds: {
    AUTH_HOLD: 'Authorisation hold',
    HOLD_RELEASE: 'Hold released',
    BNPL_FINANCING: 'Pay-in-4 financing',
    CAPTURE: 'Captured',
    SETTLEMENT: 'Settled',
    SUSPENSE_BREAK: 'Break parked in suspense',
    FX_VARIANCE: 'Exchange-rate difference',
    SUSPENSE_CLEARED: 'Suspense cleared',
    A2A_PAYMENT: 'Bank-to-bank payment',
    A2A_QUEUED: 'Queued payment',
    PAYMENT_EXECUTED: 'Queued payment sent',
    AML_RESTRAIN: 'Funds frozen',
    AML_RELEASE: 'Funds released',
    PROVISIONAL_CREDIT: 'Provisional credit',
    DISPUTE_RECOVERY: 'Recovered from scheme',
    DISPUTE_REVERSAL: 'Credit reversed',
    ISSUER_LOSS: 'Written off',
    ATM_DISPENSE: 'ATM cash out',
    ATM_JAM: 'ATM jam parked in suspense',
    ATM_REFUND: 'ATM jam refunded',
    ATM_DEPOSIT: 'Cash deposited',
    CHARGEBACK_REVERSAL: 'Chargeback reversal',
    TELLER_DEPOSIT: 'Teller cash deposit',
    TELLER_WITHDRAWAL: 'Teller cash withdrawal',
    SWIFT_REMITTANCE: 'SWIFT remittance sent',
    ATM_MISMATCH_REFUND: 'ATM mismatch refunded',
    PAYMENT_RETURN: 'pacs.004 return credited',
    OPENING_DEPOSIT: 'Opening deposit',
  },
};

const VI: LedgerBook = {
  ui: {
    title: 'Sổ cái kép trực tiếp',
    lede: 'Mỗi lần tiền dịch chuyển được ghi hai lần: một bút Nợ vào một tài khoản và một bút Có vào tài khoản khác, cùng số tiền. Cộng tất cả bút Nợ và bút Có thì hai tổng phải bằng nhau.',
    empty: 'Chưa có bút toán nào được ghi.',
    emptyLab: 'Chạy lại một giao dịch thử trên sơ đồ, hoặc bấm Nộp bài. Khi giao dịch hoàn tất, các bút toán nó ghi vào sổ cái sẽ hiện ở đây.',
    debit: 'Nợ',
    credit: 'Có',
    debitShort: 'Nợ',
    creditShort: 'Có',
    amount: 'Số tiền',
    entries: (n) => `${n} bút toán`,
    transaction: 'Giao dịch',
    trialBalance: 'Bảng cân đối thử',
    account: 'Tài khoản',
    totalDebits: 'Tổng Nợ',
    totalCredits: 'Tổng Có',
    balanced: 'Cân bằng',
    outOfBalance: 'Lệch',
    everyLineBalances: 'Từng giao dịch đều tự cân bằng.',
    replaySource: 'Lần chạy lại này',
    gradedSource: 'Mọi bài kiểm tra đã chấm',
    noGraded: 'Bấm Nộp bài để chấm sơ đồ. Các bút toán mà mỗi bài kiểm tra công khai sẽ ghi sẽ hiện ở đây.',
    declinedNothing: 'Giao dịch này không làm dịch chuyển tiền nên không ghi bút toán nào.',
    summary: (payments, lines) => `${payments} giao dịch, ${lines} bút toán`,
    bank: {
      button: 'Sổ cái',
      buttonTitle: 'Mở sổ cái kép trực tiếp: mọi giao dịch hoàn tất hôm nay đều ghi bút toán vào đây',
      close: 'Đóng sổ cái',
      title: 'Sổ cái kép trực tiếp',
      lede: 'Mỗi giao dịch hoàn tất ghi các dịch chuyển tiền của nó vào đây, một bút Nợ và một bút Có cùng số tiền. Bảng cân đối thử cộng dồn cả ngày và luôn phải khớp.',
      quiet: 'Hôm nay chưa có giao dịch nào hoàn tất. Bấm chạy và các bút toán sẽ hiện ở đây khi khách hàng được duyệt, quyết toán hoặc bù trừ.',
      showing: (shown, total) => (shown >= total ? `Toàn bộ ${total} bút toán đến lúc này.` : `Đang hiện ${shown} bút toán mới nhất trên tổng ${total}. Bảng cân đối thử cộng đủ cả ${total}.`),
      payment: (txId) => {
        const base = txId.replace(/-CLR$/, '').replace(/^tx_/, '');
        if (txId.endsWith('-CLR')) return `Chi trả từ tài khoản treo cho ${base}`;
        return txId.startsWith('tx_') ? `Quyết toán qua đêm của ${base}` : `Giao dịch ${base}`;
      },
      summary: (transactions, lines) => `${transactions.toLocaleString('vi-VN')} giao dịch, ${lines.toLocaleString('vi-VN')} bút toán`,
      postedAt: (clock) => `ghi lúc ${clock}`,
      allBalance: 'Từng giao dịch đều tự cân bằng, và cả ngày cũng vậy.',
    },
  },
  kinds: {
    AUTH_HOLD: 'Khoanh giữ cấp phép',
    HOLD_RELEASE: 'Giải tỏa khoanh giữ',
    BNPL_FINANCING: 'Tài trợ trả góp 4 kỳ',
    CAPTURE: 'Đã ghi nhận',
    SETTLEMENT: 'Đã quyết toán',
    SUSPENSE_BREAK: 'Sai lệch đưa vào tài khoản treo',
    FX_VARIANCE: 'Chênh lệch tỷ giá',
    SUSPENSE_CLEARED: 'Đã xử lý tài khoản treo',
    A2A_PAYMENT: 'Chuyển khoản liên ngân hàng',
    A2A_QUEUED: 'Lệnh chuyển đang xếp hàng',
    PAYMENT_EXECUTED: 'Đã gửi lệnh chuyển xếp hàng',
    AML_RESTRAIN: 'Phong tỏa tiền',
    AML_RELEASE: 'Giải tỏa tiền',
    PROVISIONAL_CREDIT: 'Ghi có tạm thời',
    DISPUTE_RECOVERY: 'Thu hồi từ tổ chức thẻ',
    DISPUTE_REVERSAL: 'Đảo bút ghi có',
    ISSUER_LOSS: 'Xóa sổ tổn thất',
    ATM_DISPENSE: 'Rút tiền mặt ATM',
    ATM_JAM: 'Kẹt tiền ATM đưa vào tài khoản treo',
    ATM_REFUND: 'Hoàn tiền kẹt ATM',
    ATM_DEPOSIT: 'Nộp tiền mặt',
    CHARGEBACK_REVERSAL: 'Đảo tiền tra soát (chargeback)',
    TELLER_DEPOSIT: 'Nộp tiền mặt tại quầy',
    TELLER_WITHDRAWAL: 'Rút tiền mặt tại quầy',
    SWIFT_REMITTANCE: 'Chuyển tiền quốc tế SWIFT',
    ATM_MISMATCH_REFUND: 'Hoàn tiền lệch ATM',
    PAYMENT_RETURN: 'Hoàn trả pacs.004',
    OPENING_DEPOSIT: 'Tiền gửi mở tài khoản',
  },
};

export const LEDGER_COPY: Localized<LedgerBook> = { en: EN, vi: VI };

const book = (): LedgerBook => pick(LEDGER_COPY);

export const ledgerUi = (): LedgerUi => book().ui;
export const postingKindLabel = (kind: PostingKind): string => book().kinds[kind];
