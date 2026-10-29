import { t } from '../../i18n/t';
import { Component, lazy, Suspense, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { noticeText } from '../../i18n/simVi';
import { useBankStore } from '../../store/bankStore';
import { useAcademyStore } from '../../store/academyStore';
import { AcademySplitLayout } from '../academy/AcademySplitLayout';
import { GuidedBar, ResumeWalkthrough, WalkChip } from '../education/GuidedWalkthrough';
import { WalkDock } from '../education/WalkDock';
import { AnalystWorkspaceModal } from './AnalystWorkspaceModal';
import { BankMap } from './BankMap';
import { BankSidebar } from './BankSidebar';
import { ClockBar } from './ClockBar';
import { CourseCatalog } from './CourseCatalog';
import { DayIntroBanner } from './DayIntroBanner';
import { DayReportModal } from './DayReportModal';
import { HudToasts } from './HudToasts';
import { Inspector } from './Inspector';
import { LedgerDrawer } from './LedgerDrawer';
import { LearningHub } from './LearningHub';
import { PresetDock } from './PresetDock';
import { useBankClock } from './useBankClock';
import { ViewportControls } from './ViewportControls';
import { ZoomToolbar } from '../shell/ZoomToolbar';

/** The 3D office is loaded only when someone asks for it: three.js is the heaviest thing in the app. */
const Office3D = lazy(() => import('./office/Office3D'));

/**
 * Catches the 3D office failing to LOAD (as opposed to failing to draw, which Office3D handles itself). The usual cause is a
 * project folder whose node_modules predates the 3D packages: new source was copied over an old install and `npm install`
 * was not run again. The learner gets the fix in words and a way back to the 2D map, instead of a blank screen.
 */
class OfficeLoadBoundary extends Component<{ onBack: () => void; children: ReactNode }, { error: string | null }> {
  override state = { error: null as string | null };

  static getDerivedStateFromError(error: unknown): { error: string } {
    return { error: error instanceof Error ? error.message : t('The 3D office could not be loaded.') };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('3D office could not load', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    return (
      <div className="grid h-full place-items-center p-8" role="alert" data-testid="office-3d-load-failed">
        <div className="max-w-lg rounded-2xl border border-slate-700 bg-slate-900/80 p-6">
          <h2 className="text-[16px] font-bold text-slate-50">{t('The 3D office could not be loaded')}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-300">
            {t('Its packages')} (<code className="font-mono text-sky-200">three</code>, <code className="font-mono text-sky-200">@react-three/fiber</code>,{' '}
            <code className="font-mono text-sky-200">@react-three/drei</code>) {t('are probably missing from this project folder. In a terminal in the project folder, run:')}
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 px-3 py-2 font-mono text-[12px] text-lime-200">npm install{'\n'}npm run dev</pre>
          <p className="mt-3 text-[13px] leading-relaxed text-slate-300">{t('Then reload this page. Nothing is lost, and the 2D blueprint shows exactly the same bank.')}</p>
          <p className="mt-2 break-words text-[11px] text-slate-500">{this.state.error}</p>
          <button type="button" onClick={this.props.onBack} data-testid="office-3d-load-back" className="mt-4 rounded-lg bg-lime-400 px-4 py-2 text-[13px] font-bold text-slate-950 hover:bg-lime-300">
            {t('Back to the 2D blueprint')}
          </button>
        </div>
      </div>
    );
  }
}

function OfficeLoading() {
  return (
    <div className="grid h-full place-items-center text-[13px] text-slate-400" role="status" data-testid="office-loading">
      Building the office…
    </div>
  );
}

const NOTICE_STYLE = {
  info: 'border-sky-400/40 bg-sky-950/90 text-sky-100',
  warn: 'border-amber-400/40 bg-amber-950/90 text-amber-100',
  error: 'border-rose-400/40 bg-rose-950/90 text-rose-100',
} as const;

/**
 * Every floating message over the map (the bank's notices, the decline and incident toasts) in one column in the top-left
 * corner, away from the legend (top-right), the viewport dock (top-centre) and the preset dock (bottom). In 3D the office's
 * toolbar holds the very corner in one row, so the column starts just below it, under the weather menu's layer.
 */
export const NOTICE_CORNER = { '2d': 'top-4', '3d': 'top-16', '3dSplit': 'top-16' } as const;

function NoticeColumn() {
  const viewMode = useBankStore((s) => s.viewMode);
  const splitOpen = useAcademyStore((s) => s.isSplitScreenOpen);
  const corner = viewMode === '3d' ? NOTICE_CORNER[splitOpen ? '3dSplit' : '3d'] : NOTICE_CORNER['2d'];
  return (
    <div className={`pointer-events-none absolute left-4 ${corner} ${viewMode === '3d' ? 'z-30' : 'z-50'} flex max-w-[min(440px,calc(100%-32px))] flex-col items-start gap-2`} data-testid="notice-column">
      <Notice />
      <HudToasts />
    </div>
  );
}

/** A short message from the bank ("New rules are live"), shown for a few seconds at the top of the notice column. */
function Notice() {
  const notice = useBankStore((s) => s.notice);
  const hubOpen = useBankStore((s) => s.hubOpen);
  const dismiss = useBankStore((s) => s.dismissNotice);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(dismiss, 6000);
    return () => clearTimeout(t);
  }, [notice, dismiss]);
  if (!notice || hubOpen) return null;
  return (
    <div className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-2.5 text-[13px] shadow-xl ${NOTICE_STYLE[notice.kind]}`} role="status" data-testid="bank-notice">
      <span>{noticeText(notice.message)}</span>
      <button type="button" onClick={dismiss} aria-label={t('Dismiss')} className="opacity-70 transition hover:opacity-100">
        ×
      </button>
    </div>
  );
}

/** The Living Bank: day clock, the map of departments, the inspector drawer, and the process learning hub. */
export function LivingBank() {
  useBankClock();
  const viewMode = useBankStore((s) => s.viewMode);
  const setViewMode = useBankStore((s) => s.setViewMode);
  const [collapsed, setCollapsed] = useState(false);
  const choose = (next: boolean): void => {
    foldedForSplit.current = false;
    setCollapsed(next);
  };
  // The Academy split view needs the width: the overview sidebar folds to its slim rail while the lesson panel is open, and
  // comes back when it closes (unless the learner folded or opened it themselves in between).
  const splitOpen = useAcademyStore((s) => s.isSplitScreenOpen);
  const foldedForSplit = useRef(false);
  useEffect(() => {
    if (splitOpen) {
      setCollapsed((was) => {
        foldedForSplit.current = !was;
        return true;
      });
    } else if (foldedForSplit.current) {
      foldedForSplit.current = false;
      setCollapsed(false);
    }
  }, [splitOpen]);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="living-bank">
      <ClockBar />
      <div className="flex min-h-0 flex-1">
        <BankSidebar collapsed={collapsed} onToggle={choose} />
        <AcademySplitLayout>
          <main className="flex min-w-0 flex-1 flex-col bg-[#070b14]" aria-label={t('Bank map')}>
            {/* The map has a fixed size: the inspector and the ledger float over it, so opening them never resizes the scene. */}
            {/* overflow-clip, not hidden: nothing (a focus, a scroll-into-view) may scroll this frame and slide the floating docks off it. */}
            <div className="flex min-h-0 flex-1">
            <WalkDock />
            <div className="relative min-h-0 min-w-0 flex-1 overflow-clip">
              {viewMode === '3d' ? (
                <OfficeLoadBoundary onBack={() => setViewMode('2d')}>
                  <Suspense fallback={<OfficeLoading />}>
                    <Office3D />
                  </Suspense>
                </OfficeLoadBoundary>
              ) : (
                <BankMap />
              )}
              <ViewportControls />
              <ZoomToolbar />
              <LedgerDrawer />
              <PresetDock />
              <WalkChip />
              <ResumeWalkthrough />
              <DayIntroBanner />
              <NoticeColumn />
              <Inspector />
            </div>
            </div>
            <GuidedBar />
          </main>
        </AcademySplitLayout>
      </div>
      <DayReportModal />
      <CourseCatalog />
      <LearningHub />
      <AnalystWorkspaceModal />
    </div>
  );
}
