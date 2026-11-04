import { useEffect, useRef } from 'react';
import { VISIT_2D } from '../../engine/plan/deskVisitPaths';
import { useLocale } from '../../i18n/locale';
import { statusOfPhase, visitFrame, type VisitFigure, type VisitWork } from '../../sim/deskVisit';
import { STATUS_TEXT } from './personStatus';
import { useStore } from 'zustand';
import { deskVisitStore, useDeskVisits, visitElapsed, type ActiveVisit } from '../../store/deskVisitStore';

/**
 * The people at the staffed counters (the teller, the disputes desk, the Savings Desk, the Collateral Vault and the Pay-in-4 appraisal
 * counter) on the 2D map. Every
 * one follows the same pattern: walk in, queue, work the case at the counter with a status over their head, walk out. They move by
 * writing to their elements each frame, so the map itself never redraws for them, and they hold still while the learner has paused.
 */

export const SHIRTS = ['#38bdf8', '#f59e0b', '#a78bfa', '#fb7185'] as const;
const OFFICER_SHIRT = '#1e3a8a';
const VISIT_ICON: Readonly<Record<VisitWork, string>> = { cash: '💵', dispute: '📨', close: '💰', lock: '🔒', liquidate: '⚖️', appraise: '📝', refuse: '⛔' };
/** The figure's size on the stage: big enough to follow at the default zoom. */
export const W = 24;
export const H = 32;


export function Person({ shirt, officer }: { shirt: string; officer: boolean }) {
  return (
    <svg width={W} height={H} viewBox="0 0 18 24" aria-hidden="true" className="bk-visit-body">
      <circle cx="9" cy="5" r="4" fill="#f1c9a5" stroke="#0b1120" strokeWidth="0.8" />
      <path d="M3 22V13a6 6 0 0 1 12 0v9z" fill={shirt} stroke="#0b1120" strokeWidth="0.8" />
      {officer && <path d="M9 9l-1.4 2 1.4 6 1.4-6z" fill="#fbbf24" />}
    </svg>
  );
}

function VisitCrew({ visit }: { visit: ActiveVisit }) {
  const { step } = visit;
  const geo = VISIT_2D[step.desk];
  const locale = useLocale();
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const keys = visitFrame(step, geo, 0).map((f) => f.key);

  useEffect(() => {
    let raf = 0;
    const paint = (f: VisitFigure): void => {
      const el = nodes.current.get(f.key);
      if (!el) return;
      el.style.display = f.phase ? '' : 'none';
      if (!f.phase) return;
      if (el.dataset.phase !== f.phase) {
        el.dataset.phase = f.phase;
        const label = el.querySelector<HTMLElement>('.bk-visit-status');
        const status = statusOfPhase(f.phase);
        if (label) {
          label.textContent = STATUS_TEXT[status][locale];
          label.dataset.status = status;
        }
      }
      el.style.transform = `translate(${f.at[0] - W / 2}px, ${f.at[1] - H / 2}px)`;
    };
    const frame = (): void => {
      visitFrame(step, geo, visitElapsed(visit)).forEach(paint);
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [step, geo, visit, locale]);

  return (
    <>
      {keys.map((key, i) => {
        const officer = key === 'officer';
        return (
          <div
            key={key}
            ref={(el) => {
              if (el) nodes.current.set(key, el);
              else nodes.current.delete(key);
            }}
            className="bk-visit-figure pointer-events-none absolute left-0 top-0 z-30"
            style={{ display: 'none' }}
            data-testid={`desk-visitor-${step.desk}-${key}`}
            data-role={officer ? 'officer' : 'customer'}
          >
            <Person shirt={officer ? OFFICER_SHIRT : (SHIRTS[i % SHIRTS.length] as string)} officer={officer} />
            {/* The case's own customer and the officer carry the status: the others in line are only waiting their turn. */}
            {(key === 'c0' || officer) && <span className="bk-visit-status" aria-hidden="true" />}
            {!officer && <span className="bk-visit-bubble" aria-hidden="true">{VISIT_ICON[step.work]}</span>}
          </div>
        );
      })}
    </>
  );
}

export function DeskVisitors2D() {
  const visits = useDeskVisits();
  const frozen = useStore(deskVisitStore, (s) => s.frozenAt !== null);
  if (visits.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30" data-testid="desk-visitors-2d" data-frozen={frozen}>
      {visits.map((v) => (
        <VisitCrew key={v.id} visit={v} />
      ))}
    </div>
  );
}
