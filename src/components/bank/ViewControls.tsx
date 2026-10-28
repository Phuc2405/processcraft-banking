import { modeHint, modeLabel, TERM_MODES, type TermMode } from '../../sim/terms';
import { useBankStore } from '../../store/bankStore';
import { SegmentedToggle } from '../shell/SegmentedToggle';

/**
 * The vocabulary switch in the header of the Build Lab: Fintech Expert | Concept Explorer. (In the Living Bank the same
 * setting is the Standard | Expert data depth of the viewport dock, see ViewportControls.tsx.)
 */

const SHORT_MODE: Record<TermMode, string> = { expert: 'Expert', beginner: 'Explorer' };

/** Fintech Expert | Concept Explorer: switches every name, tooltip and inspector panel. */
export function ModeToggle() {
  const mode = useBankStore((s) => s.termMode);
  const setMode = useBankStore((s) => s.setTermMode);
  return (
    <SegmentedToggle<TermMode>
      label="Vocabulary"
      testId="mode"
      stateKey="mode"
      value={mode}
      onChange={setMode}
      options={TERM_MODES.map((m) => ({
        value: m,
        label: (
          <>
            <span className="xl:hidden">{SHORT_MODE[m]}</span>
            <span className="hidden xl:inline">{modeLabel(m)}</span>
          </>
        ),
        hint: modeHint(m),
        tone: m === 'expert' ? 'violet' : 'sky',
      }))}
    />
  );
}
