import { defineMessages } from '../../utils/i18nHelper';

/** The copy of the "Choose Your Experience Mode" chooser. Both languages are required for every key. */
export const welcomeMessages = defineMessages('welcomeModal', {
  badge: { en: 'Banking Digital Twin', vi: 'Bản sao số ngân hàng' },
  title: { en: 'Choose Your Experience Mode', vi: 'Chọn chế độ trải nghiệm' },
  intro: {
    en: 'A working bank runs here, minute by minute. Choose how to explore it. You can come back to this screen at any time with [🔄 Switch Experience Mode] in the header.',
    vi: 'Một ngân hàng đang vận hành từng phút ở đây. Hãy chọn cách bạn muốn khám phá. Bạn có thể quay lại màn hình này bất cứ lúc nào bằng nút [🔄 Đổi chế độ trải nghiệm] trên thanh tiêu đề.',
  },
  current: { en: 'Current', vi: 'Đang dùng' },
  recommended: { en: 'Recommended', vi: 'Khuyên dùng' },
  guidedTitle: { en: 'Guided Flow Explorer (Beginner)', vi: 'Khám phá luồng có hướng dẫn (Người mới)' },
  guidedBody: {
    en: 'Follow one payment story at a time, starting with a card tapped in a shop. Everything else fades back, and one click sends a test payment through.',
    vi: 'Theo dõi từng câu chuyện thanh toán một, bắt đầu với một lần chạm thẻ ở cửa hàng. Mọi thứ khác mờ đi, và một cú nhấp sẽ gửi một giao dịch thử đi qua.',
  },
  sandboxTitle: { en: 'Living Bank Sandbox (Advanced)', vi: 'Sa bàn ngân hàng sống (Nâng cao)' },
  sandboxBody: {
    en: 'The whole bank at once, with every desk, queue and wire lit. Run the day, change the rules, inject chaos and read the end-of-day report.',
    vi: 'Toàn bộ ngân hàng cùng lúc: mọi quầy, hàng chờ và đường truyền đều sáng. Chạy cả ngày, thay đổi quy tắc, gây sự cố, đọc báo cáo cuối ngày.',
  },
  academyTitle: { en: 'Banking Academy', vi: 'Học viện Ngân hàng' },
  academyBody: {
    en: 'Six chapters with guided walkthroughs and quizzes on tokenised cards, 3DS, Pay-in-4, the night cycle, instant transfers and AML.',
    vi: 'Sáu chương với hướng dẫn từng bước và câu hỏi: thẻ mã hóa, 3DS, trả góp 4 kỳ, chu kỳ ban đêm, chuyển khoản tức thì và phòng chống rửa tiền.',
  },
  roleplayTitle: { en: 'Interactive Staff Roleplay (7 Analyst Roles)', vi: 'Nhập vai Chuyên viên (7 Vai trò)' },
  roleplayBadge: { en: '[ 🧑‍💼 NEW FEATURE ]', vi: '[ 🧑‍💼 TÍNH NĂNG MỚI ]' },
  roleplayBody: {
    en: 'Step into the shoes of 7 specialized banking analysts (AML, eKYC, Fraud, Dispute, BNPL, Cashier, SWIFT). Inspect real-time flagged payloads, enforce SOP policies, and hit shift targets.',
    vi: 'Trực tiếp nhập vai 7 vị trí chuyên viên ngân hàng (AML, eKYC, Gian lận, Tra soát, BNPL, Thu ngân, SWIFT). Kiểm tra hồ sơ kẹt, thực thi quy trình SOP và hoàn thành mục tiêu ca làm việc.',
  },
  roleplayPick: { en: 'Choose a desk to start your shift', vi: 'Chọn quầy để bắt đầu ca làm việc' },
  escHint: { en: 'Press {key} to skip', vi: 'Nhấn {key} để bỏ qua' },
  skip: { en: 'Skip for now', vi: 'Để sau' },
});
