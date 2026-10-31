import { tr } from '../../i18n/locale';
import { uiStore, useUiStore } from '../../store/uiStore';

/** [🔄 Switch Experience Mode]: reopens the mode chooser in place. */
export function SwitchModeButton() {
  const open = useUiStore((s) => s.welcomeOpen);
  return (
    <button
      type="button"
      onClick={() => uiStore.getState().openWelcome()}
      aria-haspopup="dialog"
      aria-expanded={open}
      data-testid="switch-mode"
      title={tr({ en: 'Back to the Choose Your Experience Mode screen', vi: 'Quay lại màn hình Chọn chế độ trải nghiệm' })}
      className="flex items-center gap-1.5 whitespace-nowrap rounded-md bg-lime-400/10 px-2 py-1 text-[12px] font-semibold text-lime-200 ring-1 ring-lime-300/50 transition hover:bg-lime-400/20 hover:text-lime-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-300"
    >
      <span aria-hidden="true">🔄</span>
      <span className="max-[1639px]:sr-only">{tr({ en: 'Switch Experience Mode', vi: 'Đổi chế độ trải nghiệm' })}</span>
    </button>
  );
}
