import { useLocale } from '../../i18n/locale';
import type { ActorStatus } from '../../sim/actorStatus';
import { STATUS_TEXT } from './personStatus';

/**
 * The status over anyone's head on the 2D map, whatever brought them there (a counter, an ATM, the CIT bay): "Đang đến quầy",
 * "Đang xử lý…", "Hoàn tất ✓". Each actor maps its own phases through sim/actorStatus.ts; the 3D office draws the same words (PeopleTags3D).
 */
export function ActorStatusBadge({ status }: { status: ActorStatus }) {
  const locale = useLocale();
  return (
    <span className="bk-visit-status" data-status={status} aria-hidden="true">
      {STATUS_TEXT[status][locale]}
    </span>
  );
}
