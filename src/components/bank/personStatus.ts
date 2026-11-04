import type { VisitStatus } from '../../sim/deskVisit';

/** The words and colour of the status over a customer's head, the same on the 2D map and in the 3D office, at every counter. */
export const STATUS_TEXT: Readonly<Record<VisitStatus, { en: string; vi: string }>> = {
  arriving: { en: 'Arriving', vi: 'Đang đến quầy' },
  waiting: { en: 'Waiting', vi: 'Đang chờ' },
  processing: { en: 'Processing…', vi: 'Đang xử lý…' },
  done: { en: 'Done ✓', vi: 'Hoàn tất ✓' },
};

export const STATUS_COLOR: Readonly<Record<VisitStatus, string>> = { arriving: '#e2e8f0', waiting: '#cbd5e1', processing: '#fde68a', done: '#6ee7b7' };

/** The 3D label's box (the 2D map styles the same look in index.css, .bk-visit-status). */
export const TAG_STYLE = { whiteSpace: 'nowrap', borderRadius: 9999, padding: '1px 7px', fontSize: 11, fontWeight: 700, lineHeight: '15px', background: 'rgba(15,23,42,0.88)', boxShadow: '0 0 0 1px rgba(148,163,184,0.5)' } as const;
