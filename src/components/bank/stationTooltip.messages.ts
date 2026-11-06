import { defineMessages } from '../../utils/i18nHelper';

/** The one hover card (StationTooltip): its context banner's words. */
export const stationTooltipMessages = defineMessages('stationTooltip', {
  process: { en: '📌 Process', vi: '📌 Quy trình' },
  task: { en: '📌 Process task', vi: '📌 Tác vụ quy trình' },
  runHint: { en: '💡 Note: Press "Run Demo" on a scenario below to see the actual run.', vi: '💡 Ghi chú: Bấm "Thực hiện" kịch bản bên dưới để xem luồng chạy thực tế.' },
  scenarioStep: { en: '👉 [Scenario: {name}] - Step {n}/{total}:', vi: '👉 [Kịch bản: {name}] - Bước {n}/{total}:' },
  passes: { en: 'Passes when', vi: 'Đi tiếp khi' },
  declines: { en: 'Declines when', vi: 'Từ chối khi' },
  total: { en: 'Total so far', vi: 'Tổng đến lúc này' },
  ledger: { en: 'Core ledger', vi: 'Sổ cái lõi' },
  gl_FROZEN_ASSETS: { en: 'Frozen assets', vi: 'Tài sản phong tỏa' },
});
