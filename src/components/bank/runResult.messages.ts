import { defineMessages } from '../../utils/i18nHelper';

/** The drawer's "📋 Process info / 📊 Run result" toggle. */
export const runResultMessages = defineMessages('runResult', {
  group: { en: 'Process info or run result', vi: 'Thông tin quy trình hoặc kết quả chạy' },
  sop: { en: 'Process info', vi: 'Thông tin quy trình' },
  result: { en: 'Run result', vi: 'Kết quả giao dịch' },
  lastRun: { en: 'Result of the most recent run: {name}', vi: 'Kết quả của lần chạy gần nhất: {name}' },
});
