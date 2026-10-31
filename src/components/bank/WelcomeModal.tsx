import { useEffect, useRef, useState } from 'react';
import { bankStore, useBankStore, type BankState } from '../../store/bankStore';
import { useUiStore } from '../../store/uiStore';
import { formatNodes, useMessages, type Translate } from '../../utils/i18nHelper';
import { LanguageToggle } from '../shell/LanguageToggle';
import { ScopeNote } from '../shell/ScopeNote';
import { welcomeMessages } from './welcomeModal.messages';
import { analystWorkspaceMessages, type AnalystWorkspaceKey } from './analystWorkspace.messages';
import { ROLE_ICON, ROLE_STATION, type StaffRoleId } from '../../sim/staffRoleplay';

/** "Choose Your Experience Mode": one question, four answers, in a window that fits any screen: its header and footer stay put and only the choices scroll. */

/** The quick role selector's order: compliance first, then front office and back office. */
const ROLE_PICKS: readonly StaffRoleId[] = ['aml', 'ekyc', 'fds', 'dispute', 'bnpl', 'cashier', 'swift'];

type MessageKey = keyof typeof welcomeMessages.messages;
type Messages = Translate<MessageKey>;

/** What a mode does when picked, given what the chooser can do. */
interface ModeActions {
  enterBank(scope: BankState['scope'], resetDepth?: boolean): void;
  openAcademy(): void;
  toggleRoles(): void;
}

interface ModeDef {
  id: 'guided' | 'sandbox' | 'academy' | 'roleplay';
  icon: string;
  accent: string;
  title: MessageKey;
  body: MessageKey;
  badge?: MessageKey;
  isCurrent(s: Pick<BankState, 'scope' | 'academyOpen' | 'staffDesk'>): boolean;
  pick(a: ModeActions): void;
}

/** The modes (Strategy): a new way to explore the bank is one more entry. */
export const WELCOME_MODES: readonly ModeDef[] = [
  {
    id: 'guided',
    icon: '🧭',
    accent: '#4ade80',
    title: 'guidedTitle',
    body: 'guidedBody',
    badge: 'recommended',
    isCurrent: (s) => !s.academyOpen && s.scope === 'beginner',
    pick: (a) => {
      a.enterBank('beginner', true);
      bankStore.getState().setActiveFlow(1);
    },
  },
  { id: 'sandbox', icon: '🏦', accent: '#c084fc', title: 'sandboxTitle', body: 'sandboxBody', isCurrent: (s) => !s.academyOpen && s.scope === 'advanced', pick: (a) => a.enterBank('advanced', true) },
  { id: 'academy', icon: '🎓', accent: '#38bdf8', title: 'academyTitle', body: 'academyBody', isCurrent: (s) => s.academyOpen, pick: (a) => a.openAcademy() },
  { id: 'roleplay', icon: '🧑‍💼', accent: '#fbbf24', title: 'roleplayTitle', body: 'roleplayBody', badge: 'roleplayBadge', isCurrent: (s) => s.staffDesk !== null, pick: (a) => a.toggleRoles() },
];

function ModeCard({ mode, current, expanded, onPick, m }: { mode: ModeDef; current: boolean; expanded?: boolean; onPick: () => void; m: Messages }) {
  const { accent, icon } = mode;
  return (
    <button
      type="button"
      onClick={onPick}
      data-testid={`welcome-${mode.id}`}
      aria-current={current || undefined}
      aria-expanded={expanded}
      className="group flex h-full w-full flex-col gap-2 rounded-xl border bg-slate-950/60 p-3.5 text-left transition hover:bg-slate-800/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white sm:p-4"
      style={{ borderColor: current || expanded ? `${accent}aa` : 'rgba(51,65,85,0.8)' }}
    >
      <span className="flex items-start gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[18px]" style={{ background: `${accent}22`, boxShadow: `inset 0 0 0 1px ${accent}55` }} aria-hidden="true">
          {icon}
        </span>
        <span className="min-w-0 flex-1 text-[14px] font-bold leading-snug text-slate-50">{m(mode.title)}</span>
        <span className="shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-slate-200" aria-hidden="true">
          →
        </span>
      </span>
      <span className="line-clamp-2 text-xs leading-snug text-slate-400" title={m(mode.body)}>
        {m(mode.body)}
      </span>
      {(mode.badge || current) && (
        <span className="mt-auto flex flex-wrap items-center gap-1.5">
          {mode.badge && (
            <span className="rounded-full px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wider text-slate-950" style={{ background: accent }}>
              {m(mode.badge)}
            </span>
          )}
          {current && (
            <span className="rounded-full px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wider" style={{ color: accent, boxShadow: `inset 0 0 0 1px ${accent}88` }}>
              {m('current')}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

function RoleMenu({ onPick, m }: { onPick: (role: StaffRoleId) => void; m: Messages }) {
  const ws = useMessages(analystWorkspaceMessages);
  const box = useRef<HTMLDivElement>(null);
  // It opens under the grid, which may be below the fold of a short window.
  useEffect(() => {
    box.current?.scrollIntoView({ block: 'nearest' });
  }, []);
  return (
    <div ref={box} role="menu" aria-label={m('roleplayPick')} className="mt-3 rounded-xl border border-amber-400/40 bg-slate-950/80 p-2" data-testid="welcome-roleplay-menu">
      <div className="px-1.5 pb-1 text-[11.5px] font-semibold uppercase tracking-wider text-amber-200/80">{m('roleplayPick')}</div>
      <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
        {ROLE_PICKS.map((role) => (
          <button key={role} type="button" role="menuitem" onClick={() => onPick(role)} data-testid={`welcome-role-${ROLE_STATION[role]}`} className="flex items-center gap-2 rounded-lg px-2 py-1 text-left text-[13px] text-slate-100 transition hover:bg-amber-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
            <span aria-hidden="true">{ROLE_ICON[role]}</span>
            <span className="min-w-0 flex-1 truncate">{ws(`role_${role}_title` as AnalystWorkspaceKey)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function WelcomeModal({ onOpenAcademy, onChooseBank }: { onOpenAcademy: () => void; onChooseBank: () => void }) {
  const m = useMessages(welcomeMessages);
  const open = useUiStore((s) => s.welcomeOpen);
  const close = useUiStore((s) => s.closeWelcome);
  const scope = useBankStore((s) => s.scope);
  const academyOpen = useBankStore((s) => s.academyOpen);
  const staffDesk = useBankStore((s) => s.staffDesk);
  const [rolesOpen, setRolesOpen] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setRolesOpen(false);
    const before = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => before?.focus?.();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Esc steps back: out of the role list first, then out of the chooser.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (rolesOpen) setRolesOpen(false);
      else close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, rolesOpen]);

  if (!open) return null;

  const enterBank = (nextScope: BankState['scope'], resetDepth = false): void => {
    const s = bankStore.getState();
    s.setScope(nextScope);
    s.setDimension('2d');
    if (resetDepth) s.setDataDepth('standard');
    onChooseBank();
    close();
  };
  const actions: ModeActions = {
    enterBank,
    openAcademy: () => {
      close();
      onOpenAcademy();
    },
    toggleRoles: () => setRolesOpen((v) => !v),
  };
  const startShift = (role: StaffRoleId): void => {
    enterBank('advanced');
    bankStore.getState().openStaffDesk(ROLE_STATION[role]);
  };

  // Above the header's language switch (z-60): this window has its own. No backdrop blur: the bank stays in view around a compact window, and a live 3D canvas is not re-blurred.
  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/65" onClick={(e) => e.target === e.currentTarget && close()} data-testid="welcome-backdrop">
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="welcome-title" className="flex max-h-[85vh] w-[92%] max-w-[680px] flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 text-slate-100 shadow-2xl outline-none" data-testid="welcome-modal">
        <header className="shrink-0 border-b border-slate-800 px-4 py-2.5 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-400/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-sky-300 ring-1 ring-sky-400/40">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-300" aria-hidden="true" />
              {m('badge')}
            </span>
            <LanguageToggle variant="globe" testId="welcome-language" />
          </div>
          <h2 id="welcome-title" className="mt-1.5 text-[19px] font-bold leading-tight tracking-tight text-slate-50">
            {m('title')}
          </h2>
          {/* On a very short window the choices need the room more than the introduction does. */}
          <p className="mt-0.5 text-[13px] leading-snug text-slate-400 [@media(max-height:560px)]:hidden">{m('intro')}</p>
        </header>
        <div className="bk-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5" data-testid="welcome-body">
          <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2" data-testid="welcome-modes">
            {WELCOME_MODES.map((mode) => (
              <ModeCard key={mode.id} mode={mode} current={mode.isCurrent({ scope, academyOpen, staffDesk })} {...(mode.id === 'roleplay' ? { expanded: rolesOpen } : {})} onPick={() => mode.pick(actions)} m={m} />
            ))}
          </div>
          {rolesOpen && <RoleMenu onPick={startShift} m={m} />}
          <ScopeNote className="mt-3" testId="welcome-scope-note" />
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-800 px-4 py-2 text-[12px] text-slate-500 sm:px-5">
          <span>{formatNodes(m('escHint'), { key: <kbd className="rounded border border-slate-700 px-1 font-mono text-[11px] text-slate-300">Esc</kbd> })}</span>
          <button type="button" onClick={close} className="font-medium text-slate-400 transition hover:text-slate-100" data-testid="welcome-skip">
            {m('skip')}
          </button>
        </footer>
      </div>
    </div>
  );
}
