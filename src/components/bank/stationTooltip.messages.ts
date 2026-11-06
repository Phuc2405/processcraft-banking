import { defineMessages } from '../../utils/i18nHelper';

/** The one hover card (StationTooltip): its context banner's words. */
export const stationTooltipMessages = defineMessages('stationTooltip', {
  process: { en: '📌 Process', vi: '📌 Quy trình' },
  step: { en: '👉 Step', vi: '👉 Bước' },
  passes: { en: 'Passes when', vi: 'Đi tiếp khi' },
  declines: { en: 'Declines when', vi: 'Từ chối khi' },
  total: { en: 'Total so far', vi: 'Tổng đến lúc này' },
});
