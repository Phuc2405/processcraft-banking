import { Component, lazy, Suspense, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { activeFlowOf, useBankStore } from '../../store/bankStore';
import { useAcademyStore } from '../../store/academyStore';
import { AcademySplitLayout } from '../academy/AcademySplitLayout';
import { GuidedBar, ResumeWalkthrough, WalkBadge } from '../education/GuidedWalkthrough';
import { BankMap } from './BankMap';
import { BankSidebar } from './BankSidebar';
import { ClockBar } from './ClockBar';
import { CourseCatalog } from './CourseCatalog';
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
    return { error: error instanceof Error ? error.message : 'The 3D office could not be loaded.' };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('3D office could not load', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    return (
      <div className="grid h-full place-items-center p-8" role="alert" data-testid="office-3d-load-failed">
        <div className="max-w-lg rounded-2xl border border-slate-700 bg-slate-900/80 p-6">
          <h2 className="text-[16px] font-bold text-slate-50">The 3D office could not be loaded</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-300">
            Its packages (<code className="font-mono text-sky-200">three</code>, <code className="font-mono text-sky-200">@react-three/fiber</code>,{' '}
            <code className="font-mono text-sky-200">@react-three/drei</code>) are probably missing from this project folder. In a terminal in the project folder, run:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 px-3 py-2 font-mono text-[12px] text-lime-200">npm install{'\n'}npm run dev</pre>
          <p className="mt-3 text-[13px] leading-relaxed text-slate-300">Then reload this page. Nothing is lost, and the 2D blueprint shows exactly the same bank.</p>
          <p className="mt-2 break-words text-[11px] text-slate-500">{this.state.error}</p>
          <button type="button" onClick={this.props.onBack} data-testid="office-3d-load-back" className="mt-4 rounded-lg bg-lime-400 px-4 py-2 text-[13px] font-bold text-slate-950 hover:bg-lime-300">
            Back to the 2D blueprint
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

/** A short message from the bank ("New rules are live"), shown over the map for a few seconds. */
function Notice() {
  const notice = useBankStore((s) => s.notice);
  const hubOpen = useBankStore((s) => s.hubOpen);
  // In the Beginner scope the preset dock sits at the bottom of the map, so the message goes just above it.
  const dockBelow = useBankStore((s) => activeFlowOf(s) !== null);
  const dismiss = useBankStore((s) => s.dismissNotice);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(dismiss, 6000);
    return () => clearTimeout(t);
  }, [notice, dismiss]);
  if (!notice || hubOpen) return null;
  return (
    <div className={`absolute ${dockBelow ? 'bottom-[76px]' : 'bottom-4'} left-1/2 z-30 flex max-w-[520px] -translate-x-1/2 items-start gap-3 rounded-xl border px-4 py-2.5 text-[13px] shadow-xl ${NOTICE_STYLE[notice.kind]}`} role="status" data-testid="bank-notice">
      <span>{notice.message}</span>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="opacity-70 transition hover:opacity-100">
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
          <main className="flex min-w-0 flex-1 flex-col bg-[#070b14]" aria-label="Bank map">
            {/* The map has a fixed size: the inspector and the ledger float over it, so opening them never resizes the scene. */}
            {/* overflow-clip, not hidden: nothing (a focus, a scroll-into-view) may scroll this frame and slide the floating docks off it. */}
            <div className="relative min-h-0 flex-1 overflow-clip">
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
              <HudToasts />
              <PresetDock />
              <WalkBadge />
              <ResumeWalkthrough />
              <Notice />
              <Inspector />
            </div>
            <GuidedBar />
          </main>
        </AcademySplitLayout>
      </div>
      <DayReportModal />
      <CourseCatalog />
      <LearningHub />
    </div>
  );
}
