import { lazy, Suspense, useEffect, useState } from 'react';
import { AcademySplitToggle } from './components/academy/AcademySplitLayout';
import { LivingBank } from './components/bank/LivingBank';
import { AcademyButton } from './components/bank/CourseCatalog';
import { ModeToggle } from './components/bank/ViewControls';
import { WelcomeModal } from './components/bank/WelcomeModal';
import { SearchBar } from './components/nav/SearchBar';
import { SwitchModeButton } from './components/nav/SwitchModeButton';
import { AmlButton, BenchmarkButton, ChaosButton, StpButton } from './components/ops/OpsButtons';
import { LanguageToggle } from './components/shell/LanguageToggle';
import { SmallScreenBanner } from './components/shell/SmallScreenBanner';
import { tr, useLocale } from './i18n/locale';
import { uiStore, useUiStore } from './store/uiStore';
import { useAcademyStore } from './store/academyStore';
import { audioSupported, bindAudioFX } from './utils/audioFX';
import { bankStore } from './store/bankStore';
import { labTourStore } from './store/labTourStore';
import { relocalizeWorkflow, workflowStore } from './store/workflowStore';

type View = 'bank' | 'lab';

/** The ops overlays are loaded the first time one is opened: they are not needed to run the bank. */
import { NotificationCenter } from './components/shell/NotificationCenter';
import { KnowledgeShortcuts } from './components/nav/KnowledgeShortcuts';
import { AppFooter } from './components/shell/AuthorLink';

const AmlPanel = lazy(() => import('./components/ops/AmlPanel').then((m) => ({ default: m.AmlPanel })));
const PaymentBenchmarkModal = lazy(() => import('./components/ops/PaymentBenchmarkModal').then((m) => ({ default: m.PaymentBenchmarkModal })));
const ChaosPanel = lazy(() => import('./components/ops/ChaosPanel').then((m) => ({ default: m.ChaosPanel })));
const StpPanel = lazy(() => import('./components/ops/StpPanel').then((m) => ({ default: m.StpPanel })));
const BuildLab = lazy(() => import('./components/lab/BuildLab').then((m) => ({ default: m.BuildLab })));
const KnowledgeBaseModal = lazy(() => import('./components/knowledge/KnowledgeBaseModal').then((m) => ({ default: m.KnowledgeBaseModal })));

function Overlays() {
  const overlay = useUiStore((s) => s.overlay);
  if (overlay === 'none' || overlay === 'audit') return null;
  return (
    <Suspense fallback={null}>
      {overlay === 'aml' && <AmlPanel />}
      {overlay === 'benchmark' && <PaymentBenchmarkModal />}
      {overlay === 'chaos' && <ChaosPanel />}
      {overlay === 'stp' && <StpPanel />}
      {overlay === 'knowledge' && <KnowledgeBaseModal />}
    </Suspense>
  );
}

const VIEW_KEY = 'processcraft:v1:view';

function readView(): View {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'lab' ? 'lab' : 'bank';
  } catch {
    return 'bank';
  }
}

function writeView(view: View): void {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Remembering the tab is a nicety.
  }
}

/** 🔊 / 🔇: the sound effects (approval ding, decline buzz, botnet siren). */
function SoundToggle() {
  const on = useUiStore((s) => s.soundOn);
  if (!audioSupported()) return null;
  return (
    <button
      type="button"
      onClick={() => uiStore.getState().setSoundOn(!on)}
      aria-pressed={on}
      aria-label={on ? tr({ en: 'Mute sound effects', vi: 'Tắt âm thanh' }) : tr({ en: 'Turn sound effects on', vi: 'Bật âm thanh' })}
      title={on ? tr({ en: 'Sound on: approval ding, decline buzz, botnet siren', vi: 'Đang bật âm thanh: tiếng duyệt, tiếng từ chối, còi báo botnet' }) : tr({ en: 'Sound off', vi: 'Đang tắt âm thanh' })}
      data-testid="sound-toggle"
      className="grid h-8 w-8 place-items-center rounded-md bg-slate-900 text-[14px] ring-1 ring-slate-700 transition hover:bg-slate-800"
    >
      <span aria-hidden="true">{on ? '🔊' : '🔇'}</span>
    </button>
  );
}

/** The two ways to learn: watch a bank run itself, or build the processes from the parts. */
function TopBar({ view, onView }: { view: View; onView: (v: View) => void }) {
  const tabs: Array<{ id: View; label: string; hint: string }> = [
    { id: 'bank', label: tr({ en: 'Living Bank', vi: 'Ngân hàng sống' }), hint: tr({ en: 'Run a bank day by day and learn from what happens', vi: 'Vận hành ngân hàng từng ngày và học từ những gì xảy ra' }) },
    { id: 'lab', label: tr({ en: 'Build Lab', vi: 'Phòng dựng quy trình' }), hint: tr({ en: 'Build each process yourself from the parts and get graded', vi: 'Tự dựng từng quy trình từ các thành phần và được chấm điểm' }) },
  ];
  return (
    <header className="flex min-h-12 w-full min-w-0 shrink-0 flex-row flex-wrap items-center justify-between gap-x-1.5 gap-y-1 whitespace-nowrap border-b border-slate-800 bg-slate-950 px-3 py-1.5 [&>*]:shrink-0 [&_button]:whitespace-nowrap" data-testid="app-header">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-lime-300 to-sky-500 text-[13px] font-black text-slate-950" aria-hidden="true">
          P
        </span>
        {/* Narrower windows keep the logo: the name gives its room to the controls. */}
        <h1 className="text-[14px] font-semibold tracking-tight text-slate-100 max-[1639px]:sr-only">
          ProcessCraft <span className="font-normal text-slate-400">Banking</span>
        </h1>
      </div>
      <nav aria-label={tr({ en: 'Views', vi: 'Chế độ xem' })} className="flex gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onView(t.id)}
            aria-current={view === t.id ? 'page' : undefined}
            title={t.hint}
            data-testid={`tab-${t.id}`}
            className={`rounded-md px-2 py-1 text-[12.5px] font-semibold transition ${view === t.id ? 'bg-slate-800 text-slate-50' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <SwitchModeButton />
      <SearchBar onBeforeGo={() => view !== 'bank' && onView('bank')} />
      <KnowledgeShortcuts />
      <div className="flex max-w-full flex-wrap items-center justify-end gap-1.5">
        {view === 'bank' && <AcademySplitToggle />}
        {view === 'bank' && <AcademyButton />}
        {view === 'bank' && <AmlButton />}
        {view === 'bank' && <BenchmarkButton />}
        {view === 'bank' && <StpButton />}
        {view === 'bank' && <ChaosButton />}
        {/* In the Living Bank the scope, 2D/3D and data-depth switches live in the viewport dock over the map. */}
        {view === 'lab' && <ModeToggle />}
        <SoundToggle />
        {/* Lifted over the map's overlays and the Academy, Rule Lab and report windows (z-40 to z-50), so the language can always be changed; the windows above it (workspace, Knowledge Base) carry their own. */}
        <GlobalLanguage />
      </div>
    </header>
  );
}

/** The header's language switch. While the Academy is maximized it carries its own inside its header's control row, so this one steps aside instead of floating over it. */
function GlobalLanguage() {
  const academyMax = useAcademyStore((s) => s.isMaximized && s.isSplitScreenOpen);
  return (
    <div className={`relative z-[60] shrink-0 ${academyMax ? 'invisible' : ''}`} aria-hidden={academyMax || undefined} data-testid="global-language">
      <LanguageToggle />
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>(readView);
  // Every pick()/tr() reader below redraws in the new language: the tree is keyed by it. The stores keep the bank running.
  const locale = useLocale();
  useEffect(() => bindAudioFX(bankStore, uiStore), []);
  // The Build Lab's grade, playback log and notice were written in the old language: write them again in the new one.
  useEffect(() => relocalizeWorkflow(), [locale]);
  const choose = (next: View): void => {
    setView(next);
    writeView(next);
    // A guided tour belongs to the Build Lab screen it was opened on.
    labTourStore.getState().exit();
    // Whatever was playing in the other view stops.
    if (next === 'lab') bankStore.getState().pause();
    else workflowStore.getState().pauseSimulation();
  };

  // Edits are written after a short pause. Make sure the last one is not lost when the tab is hidden or closed.
  useEffect(() => {
    const flush = (): void => workflowStore.getState().flushSave();
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div key={locale} lang={locale} className="flex h-screen w-full min-w-0 flex-col overflow-x-hidden bg-[#060912] text-slate-100">
      <SmallScreenBanner />
      <TopBar view={view} onView={choose} />
      {view === 'bank' ? (
        <LivingBank />
      ) : (
        <Suspense fallback={<div className="flex-1" data-testid="build-lab-loading" />}>
          <BuildLab />
        </Suspense>
      )}
      <WelcomeModal
        onChooseBank={() => view !== 'bank' && choose('bank')}
        onOpenAcademy={() => {
          if (view !== 'bank') choose('bank');
          bankStore.getState().openAcademy();
        }}
      />
      <AppFooter />
      <Overlays />
      <NotificationCenter />
    </div>
  );
}
