import { defineMessages } from '../../utils/i18nHelper';

/** The desks' badges, in 2D and 3D: what is waiting and whether a case is being worked on right now. */
export const deskBadgeMessages = defineMessages('deskBadge', {
  working: { en: 'Working', vi: 'Đang xử lý' },
  workingHint: { en: 'A case is being worked on at the counter right now', vi: 'Một hồ sơ đang được xử lý tại quầy ngay lúc này' },
});
