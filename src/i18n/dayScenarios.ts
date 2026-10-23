import { defineMessages } from '../utils/i18nHelper';

/** The scripted Chaos Monkey days by name. The panel and the Ops feed both read these, so a day is called the same thing everywhere. */
export const dayScenarios = defineMessages('dayScenarios', {
  flashTitle: { en: 'Day 2: Flash Sale Traffic Spike', vi: 'Chiến dịch Black Friday & Tải đỉnh điểm Cổng thanh toán' },
  botnetTitle: { en: 'Day 3: Botnet CVV Brute-Force & Staff Fatigue', vi: 'Tấn công Mạng lưới Botnet dò thẻ & Nhân viên quá tải' },
});
