import { defineMessages } from '../../../utils/i18nHelper';

/** Every painted sign in the 3D office, in both languages: a sign re-renders its texture when the language changes. */
export const signMessages = defineMessages('signs3d', {
  mainEntrance: { en: 'MAIN ENTRANCE', vi: 'CỬA CHÍNH' },
  riskVault: { en: 'RISK VAULT', vi: 'KHO RỦI RO' },
  mainVault: { en: 'MAIN VAULT · 1111', vi: 'KHO QUỸ TRUNG TÂM · 1111' },
  coreServers: { en: 'CORE SERVERS', vi: 'MÁY CHỦ LÕI' },
  security: { en: 'SECURITY', vi: 'BẢO VỆ' },
  citBay: { en: 'CIT LOADING BAY', vi: 'SẢNH GIAO NHẬN CIT' },
  cityPark: { en: 'CITY PARK', vi: 'CÔNG VIÊN' },
  parking: { en: 'P  CARS · MOTORBIKES', vi: 'P  Ô TÔ · XE MÁY' },
  atm24: { en: 'ATM  ·  24 HOURS', vi: 'ATM  ·  24 GIỜ' },
  atmCash: { en: 'ATM · CASH', vi: 'ATM · TIỀN MẶT' },
  atmPin: { en: 'ATM · PIN', vi: 'ATM · PIN' },
});

export type SignKey = keyof typeof signMessages.messages;
