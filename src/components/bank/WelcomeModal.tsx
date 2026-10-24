import { useEffect, useState, type ReactNode } from 'react';
import { bankStore, useBankStore } from '../../store/bankStore';
import { useUiStore } from '../../store/uiStore';
import { formatNodes, useMessages, type Translate } from '../../utils/i18nHelper';
import { LanguageToggle } from '../shell/LanguageToggle';
import { ScopeNote } from '../shell/ScopeNote';
import { welcomeMessages } from './welcomeModal.messages';
import { analystWorkspaceMessages, type AnalystWorkspaceKey } from './analystWorkspace.messages';
import { ROLE_ICON, ROLE_STATION, type StaffRoleId } from '../../sim/staffRoleplay';

/** The quick role selector's order: compliance first, then front office and back office. */
const ROLE_PICKS: readonly StaffRoleId[] = ['aml', 'ekyc', 'fds', 'dispute', 'bnpl', 'cashier', 'swift'];

/**
 * "Choose Your Experience Mode": one question, three answers. It opens by itself on the first visit (uiStore remembers that it
 * has been seen) and again whenever the learner presses [🔄 Switch Experience Mode] in the header. Escape or a click on the
 * backdrop closes it without changing anything.
 */

export { ONBOARDED_KEY } from '../../store/uiStore';

type Messages = Translate<keyof typeof welcomeMessages.messages>;

function Choice({ icon, title, badge, body, onPick, testId, accent, current, m }: { icon: string; title: string; badge?: string; body: ReactNode; onPick: () => void; testId: string; accent: string; current: boolean; m: Messages }) {
  return (
    <button
      type="button"
      onClick={onPick}
      data-testid={testId}
      aria-current={current || undefined}
      className="group flex w-full items-start gap-3 rounded-xl border bg-slate-950/60 p-3.5 text-left transition hover:-translate-y-px hover:bg-slate-800/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      style={{ borderColor: current ? `${accent}aa` : 'rgba(51,65,85,0.8)' }}
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
          {current && (
            <span className="rounded-full px-2 py-px text-[10px] font-bold uppercase tracking-wider ring-1" style={{ color: accent, boxShadow: `inset 0 0 0 1px ${accent}88` }}>
              {m('current')}
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
  const m = useMessages(welcomeMessages);
  const open = useUiStore((s) => s.welcomeOpen);
  const close = useUiStore((s) => s.closeWelcome);
  // Over the 3D office a backdrop blur would make the browser re-blur a live canvas, so it gets a solid veil instead.
  const solid = useBankStore((s) => s.viewMode === '3d');
  const scope = useBankStore((s) => s.scope);
  const academyOpen = useBankStore((s) => s.academyOpen);
  const staffDesk = useBankStore((s) => s.staffDesk);
  const ws = useMessages(analystWorkspaceMessages);
  const [rolesOpen, setRolesOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

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
  const roleplay = (role: StaffRoleId): void => {
    const s = bankStore.getState();
    s.setScope('advanced');
    s.setDimension('2d');
    onChooseBank();
    close();
    setRolesOpen(false);
    bankStore.getState().openStaffDesk(ROLE_STATION[role]);
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${solid ? 'bg-black/85' : 'bg-black/80 backdrop-blur-md'}`} onClick={(e) => e.target === e.currentTarget && close()} data-testid="welcome-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="welcome-title" className="w-full max-w-xl rounded-2xl border border-slate-700/80 bg-slate-900 p-6 text-slate-100 shadow-2xl" data-testid="welcome-modal">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-400/10 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-sky-300 ring-1 ring-sky-400/40">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-300" aria-hidden="true" />
            {m('badge')}
          </span>
          <LanguageToggle variant="globe" testId="welcome-language" />
        </div>
        <h2 id="welcome-title" className="mt-3 text-[22px] font-bold leading-tight tracking-tight text-slate-50">
          {m('title')}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{m('intro')}</p>
        <div className="mt-5 space-y-2.5">
          <Choice
            icon="🧭"
            title={m('guidedTitle')}
            badge={m('recommended')}
            accent="#4ade80"
            testId="welcome-guided"
            onPick={guided}
            current={!academyOpen && scope === 'beginner'}
            m={m}
            body={m('guidedBody')}
          />
          <Choice
            icon="🏦"
            title={m('sandboxTitle')}
            accent="#c084fc"
            testId="welcome-sandbox"
            onPick={sandbox}
            current={!academyOpen && scope === 'advanced'}
            m={m}
            body={m('sandboxBody')}
          />
          <Choice
            icon="🎓"
            title={m('academyTitle')}
            accent="#38bdf8"
            testId="welcome-academy"
            onPick={academy}
            current={academyOpen}
            m={m}
            body={m('academyBody')}
          />
          <Choice
            icon="🧑‍💼"
            title={m('roleplayTitle')}
            badge={m('roleplayBadge')}
            accent="#fbbf24"
            testId="welcome-roleplay"
            onPick={() => setRolesOpen((v) => !v)}
            current={staffDesk !== null}
            m={m}
            body={m('roleplayBody')}
          />
          {rolesOpen && (
            <div role="menu" aria-label={m('roleplayPick')} className="rounded-xl border border-amber-400/40 bg-slate-950/80 p-2" data-testid="welcome-roleplay-menu">
              <div className="px-1.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-amber-200/80">{m('roleplayPick')}</div>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {ROLE_PICKS.map((role) => (
                  <button
                    key={role}
                    type="button"
                    role="menuitem"
                    onClick={() => roleplay(role)}
                    data-testid={`welcome-role-${ROLE_STATION[role]}`}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-slate-100 transition hover:bg-amber-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
                  >
                    <span aria-hidden="true">{ROLE_ICON[role]}</span>
                    <span className="min-w-0 flex-1 truncate">{ws(`role_${role}_title` as AnalystWorkspaceKey)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="mt-4 flex items-center justify-between text-[11.5px] text-slate-500">
          <span>
            {formatNodes(m('escHint'), { key: <kbd className="rounded border border-slate-700 px-1 font-mono text-[10.5px] text-slate-300">Esc</kbd> })}
          </span>
          <button type="button" onClick={close} className="font-medium text-slate-400 transition hover:text-slate-100" data-testid="welcome-skip">
            {m('skip')}
          </button>
        </div>
        <ScopeNote className="mt-3 border-t border-slate-800 pt-3" testId="welcome-scope-note" />
      </div>
    </div>
  );
}
