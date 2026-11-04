import { useEffect } from 'react';
import { formatClock } from '../../sim/clock';
import { demoActionById } from '../../sim/demoActions';
import { slotLabel } from '../../sim/demoSchedule';
import { useBankStore } from '../../store/bankStore';
import { useShiftQueue } from '../../store/shiftQueueStore';
import { shiftQueueStore } from '../../store/shiftQueueStore';
import { useMessages } from '../../utils/i18nHelper';
import { Modal } from '../shell/Modal';
import { retailOpsMessages } from './retailOps.messages';
import { confirmShiftSnap, releaseDueDemos, stayForShift } from './retailOpsActions';

/** The out-of-hours question: move the clock to the scenario's slot the same day, or stay and let it wait for its shift. */
export function ShiftPrompt() {
  const m = useMessages(retailOpsMessages);
  const prompt = useShiftQueue((s) => s.prompt);
  const minute = useBankStore((s) => s.view.minute);
  const live = useBankStore((s) => s.playing && !s.solo);
  // The queue runs whatever is due each time the clock moves, and when the learner plays again; never while paused.
  useEffect(() => {
    releaseDueDemos();
  }, [minute, live]);
  if (!prompt) return null;
  const now = formatClock(minute);
  const slot = slotLabel(prompt.snap.target);
  const body = m(prompt.snap.reason === 'beforeOpening' ? 'shiftPromptBeforeOpening' : prompt.snap.reason === 'afterClosing' ? 'shiftPromptAfterClosing' : 'shiftPromptNight', { now });
  return (
    <Modal
      title={m('shiftPromptTitle')}
      subtitle={demoActionById(prompt.id).label()}
      icon={prompt.snap.shift === 'eod' ? '🌙' : '🏦'}
      onClose={() => shiftQueueStore.getState().dismiss()}
      width="max-w-md"
      z="z-[120]"
      testId="shift-prompt"
      footer={
        <>
          <button type="button" onClick={stayForShift} data-testid="shift-prompt-stay" className="rounded-lg border border-slate-600 px-3 py-1.5 text-[13px] font-semibold text-slate-200 hover:bg-slate-800">
            {m('shiftStay', { now })}
          </button>
          <button type="button" onClick={confirmShiftSnap} data-testid="shift-prompt-confirm" data-target={prompt.snap.target} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-[13px] font-bold text-emerald-950 hover:bg-emerald-400">
            {m('shiftConfirm', { slot })}
          </button>
        </>
      }
    >
      <p className="text-[14px] leading-relaxed text-slate-200" data-testid="shift-prompt-body" data-reason={prompt.snap.reason}>
        {body}
      </p>
      <p className="mt-3 text-[12.5px] leading-snug text-slate-400">{m('shiftStayNote')}</p>
    </Modal>
  );
}
