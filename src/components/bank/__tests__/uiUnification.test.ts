import { describe, expect, it } from 'vitest';
import { VI_DICTIONARY } from '../../../i18n/viDictionary';
import { depthMessages } from '../../shell/viewModeToggle.messages';
import { NOTICE_CORNER } from '../LivingBank';

const src = import.meta.glob(['../BankMap.tsx', '../LivingBank.tsx', '../HudToasts.tsx', '../ViewportControls.tsx', '../AnalystWorkspaceModal.tsx', '../../education/GuidedWalkthrough.tsx', '../../academy/LessonView.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('the guided tour briefing renders crisp and large', () => {
  it('mounts outside the panned, zoomed map stage, so no transform touches its text', () => {
    const map = src['../BankMap.tsx']!;
    const pan = map.indexOf('data-testid="bank-pan"');
    const overlay = map.indexOf('<SpotlightOverlay />');
    // The overlay comes after the pan layer has closed: two closing divs (stage, pan) sit between the glow and it.
    expect(overlay).toBeGreaterThan(pan);
    expect(map.slice(map.indexOf('<SearchGlow />'), overlay)).toMatch(/<\/div>\s*<\/div>/);
  });

  it('is a workspace-size card with the lime chapter tag, a large title and roomy body text', () => {
    const walk = src['../../education/GuidedWalkthrough.tsx']!;
    expect(walk).toContain('max-w-3xl');
    expect(walk).toContain('p-8 shadow-2xl');
    expect(walk).toContain('antialiased');
    expect(walk).toContain('text-lime-400');
    expect(walk).toContain('text-[26px] font-bold leading-tight tracking-tight text-white');
    expect(walk).toContain('text-base leading-relaxed text-slate-200');
    expect(walk).toContain('rounded-xl border border-slate-700/80 bg-slate-900/90 p-5');
    expect(walk).not.toContain('max-w-[560px]');
  });
});

describe('one Standard / Expert switch everywhere', () => {
  it('draws the shared DepthToggle in the header, the guided tour bar, the Academy and the workspace', () => {
    expect(src['../ViewportControls.tsx']).toContain('<DepthToggle value={depth} onChange={setDepth} testId="depth" />');
    expect(src['../../education/GuidedWalkthrough.tsx']).toContain('<DepthToggle value={depth} onChange={setDepth} testId="walk-depth" />');
    expect(src['../../academy/LessonView.tsx']).toContain('<DepthToggle value={depth} onChange={setDepth} testId="view-level" />');
    expect(src['../AnalystWorkspaceModal.tsx']).toContain('<DepthToggle value={mode} onChange={onChange} testId="workspace-mode" stateKey="mode" />');
    expect(depthMessages.messages.standard.en).toBe('Standard');
    expect(depthMessages.messages.expert.en).toBe('Expert');
  });

  it('names the scope Sub-process | Full process, with its tooltip in both languages', () => {
    const dock = src['../ViewportControls.tsx']!;
    expect(dock).toContain("t('Sub-process')");
    expect(dock).toContain("t('Full process')");
    expect(dock).toContain('🧩');
    expect(dock).toContain('🔄');
    expect(dock).toContain('title={t(SCOPE_TITLE)}');
    expect(VI_DICTIONARY['Sub-process']).toBe('Quy trình con');
    expect(VI_DICTIONARY['Full process']).toBe('Toàn trình');
    expect(VI_DICTIONARY['Switch between an isolated sub-process view (Sub-process) and the full end-to-end operating map (Full process)']).toBe(
      'Chuyển đổi giữa góc nhìn phân đoạn quy trình con (Sub-process) và sơ đồ vận hành toàn trình (Full process)',
    );
  });
});

describe('notices in the top-left corner, the legend in the top-right', () => {
  it('stacks the bank notices and the toasts in one column at the top left', () => {
    const bank = src['../LivingBank.tsx']!;
    expect(bank).toContain('absolute left-4 ${corner} z-50');
    expect(NOTICE_CORNER['2d']).toBe('top-4');
    expect(bank).toContain('<NoticeColumn />');
    expect(bank).not.toContain('left-1/2 z-30');
    expect(src['../HudToasts.tsx']).not.toContain('right-3 top-16');
  });
});
