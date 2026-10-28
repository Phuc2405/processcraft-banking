import { defineMessages } from '../../utils/i18nHelper';

/** The shared Basic / Advanced switch (SegmentedToggle.tsx). */
export const viewModeMessages = defineMessages('viewMode', {
  label: { en: 'View', vi: 'Chế độ xem' },
  basic: { en: '🔰 Basic', vi: '🔰 Cơ bản' },
  advanced: { en: '🔬 Advanced', vi: '🔬 Chuyên sâu' },
  basicHint: { en: 'Plain-language descriptions instead of banking codes, made for beginners.', vi: 'Mô tả bằng ngôn ngữ đời thường thay cho mã nghiệp vụ, dành cho người mới.' },
  advancedHint: { en: 'Exact GL account numbers, Debit/Credit legs and raw system status codes (hover any code for its meaning).', vi: 'Số hiệu tài khoản GL, bút toán Nợ/Có và mã trạng thái gốc của hệ thống (rê chuột lên mã để xem giải thích).' },
});

/** The shared Standard / Expert terminology switch (SegmentedToggle.tsx DepthToggle): the header, the guided tour and the workspace. */
export const depthMessages = defineMessages('depthToggle', {
  label: { en: 'Terminology', vi: 'Thuật ngữ' },
  standard: { en: 'Standard', vi: 'Tiêu chuẩn' },
  expert: { en: 'Expert', vi: 'Chuyên gia' },
  standardHint: { en: 'Standard business descriptions in plain, everyday language anyone can follow.', vi: 'Mô tả nghiệp vụ tiêu chuẩn, ngôn ngữ phổ thông dễ hiểu.' },
  expertHint: { en: 'Deep technical codes: ISO 20022, pacs.008, SWIFT, MT/MX payload logic and ISO 8583 response codes.', vi: 'Mã kỹ thuật chuyên sâu: ISO 20022, pacs.008, SWIFT, logic payload MT/MX và mã phản hồi ISO 8583.' },
});
