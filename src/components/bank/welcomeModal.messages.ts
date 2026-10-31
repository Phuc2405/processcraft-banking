import { defineMessages } from '../../utils/i18nHelper';

/** The copy of the "Choose Your Experience Mode" chooser. Both languages are required for every key. A card's body has two lines: keep it under about 100 characters. */
export const welcomeMessages = defineMessages('welcomeModal', {
  badge: { en: 'Banking Digital Twin', vi: 'Bản sao số ngân hàng' },
  title: { en: 'Choose Your Experience Mode', vi: 'Chọn chế độ trải nghiệm' },
  intro: {
    en: 'A working bank runs here, minute by minute. Choose how to explore it; you can switch again any time from the header.',
    vi: 'Một ngân hàng đang vận hành từng phút ở đây. Hãy chọn cách khám phá; bạn có thể đổi lại bất cứ lúc nào trên thanh tiêu đề.',
  },
  current: { en: 'Current', vi: 'Đang dùng' },
  recommended: { en: 'Recommended', vi: 'Khuyên dùng' },
  guidedTitle: { en: 'Guided Flow Explorer (Beginner)', vi: 'Khám phá luồng có hướng dẫn (Người mới)' },
  guidedBody: {
    en: 'Follow one payment story at a time while the rest fades back. One click sends a test payment.',
    vi: 'Theo dõi từng câu chuyện thanh toán, phần còn lại mờ đi. Một cú nhấp gửi giao dịch thử.',
  },
  sandboxTitle: { en: 'Living Bank Sandbox (Advanced)', vi: 'Sa bàn ngân hàng sống (Nâng cao)' },
  sandboxBody: {
    en: 'The whole bank at once. Run the day, change the rules, inject chaos and read the report.',
    vi: 'Toàn bộ ngân hàng cùng lúc. Chạy cả ngày, đổi quy tắc, gây sự cố, đọc báo cáo cuối ngày.',
  },
  academyTitle: { en: 'Banking Academy', vi: 'Học viện Ngân hàng' },
  academyBody: {
    en: 'Six guided chapters with quizzes: tokenised cards, 3DS, Pay-in-4, EOD, instant transfers, AML.',
    vi: 'Sáu chương có hướng dẫn và câu hỏi: thẻ mã hóa, 3DS, trả góp, cuối ngày, chuyển tức thì, AML.',
  },
  roleplayTitle: { en: 'Interactive Staff Roleplay (7 Analyst Roles)', vi: 'Nhập vai Chuyên viên (7 Vai trò)' },
  roleplayBadge: { en: 'New', vi: 'Mới' },
  roleplayBody: {
    en: 'Work 7 analyst desks, from AML to SWIFT. Inspect flagged cases, apply SOPs, hit shift targets.',
    vi: 'Làm 7 vị trí chuyên viên, từ AML đến SWIFT. Kiểm tra hồ sơ kẹt, áp dụng SOP, đạt mục tiêu ca.',
  },
  roleplayPick: { en: 'Choose a desk to start your shift', vi: 'Chọn quầy để bắt đầu ca làm việc' },
  escHint: { en: 'Press {key} to skip', vi: 'Nhấn {key} để bỏ qua' },
  skip: { en: 'Skip for now', vi: 'Để sau' },
});
