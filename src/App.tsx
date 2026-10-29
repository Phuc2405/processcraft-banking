import { lazy, Suspense, useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { AcademySplitToggle } from './components/academy/AcademySplitLayout';
import { LivingBank } from './components/bank/LivingBank';
import { AcademyButton } from './components/bank/CourseCatalog';
import { ModeToggle } from './components/bank/ViewControls';
import { WelcomeModal } from './components/bank/WelcomeModal';
import { SearchBar } from './components/nav/SearchBar';
import { SwitchModeButton } from './components/nav/SwitchModeButton';
import { AmlButton, BenchmarkButton, ChaosButton } from './components/ops/OpsButtons';
import { LanguageToggle } from './components/shell/LanguageToggle';
import { SmallScreenBanner } from './components/shell/SmallScreenBanner';
import { tr, useLocale } from './i18n/locale';
import { uiStore, useUiStore } from './store/uiStore';
import { audioSupported, bindAudioFX } from './utils/audioFX';
import { ProcessCanvas } from './components/canvas/ProcessCanvas';
import { EvaluationPanel } from './components/evaluation/EvaluationPanel';
import { ChallengeBrief } from './components/sidebar/ChallengeBrief';
import { NodePalette } from './components/sidebar/NodePalette';
import { LabTourOverlay } from './components/education/LabWalkthrough';
import { CURRICULUM } from './data/seedChallenges';
import { levelTabLabel } from './data/curriculumCopy';
import { localChallenge, stageText } from './i18n/challengeVi';
import { stageAccent } from './data/curriculumTheme';
import { bankStore } from './store/bankStore';
import { labTourStore } from './store/labTourStore';
import { relocalizeWorkflow, useWorkflowStore, workflowStore } from './store/workflowStore';

type View = 'bank' | 'lab';

/** The ops overlays are loaded the first time one is opened: they are not needed to run the bank. */
const AmlPanel = lazy(() => import('./components/ops/AmlPanel').then((m) => ({ default: m.AmlPanel })));
const PaymentBenchmarkModal = lazy(() => import('./components/ops/PaymentBenchmarkModal').then((m) => ({ default: m.PaymentBenchmarkModal })));
const ChaosPanel = lazy(() => import('./components/ops/ChaosPanel').then((m) => ({ default: m.ChaosPanel })));
const KnowledgeBaseModal = lazy(() => import('./components/knowledge/KnowledgeBaseModal').then((m) => ({ default: m.KnowledgeBaseModal })));

function Overlays() {
  const overlay = useUiStore((s) => s.overlay);
  if (overlay === 'none' || overlay === 'audit') return null;
  return (
    <Suspense fallback={null}>
      {overlay === 'aml' && <AmlPanel />}
      {overlay === 'benchmark' && <PaymentBenchmarkModal />}
      {overlay === 'chaos' && <ChaosPanel />}
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
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-950 px-4">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-lime-300 to-sky-500 text-[13px] font-black text-slate-950" aria-hidden="true">
          P
        </span>
        <h1 className="text-[14px] font-semibold tracking-tight text-slate-100">
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
            className={`rounded-md px-3.5 py-1.5 text-[12.5px] font-semibold transition ${view === t.id ? 'bg-slate-800 text-slate-50' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <SwitchModeButton />
      <SearchBar onBeforeGo={() => view !== 'bank' && onView('bank')} />
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        {view === 'bank' && <AcademySplitToggle />}
        {view === 'bank' && <AcademyButton />}
        {view === 'bank' && <AmlButton />}
        {view === 'bank' && <BenchmarkButton />}
        {view === 'bank' && <ChaosButton />}
        {/* In the Living Bank the scope, 2D/3D and data-depth switches live in the viewport dock over the map. */}
        {view === 'lab' && <ModeToggle />}
        <SoundToggle />
        <LanguageToggle />
      </div>
    </header>
  );
}

/** The Academy's six stages, each with its levels. */
function LevelBar() {
  const levels = useWorkflowStore((s) => s.levels);
  const current = useWorkflowStore((s) => s.level.id);

  const switchTo = (levelId: string): void => {
    if (levelId !== current) workflowStore.getState().loadChallenge(levelId);
  };

  return (
    <nav aria-label={tr({ en: 'Levels', vi: 'Các cấp độ' })} className="flex shrink-0 items-stretch gap-3 overflow-x-auto border-b border-slate-800 bg-slate-950 px-4 py-1.5" data-testid="level-bar">
      {CURRICULUM.map((stage) => {
        const accent = stageAccent(stage.stage);
        const inStage = stage.levelIds.flatMap((id) => {
          const l = levels.find((x) => x.id === id);
          return l ? [l] : [];
        });
        if (inStage.length === 0) return null;
        const open = inStage.some((l) => l.id === current);
        const text = stageText(stage);
        return (
          <section key={stage.stage} aria-label={tr({ en: `Stage ${stage.stage}: ${text.title}`, vi: `Giai đoạn ${stage.stage}: ${text.title}` })} title={text.blurb} data-testid={`stage-${stage.stage}`} data-open={open} className="flex shrink-0 flex-col gap-0.5 border-l pl-2.5 first:border-l-0 first:pl-0" style={{ borderColor: `${accent}44` }}>
            <h2 className="whitespace-nowrap text-[9.5px] font-bold uppercase tracking-wider" style={{ color: open ? accent : '#64748b' }}>
              {stage.stage}. {text.title}
            </h2>
            <div className="flex gap-1">
              {inStage.map((l, i) => {
                const active = l.id === current;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => switchTo(l.id)}
                    aria-current={active ? 'page' : undefined}
                    title={tr({ en: `Level ${l.levelNumber}: ${l.title}`, vi: `Cấp ${l.levelNumber}: ${localChallenge(l).title}` })}
                    data-testid={`level-tab-${l.levelNumber}`}
                    className={`flex shrink-0 items-center whitespace-nowrap rounded-md px-2.5 py-1 text-[12px] font-medium transition ${active ? 'bg-slate-800 text-slate-50' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
                    style={active ? { boxShadow: `inset 0 -2px 0 ${accent}` } : undefined}
                  >
                    <span className="mr-1.5 font-mono" style={{ color: active ? accent : '#64748b' }}>
                      {stage.stage}.{i + 1}
                    </span>
                    <span>{levelTabLabel(l.id, l.title)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </nav>
  );
}

function BuildLab() {
  return (
    <ReactFlowProvider>
      <div className="flex min-h-0 flex-1 flex-col" data-testid="build-lab">
        <LevelBar />
        <div className="flex min-h-0 flex-1">
          <aside className="w-[310px] shrink-0 space-y-6 overflow-y-auto border-r border-slate-800 bg-slate-950 p-4">
            <ChallengeBrief />
            <hr className="border-slate-800" />
            <NodePalette />
          </aside>
          <main className="relative flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
              <ProcessCanvas />
            </div>
            <EvaluationPanel />
            <LabTourOverlay />
          </main>
        </div>
      </div>
    </ReactFlowProvider>
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
    <div key={locale} lang={locale} className="flex h-screen min-w-[1180px] flex-col bg-[#060912] text-slate-100">
      <SmallScreenBanner />
      <TopBar view={view} onView={choose} />
      {view === 'bank' ? <LivingBank /> : <BuildLab />}
      <WelcomeModal
        onChooseBank={() => view !== 'bank' && choose('bank')}
        onOpenAcademy={() => {
          if (view !== 'bank') choose('bank');
          bankStore.getState().openAcademy();
        }}
      />
      <Overlays />
    </div>
  );
}
