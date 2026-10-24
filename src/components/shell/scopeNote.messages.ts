import { defineMessages } from '../../utils/i18nHelper';

/** The simulation-scope disclaimer shown under the walkthrough and in the Welcome modal. */
export const scopeNoteMessages = defineMessages('scopeNote', {
  label: { en: 'About this simulation', vi: 'Về mô phỏng này' },
  text: {
    en: 'Simulates ~80% of core real-world banking workflows and scenarios. Production environments may include additional legacy edge cases.',
    vi: 'Sa bàn mô phỏng ~80% các quy trình & kịch bản cốt lõi trong ngân hàng thực tế. Các hệ thống vận hành thực tế có thể có thêm quy tắc ngoại lệ phức tạp hơn.',
  },
});
