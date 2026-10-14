import { useEffect, useState, type ReactNode } from 'react';
import { bankStore, useBankStore } from '../../store/bankStore';

/**
 * The first-run welcome: one question, three answers. It shows once per browser (the flag below), and Escape or a click
 * on the backdrop closes it without changing anything.
 */

export const ONBOARDED_KEY = 'processcraft_has_onboarded';

function readOnboarded(): boolean {
  try {
    const v = window.localStorage.getItem(ONBOARDED_KEY);
    return v !== null && v !== 'false';
  } catch {
    // Storage can be blocked (private windows, strict settings): then the welcome shows once per visit, which is harmless.
    return false;
  }
}

function markOnboarded(): void {
  try {
    window.localStorage.setItem(ONBOARDED_KEY, 'true');
  } catch {
    // Remembering it is a nicety.
  }
}

function Choice({ icon, title, badge, body, onPick, testId, accent }: { icon: string; title: string; badge?: string; body: ReactNode; onPick: () => void; testId: string; accent: string }) {
  return (
    <button
      type="button"
      onClick={onPick}
      data-testid={testId}
      className="group flex w-full items-start gap-3 rounded-xl border border-slate-700/80 bg-slate-950/60 p-3.5 text-left transition hover:-translate-y-px hover:bg-slate-800/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      style={{ ['--accent' as string]: accent }}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[20px]" style={{ background: `${accent}22`, boxShadow: `inset 0 0 0 1px ${accent}55` }} aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-bold text-slate-50">{title}</span>
          {badge && (
            <span className="rounded-full px-2 py-px text-[10px] font-bold uppercase tracking-wider text-slate-950" style={{ background: accent }}>
              {badge}
            </span>
          )}
        </span>
        <span className="mt-1 block text-[12.5px] leading-relaxed text-slate-300">{body}</span>
      </span>
      <span className="mt-2.5 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-slate-200" aria-hidden="true">
        →
      </span>
    </button>
  );
}

export function WelcomeModal({ onOpenAcademy, onChooseBank }: { onOpenAcademy: () => void; onChooseBank: () => void }) {
  const [open, setOpen] = useState(() => !readOnboarded());
  // Over the 3D office a backdrop blur would make the browser re-blur a live canvas, so it gets a solid veil instead.
  const solid = useBankStore((s) => s.viewMode === '3d');

  const close = (): void => {
    markOnboarded();
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  const guided = (): void => {
    const s = bankStore.getState();
    s.setScope('beginner');
    s.setDimension('2d');
    s.setDataDepth('standard');
    s.setActiveFlow(1);
    onChooseBank();
    close();
  };
  const sandbox = (): void => {
    const s = bankStore.getState();
    s.setScope('advanced');
    s.setDimension('2d');
    s.setDataDepth('standard');
    onChooseBank();
    close();
  };
  const academy = (): void => {
    close();
    onOpenAcademy();
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${solid ? 'bg-black/85' : 'bg-black/80 backdrop-blur-md'}`} onClick={(e) => e.target === e.currentTarget && close()} data-testid="welcome-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="welcome-title" className="w-full max-w-xl rounded-2xl border border-slate-700/80 bg-slate-900 p-6 text-slate-100 shadow-2xl" data-testid="welcome-modal">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-400/10 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-sky-300 ring-1 ring-sky-400/40">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-300" aria-hidden="true" />
          Banking Digital Twin
        </span>
        <h2 id="welcome-title" className="mt-3 text-[22px] font-bold leading-tight tracking-tight text-slate-50">
          Choose Your Experience Mode
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">A working bank runs here, minute by minute. Pick how you want to meet it; you can switch at any time from the dock at the top of the map.</p>
        <div className="mt-5 space-y-2.5">
          <Choice
            icon="🧭"
            title="Guided Flow Explorer (Beginner)"
            badge="Recommended"
            accent="#4ade80"
            testId="welcome-guided"
            onPick={guided}
            body={<>Follow one payment story at a time, starting with a card tapped in a shop. Everything else fades back, and one click sends a test payment through.</>}
          />
          <Choice icon="🏦" title="Living Bank Sandbox (Advanced)" accent="#c084fc" testId="welcome-sandbox" onPick={sandbox} body={<>The whole bank at once: every desk, queue and wire lit. Run the day, change the rules, read the end-of-day report.</>} />
          <Choice icon="🎓" title="Banking Academy" accent="#38bdf8" testId="welcome-academy" onPick={academy} body={<>Six chapters with guided walkthroughs and quizzes: tokenised cards, 3DS, Pay-in-4, the night cycle, instant transfers and AML.</>} />
        </div>
        <div className="mt-4 flex items-center justify-between text-[11.5px] text-slate-500">
          <span>
            Press <kbd className="rounded border border-slate-700 px-1 font-mono text-[10.5px] text-slate-300">Esc</kbd> to skip
          </span>
          <button type="button" onClick={close} className="font-medium text-slate-400 transition hover:text-slate-100" data-testid="welcome-skip">
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
