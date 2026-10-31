/** The Phase 1/4 retail operations book in the app: the balances and tickets, the latest result, and the quiz XP already earned. */

import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Localized } from '../i18n/locale';
import type { PresetId } from '../sim/presets';
import { applyPresetJournal, decodeBook, openingBook, refillCassette, resolveTicket, runOpsAction, settleEod, transferToVault, type OpsActionId, type OpsBook, type OpsJournal, type OpsOutcome } from '../sim/retailOps';
import type { Outcome } from '../types/processLearning';
import { browserStorage, type KeyValueStorage } from './persistence';

export const RETAIL_OPS_KEY = 'processcraft:v1:retail-ops';

/** The XP a quiz question pays, once, the first time it is answered correctly. */
export const OPS_QUIZ_XP = 25;

export interface RetailOpsState {
  book: OpsBook;
  /** The result card's content: the latest click or follow-up. */
  last: OpsOutcome | null;
  /** The payment the latest result belongs to, so the inspector shows it only on that one. */
  lastTxId: string | null;
  setLastTx(id: string | null): void;
  /** The quiz questions that have already paid their XP. */
  quizAwarded: readonly string[];
  runAction(id: OpsActionId, at: string): void;
  /** A core preset on this book, with the outcome the bank's rules decided. */
  applyPreset(id: Exclude<PresetId, 'eod'>, outcome: Outcome, at: string): void;
  settleEod(at: string): void;
  transferToVault(at: string): void;
  refillCassette(at: string): void;
  resolveTicket(ticketId: string, finding: 'REFUNDED' | 'DISPENSED', at: string): void;
  /** Books a quiz answer and returns the XP it earned: nothing for a wrong answer or a question already paid. */
  answerQuiz(questionId: string, correct: boolean): number;
  /** Back to the opening balances. Quiz progress is kept. */
  reset(): void;
}

const followUp = (action: OpsJournal['source'], journal: OpsJournal | null, message: Localized<string>): OpsOutcome => ({ action, status: 'APPROVED', message, journal });

function load(storage: KeyValueStorage | null): Pick<RetailOpsState, 'book' | 'quizAwarded'> {
  try {
    const raw = storage?.getItem(RETAIL_OPS_KEY) ?? null;
    const parsed = raw ? (JSON.parse(raw) as { book?: unknown; quizAwarded?: unknown }) : null;
    const awarded = Array.isArray(parsed?.quizAwarded) ? parsed.quizAwarded.filter((q): q is string => typeof q === 'string') : [];
    return { book: decodeBook(parsed?.book) ?? openingBook(), quizAwarded: awarded };
  } catch {
    return { book: openingBook(), quizAwarded: [] };
  }
}

export function createRetailOpsStore(options: { storage?: KeyValueStorage | null } = {}): StoreApi<RetailOpsState> {
  const storage = options.storage === undefined ? browserStorage() : options.storage;

  const save = (s: Pick<RetailOpsState, 'book' | 'quizAwarded'>): void => {
    try {
      storage?.setItem(RETAIL_OPS_KEY, JSON.stringify({ book: s.book, quizAwarded: s.quizAwarded }));
    } catch {
      // Remembering it is a nicety: the book still works for this visit.
    }
  };

  return createStore<RetailOpsState>()((set, get) => {
    const apply = (book: OpsBook, last: OpsOutcome): void => {
      set({ book, last });
      save(get());
    };
    return {
      ...load(storage),
      last: null,
      lastTxId: null,
      setLastTx: (id) => set({ lastTxId: id }),
      runAction: (id, at) => {
        const { book, outcome } = runOpsAction(get().book, id, at);
        apply(book, outcome);
      },
      applyPreset: (id, planned, at) => {
        const { book, outcome } = applyPresetJournal(get().book, id, planned, at);
        apply(book, outcome);
      },
      settleEod: (at) => {
        const { book, outcome } = settleEod(get().book, at);
        apply(book, outcome);
      },
      transferToVault: (at) => {
        const { book, journal } = transferToVault(get().book, at);
        apply(book, followUp('vault-transfer', journal, { en: 'The surplus is in the vault and the till is back at its float: the counter is open again.', vi: 'Phần dư đã về kho quỹ và ngăn kéo trở về mức quỹ đầu ca: quầy mở lại.' }));
      },
      refillCassette: (at) => {
        const { book, journal } = refillCassette(get().book, at);
        apply(book, followUp('cassette-refill', journal, { en: 'CIT refill done: the cassette is topped up from the vault and the alert has cleared.', vi: 'Đã tiếp quỹ CIT: hộp tiền được bổ sung từ kho quỹ và cảnh báo đã tắt.' }));
      },
      resolveTicket: (ticketId, finding, at) => {
        const { book, journal } = resolveTicket(get().book, ticketId, finding, at);
        if (!journal) return;
        apply(
          book,
          finding === 'REFUNDED'
            ? followUp('ticket-refund', journal, { en: 'The cash count shows the notes stayed in the machine: the customer is refunded and TK 2930 is cleared.', vi: 'Kiểm quỹ cho thấy tiền còn trong máy: hoàn tiền cho khách và tất toán TK 2930.' })
            : followUp('ticket-dispensed', journal, { en: 'The cash count shows the customer took the notes: they leave the cassette and TK 2930 is cleared.', vi: 'Kiểm quỹ cho thấy khách đã nhận tiền: tiền rời hộp tiền và tất toán TK 2930.' }),
        );
      },
      answerQuiz: (questionId, correct) => {
        if (!correct || get().quizAwarded.includes(questionId)) return 0;
        set({ quizAwarded: [...get().quizAwarded, questionId] });
        save(get());
        return OPS_QUIZ_XP;
      },
      reset: () => {
        set({ book: openingBook(), last: null, lastTxId: null });
        save(get());
      },
    };
  });
}

export const retailOpsStore = createRetailOpsStore();

export function useRetailOpsStore<T>(selector: (state: RetailOpsState) => T): T {
  return useStore(retailOpsStore, selector);
}
