import { defineMessages } from '../../utils/i18nHelper';

/** The walkthrough's chrome: the docked step column, the chapter chip and the test-scenario picker. */
export const walkMessages = defineMessages('walkthrough', {
  dockLabel: { en: 'Walkthrough step', vi: 'Bước hướng dẫn' },
  dockHeader: { en: 'Chapter {chapter} · Step details', vi: 'Chương {chapter} · Chi tiết bước' },
  dockWait: { en: 'Following the payment to the next desk…', vi: 'Đang theo giao dịch đến bàn tiếp theo…' },

  chip: { en: 'Chapter {chapter}: Step {step}/{total}', vi: 'Chương {chapter}: Bước {step}/{total}' },
  chipShow: { en: 'Show the step details', vi: 'Hiện chi tiết bước' },
  chipHide: { en: 'Hide the step details so the whole map can be seen', vi: 'Ẩn chi tiết bước để thấy toàn bộ bản đồ' },
  chipNew: { en: 'New step content is ready', vi: 'Nội dung bước mới đã sẵn sàng' },
  questionWaiting: { en: 'question waiting', vi: 'câu hỏi đang chờ' },

  scenarios: { en: 'Test Scenarios', vi: 'Kịch bản thử nghiệm' },
  scenarioCount: { en: '{n} test scenarios', vi: '{n} kịch bản thử nghiệm' },
  scenarioPick: { en: 'Choose a test scenario. {n} available, current: {current}', vi: 'Chọn kịch bản thử nghiệm. Có {n} kịch bản, đang chọn: {current}' },
  groupHappy: { en: 'Happy Path', vi: 'Luồng chuẩn (Happy Path)' },
  groupEdge: { en: 'Edge Cases & Exceptions', vi: 'Tình huống lỗi & Ngoại lệ (Edge Cases)' },
});
