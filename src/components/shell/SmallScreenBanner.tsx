import { useEffect, useState } from 'react';
import { tr } from '../../i18n/locale';

const QUERY = '(max-width: 767px)';
const DISMISS_KEY = 'processcraft:v1:small-screen-dismissed';

function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** True while the window is narrower than 768 px. */
export function useSmallScreen(): boolean {
  const [small, setSmall] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(QUERY);
    const on = (): void => setSmall(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return small;
}

/** On a screen narrower than 768 px: a notice that the bank is built for a desktop, pinned to the top of the viewport (the app itself keeps its desktop width and scrolls sideways). */
export function SmallScreenBanner() {
  const small = useSmallScreen();
  const [dismissed, setDismissed] = useState(readDismissed);
  if (!small || dismissed) return null;
  const dismiss = (): void => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Remembering it is a nicety.
    }
    setDismissed(true);
  };
  return (
    <div role="status" data-testid="small-screen-banner" className="fixed inset-x-0 top-0 z-[60] flex items-start gap-3 border-b border-amber-400/50 bg-amber-950/95 px-4 py-3 text-amber-50 shadow-xl backdrop-blur" style={{ width: '100vw' }}>
      <span className="text-[20px] leading-none" aria-hidden="true">
        🖥️
      </span>
      <p className="min-w-0 flex-1 text-[13px] leading-snug">
        <span className="font-bold">{tr({ en: 'Best on a desktop.', vi: 'Hiển thị tốt nhất trên máy tính.' })}</span>{' '}
        {tr({
          en: 'The Living Bank, its 3D office and the Build Lab canvas need at least 768 px. On this screen, scroll sideways or turn your device to landscape.',
          vi: 'Ngân hàng sống, văn phòng 3D và sơ đồ Build Lab cần chiều rộng tối thiểu 768 px. Trên màn hình này, hãy cuộn ngang hoặc xoay thiết bị sang chế độ ngang.',
        })}
      </p>
      <button type="button" onClick={dismiss} data-testid="small-screen-dismiss" aria-label={tr({ en: 'Dismiss', vi: 'Đóng' })} className="rounded-md px-2 py-0.5 text-[18px] leading-none text-amber-200 hover:bg-amber-900">
        ×
      </button>
    </div>
  );
}
