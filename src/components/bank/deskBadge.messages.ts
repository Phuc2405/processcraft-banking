import { defineMessages } from '../../utils/i18nHelper';

/** The desks' badges, in 2D and 3D: "X waiting · Y working", how many wait and how many are working a case right now. */
export const deskBadgeMessages = defineMessages('deskBadge', {
  working: { en: '{n} working', vi: '{n} đang xử lý' },
  workingHint: { en: 'A case is being worked on at the counter right now', vi: 'Một hồ sơ đang được xử lý tại quầy ngay lúc này' },
});
