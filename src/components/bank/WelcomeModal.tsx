import { useEffect, type ReactNode } from 'react';
import { tr } from '../../i18n/locale';
import { bankStore, useBankStore } from '../../store/bankStore';
import { useUiStore } from '../../store/uiStore';

/**
 * "Choose Your Experience Mode": one question, three answers. It opens by itself on the first visit (uiStore remembers that it
 * has been seen) and again whenever the learner presses [🔄 Switch Experience Mode] in the header. Escape or a click on the
 * backdrop closes it without changing anything.
 */

export { ONBOARDED_KEY } from '../../store/uiStore';

function Choice({ icon, title, badge, body, onPick, testId, accent, current }: { icon: string; title: string; badge?: string; body: ReactNode; onPick: () => void; testId: string; accent: string; current: boolean }) {
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
              {tr({ en: 'Current', vi: 'Đang dùng' })}
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
  const open = useUiStore((s) => s.welcomeOpen);
  const close = useUiStore((s) => s.closeWelcome);
  // Over the 3D office a backdrop blur would make the browser re-blur a live canvas, so it gets a solid veil instead.
  const solid = useBankStore((s) => s.viewMode === '3d');
  const scope = useBankStore((s) => s.scope);
  const academyOpen = useBankStore((s) => s.academyOpen);

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

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${solid ? 'bg-black/85' : 'bg-black/80 backdrop-blur-md'}`} onClick={(e) => e.target === e.currentTarget && close()} data-testid="welcome-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="welcome-title" className="w-full max-w-xl rounded-2xl border border-slate-700/80 bg-slate-900 p-6 text-slate-100 shadow-2xl" data-testid="welcome-modal">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-400/10 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-sky-300 ring-1 ring-sky-400/40">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-300" aria-hidden="true" />
          {tr({ en: 'Banking Digital Twin', vi: 'Bản sao số ngân hàng' })}
        </span>
        <h2 id="welcome-title" className="mt-3 text-[22px] font-bold leading-tight tracking-tight text-slate-50">
          {tr({ en: 'Choose Your Experience Mode', vi: 'Chọn chế độ trải nghiệm' })}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">
          {tr({
            en: 'A working bank runs here, minute by minute. Pick how you want to meet it; you can come back to this choice at any time with [🔄 Switch Experience Mode] in the header.',
            vi: 'Một ngân hàng đang vận hành từng phút ở đây. Hãy chọn cách bạn muốn làm quen với nó; bạn có thể quay lại lựa chọn này bất cứ lúc nào bằng nút [🔄 Đổi chế độ trải nghiệm] trên thanh tiêu đề.',
          })}
        </p>
        <div className="mt-5 space-y-2.5">
          <Choice
            icon="🧭"
            title={tr({ en: 'Guided Flow Explorer (Beginner)', vi: 'Khám phá luồng có hướng dẫn (Người mới)' })}
            badge={tr({ en: 'Recommended', vi: 'Khuyên dùng' })}
            accent="#4ade80"
            testId="welcome-guided"
            onPick={guided}
            current={!academyOpen && scope === 'beginner'}
            body={tr({
              en: 'Follow one payment story at a time, starting with a card tapped in a shop. Everything else fades back, and one click sends a test payment through.',
              vi: 'Theo dõi từng câu chuyện thanh toán một, bắt đầu với một lần chạm thẻ ở cửa hàng. Mọi thứ khác mờ đi, và một cú nhấp sẽ gửi một giao dịch thử đi qua.',
            })}
          />
          <Choice
            icon="🏦"
            title={tr({ en: 'Living Bank Sandbox (Advanced)', vi: 'Sa bàn ngân hàng sống (Nâng cao)' })}
            accent="#c084fc"
            testId="welcome-sandbox"
            onPick={sandbox}
            current={!academyOpen && scope === 'advanced'}
            body={tr({
              en: 'The whole bank at once: every desk, queue and wire lit. Run the day, change the rules, inject chaos, read the end-of-day report.',
              vi: 'Toàn bộ ngân hàng cùng lúc: mọi quầy, hàng chờ và đường truyền đều sáng. Chạy cả ngày, thay đổi quy tắc, gây sự cố, đọc báo cáo cuối ngày.',
            })}
          />
          <Choice
            icon="🎓"
            title={tr({ en: 'Banking Academy', vi: 'Học viện Ngân hàng' })}
            accent="#38bdf8"
            testId="welcome-academy"
            onPick={academy}
            current={academyOpen}
            body={tr({
              en: 'Six chapters with guided walkthroughs and quizzes: tokenised cards, 3DS, Pay-in-4, the night cycle, instant transfers and AML.',
              vi: 'Sáu chương với hướng dẫn từng bước và câu hỏi: thẻ mã hóa, 3DS, trả góp 4 kỳ, chu kỳ ban đêm, chuyển khoản tức thì và phòng chống rửa tiền.',
            })}
          />
        </div>
        <div className="mt-4 flex items-center justify-between text-[11.5px] text-slate-500">
          <span>
            {tr({ en: 'Press', vi: 'Nhấn' })} <kbd className="rounded border border-slate-700 px-1 font-mono text-[10.5px] text-slate-300">Esc</kbd> {tr({ en: 'to skip', vi: 'để bỏ qua' })}
          </span>
          <button type="button" onClick={close} className="font-medium text-slate-400 transition hover:text-slate-100" data-testid="welcome-skip">
            {tr({ en: 'Skip for now', vi: 'Để sau' })}
          </button>
        </div>
      </div>
    </div>
  );
}

