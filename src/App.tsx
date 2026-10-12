import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { LivingBank } from './components/bank/LivingBank';
import { AcademyButton } from './components/bank/CourseCatalog';
import { ModeToggle, ViewToggle } from './components/bank/ViewControls';
import { ProcessCanvas } from './components/canvas/ProcessCanvas';
import { EvaluationPanel } from './components/evaluation/EvaluationPanel';
import { ChallengeBrief } from './components/sidebar/ChallengeBrief';
import { NodePalette } from './components/sidebar/NodePalette';
import { LabTourOverlay } from './components/education/LabWalkthrough';
import { CURRICULUM } from './data/seedChallenges';
import { levelTabLabel } from './data/curriculumCopy';
import { stageAccent } from './data/curriculumTheme';
import { bankStore } from './store/bankStore';
import { labTourStore } from './store/labTourStore';
import { useWorkflowStore, workflowStore } from './store/workflowStore';

type View = 'bank' | 'lab';

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

/** The two ways to learn: watch a bank run itself, or build the processes from the parts. */
function TopBar({ view, onView }: { view: View; onView: (v: View) => void }) {
  const tabs: Array<{ id: View; label: string; hint: string }> = [
    { id: 'bank', label: 'Living Bank', hint: 'Run a bank day by day and learn from what happens' },
    { id: 'lab', label: 'Build Lab', hint: 'Build each process yourself from the parts and get graded' },
  ];
  return (
    <header className="flex h-12 shrink-0 items-center gap-5 border-b border-slate-800 bg-slate-950 px-4">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-lime-300 to-sky-500 text-[13px] font-black text-slate-950" aria-hidden="true">
          P
        </span>
        <h1 className="text-[14px] font-semibold tracking-tight text-slate-100">
          ProcessCraft <span className="font-normal text-slate-400">Banking</span>
        </h1>
      </div>
      <nav aria-label="Views" className="flex gap-1">
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
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        {view === 'bank' && (
          <>
            <AcademyButton />
            <div className="h-6 w-px bg-slate-800" aria-hidden="true" />
          </>
        )}
        {/* How things are named follows the learner into the Build Lab: the tour and the ledger read the same setting. */}
        <ModeToggle />
        {view === 'bank' && <ViewToggle />}
      </div>
    </header>
  );
}

/**
 * The Academy's six stages, each with its levels. Each level keeps its own diagram, saved to this browser as you work.
 * The tab for level N is always `level-tab-N`, whichever stage it sits in.
 */
function LevelBar() {
  const levels = useWorkflowStore((s) => s.levels);
  const current = useWorkflowStore((s) => s.level.id);

  const switchTo = (levelId: string): void => {
    if (levelId !== current) workflowStore.getState().loadChallenge(levelId);
  };

  return (
    <nav aria-label="Levels" className="flex shrink-0 items-stretch gap-3 overflow-x-auto border-b border-slate-800 bg-slate-950 px-4 py-1.5" data-testid="level-bar">
      {CURRICULUM.map((stage) => {
        const accent = stageAccent(stage.stage);
        const inStage = stage.levelIds.flatMap((id) => {
          const l = levels.find((x) => x.id === id);
          return l ? [l] : [];
        });
        if (inStage.length === 0) return null;
        const open = inStage.some((l) => l.id === current);
        return (
          <section key={stage.stage} aria-label={`Stage ${stage.stage}: ${stage.title}`} title={stage.blurb} data-testid={`stage-${stage.stage}`} data-open={open} className="flex shrink-0 flex-col gap-0.5 border-l pl-2.5 first:border-l-0 first:pl-0" style={{ borderColor: `${accent}44` }}>
            <h2 className="whitespace-nowrap text-[9.5px] font-bold uppercase tracking-wider" style={{ color: open ? accent : '#64748b' }}>
              {stage.stage}. {stage.title}
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
                    title={`Level ${l.levelNumber}: ${l.title}`}
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
    <div className="flex h-screen min-w-[1180px] flex-col bg-[#060912] text-slate-100">
      <TopBar view={view} onView={choose} />
      {view === 'bank' ? <LivingBank /> : <BuildLab />}
    </div>
  );
}
