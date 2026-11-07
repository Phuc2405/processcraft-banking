import { defineMessages } from '../../utils/i18nHelper';

/** The Inspector's knowledge tiers: the everyday picture (both vocabularies) and the Expert view's technical deep-dive. */
export const placeKnowledgeMessages = defineMessages('placeKnowledge', {
  thinkOfItLike: { en: 'Think of it like', vi: 'Hãy hình dung như · Ẩn dụ đời sống' },
  deepDive: { en: '⚡ Technical & process deep-dive', vi: '⚡ Phân tích kỹ thuật & quy trình chuyên sâu' },
  aspect_message: { en: 'Message & fields', vi: 'Thông điệp & trường dữ liệu' },
  aspect_ledger: { en: 'Ledger, posting & locking', vi: 'Sổ cái, hạch toán & khóa dữ liệu' },
  aspect_compliance: { en: 'Regulatory hooks', vi: 'Căn cứ tuân thủ & quy định' },
});
