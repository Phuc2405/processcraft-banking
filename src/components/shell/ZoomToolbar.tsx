import type { ReactNode } from 'react';
import { tr } from '../../i18n/locale';
import { useBankStore } from '../../store/bankStore';
import { useZoomStore, zoomStore } from '../../store/zoomStore';

const Btn = ({ onClick, label, title, testId, children }: { onClick: () => void; label: string; title: string; testId: string; children: ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={title}
    data-testid={testId}
    className="grid h-8 w-8 place-items-center rounded-lg text-[15px] font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
  >
    {children}
  </button>
);

/** The floating zoom toolbar over the map: ➕ zoom in, ➖ zoom out, ⊡ fit the whole bank, and the zoom in percent. */
export function ZoomToolbar() {
  const percent = useZoomStore((s) => s.percent);
  const inspecting = useBankStore((s) => s.selection.kind !== 'none');
  const inspectorWidth = useBankStore((s) => s.inspectorWidth);
  const touring = useBankStore((s) => s.spotlight !== null);
  const send = zoomStore.getState().send;
  return (
    <div
      role="toolbar"
      aria-label={tr({ en: 'Zoom', vi: 'Thu phóng' })}
      data-testid="zoom-toolbar"
      className={`absolute bottom-24 z-30 flex flex-col items-center gap-0.5 rounded-xl border border-slate-700 bg-slate-900/95 p-1 shadow-xl transition-[right] duration-200 ${touring ? 'opacity-60 hover:opacity-100' : ''}`}
      style={{ right: inspecting ? inspectorWidth + 12 : 12 }}
    >
      <Btn onClick={() => send('in')} label={tr({ en: 'Zoom in', vi: 'Phóng to' })} title={tr({ en: 'Zoom in (or scroll up over the map)', vi: 'Phóng to (hoặc cuộn lên trên bản đồ)' })} testId="zoom-in">
        ➕
      </Btn>
      <span className="min-w-[2.75rem] rounded-md bg-slate-950 px-1 py-0.5 text-center font-mono text-[10.5px] tabular-nums text-slate-300" role="status" aria-live="polite" data-testid="zoom-percent">
        {percent}%
      </span>
      <Btn onClick={() => send('out')} label={tr({ en: 'Zoom out', vi: 'Thu nhỏ' })} title={tr({ en: 'Zoom out (or scroll down over the map)', vi: 'Thu nhỏ (hoặc cuộn xuống trên bản đồ)' })} testId="zoom-out">
        ➖
      </Btn>
      <span className="my-0.5 h-px w-6 bg-slate-700" aria-hidden="true" />
      <Btn onClick={() => send('fit')} label={tr({ en: 'Fit view', vi: 'Vừa khung hình' })} title={tr({ en: 'Fit the whole bank on screen and re-centre it', vi: 'Hiển thị toàn bộ ngân hàng và căn giữa lại' })} testId="zoom-fit">
        ⊡
      </Btn>
    </div>
  );
}
