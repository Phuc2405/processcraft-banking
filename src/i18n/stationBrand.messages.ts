import { defineMessages } from '../utils/i18nHelper';
import type { StationId } from '../sim/topology';

/**
 * Desks whose name depends on the market: one global rail name per language, plus a caption naming the local brands.
 * Applies in both vocabularies (Fintech Expert and Concept Explorer).
 */
export const stationBrandMessages = defineMessages('stationBrand', {
  a2a_title: { en: 'Instant Bank Transfer (PayID / Real-Time Rail)', vi: 'Chuyển tiền Tức thời (Napas247 / VietQR)' },
  a2a_short: { en: 'Instant A2A', vi: 'Chuyển tiền 24/7' },
  a2a_caption: { en: 'Real-time account-to-account & dynamic QR rail', vi: 'Hạ tầng chuyển tiền nhanh & mã QR nội địa' },
  a2a_tip: {
    en: 'Real-time domestic Account-to-Account (A2A) bank transfer rail. Brand implementations vary globally: PayID/NPP (Australia), FedNow/Zelle (USA), UPI (India), Napas247/VietQR (Vietnam).',
    vi: 'Hạ tầng chuyển tiền tức thời từ Tài khoản sang Tài khoản (A2A - Account to Account) 24/7 nội địa. Tùy thuộc vào từng quốc gia, hệ thống này có tên gọi thương hiệu riêng: Napas247/VietQR (Việt Nam), PayID/NPP (Úc), FedNow/Zelle (Mỹ), UPI (Ấn Độ)...',
  },
});

type BrandKey = 'a2a';

export const STATION_BRAND: Readonly<Partial<Record<StationId, BrandKey>>> = { GATE_A2A: 'a2a' };
