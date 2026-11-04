import { ReactFlowProvider } from '@xyflow/react';
import { ProcessCanvas } from '../canvas/ProcessCanvas';
import { LabTourOverlay } from '../education/LabWalkthrough';
import { EvaluationPanel } from '../evaluation/EvaluationPanel';
import { ChallengeBrief } from '../sidebar/ChallengeBrief';
import { NodePalette } from '../sidebar/NodePalette';
import { levelTabLabel } from '../../data/curriculumCopy';
import { stageAccent } from '../../data/curriculumTheme';
import { CURRICULUM } from '../../data/seedChallenges';
import { localChallenge, stageText } from '../../i18n/challengeVi';
import { useWorkflowStore, workflowStore } from '../../store/workflowStore';
import { useMessages } from '../../utils/i18nHelper';
import { buildLabMessages } from './buildLab.messages';

/** The Academy's six stages, each with its levels. */
function LevelBar() {
  const levels = useWorkflowStore((s) => s.levels);
  const current = useWorkflowStore((s) => s.level.id);
  const m = useMessages(buildLabMessages);

  const switchTo = (levelId: string): void => {
    if (levelId !== current) workflowStore.getState().loadChallenge(levelId);
  };

  return (
    <nav aria-label={m('levels')} className="flex shrink-0 items-stretch gap-3 overflow-x-auto border-b border-slate-800 bg-slate-950 px-4 py-1.5" data-testid="level-bar">
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
          <section key={stage.stage} aria-label={m('stage', { n: stage.stage, title: text.title })} title={text.blurb} data-testid={`stage-${stage.stage}`} data-open={open} className="flex shrink-0 flex-col gap-0.5 border-l pl-2.5 first:border-l-0 first:pl-0" style={{ borderColor: `${accent}44` }}>
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
                    title={m('level', { n: l.levelNumber, title: localChallenge(l).title })}
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

/** The Build Lab screen: its level bar, the challenge sidebar, the canvas and the grader. Loaded only when the Lab view opens. */
export function BuildLab() {
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
