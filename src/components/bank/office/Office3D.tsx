import { t } from '../../../i18n/t';
import { Canvas } from '@react-three/fiber';
import { Component, memo, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type KeyboardEvent, type ReactNode } from 'react';
import { activeFlowOf, floatingBarsHiddenOf, useBankStore } from '../../../store/bankStore';
import { OfficeScene } from './OfficeScene';
import { TourLayer3D } from './TourLayer3D';
import { CAMERA_DIRECTION, CAMERA_DISTANCE } from '../../../engine/plan/layout3d';
import { atmosphereAt, WEATHERS, type DayPart } from '../../../engine/world/atmosphere';
import { WeatherCycle } from '../../../engine/world/weatherCycle';
import { weatherStore, type WeatherChoice } from '../../../engine/world/weather';
import { useWeather } from './useWeather';
import { skyFlash } from './Environment3D';
import { MapLegend } from '../MapLegend';
import { topBand, useBelowDock, useMeasuredBox, useRightInset, useTopBand } from '../ViewportControls';
import { SubProcessMenu } from '../SubProcessMenu';
import { AdaptivePopover, listboxKey } from '../../shell/AdaptivePopover';

/** The sky behind the diorama: a gradient from the time-of-day presets and the weather blend, redrawn every ten bank minutes and as the weather eases. A white layer over it flashes with the storm's lightning. */
function SkyBackdrop() {
  const slot = useBankStore((s) => Math.floor(s.view.minute / 10));
  const mix = useWeather((s) => s.mix);
  const a = atmosphereAt(slot * 10, mix);
  return (
    <>
      <div className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(180deg, ${a.skyTop} 0%, ${a.skyHorizon} 78%, ${a.fog.color} 100%)` }} data-testid="office-sky" data-part={a.part} aria-hidden="true" />
      <div
        ref={(el) => {
          skyFlash.el = el;
        }}
        className="pointer-events-none absolute inset-0 bg-[#eef3ff] opacity-0"
        aria-hidden="true"
      />
    </>
  );
}

const DAY_PART_LABEL: Record<DayPart, string> = { morning: '☀️ Morning', noon: '🌞 Noon', afternoon: '🌇 Afternoon', night: '🌙 Night' };
export const WEATHER_LABEL: Record<WeatherChoice, string> = {
  random: '🎲 Weather: Random (auto-switch)',
  clear: '☀️ Clear / Light sun',
  cloudy: '☁️ Overcast / Cloudy',
  hot: '🔥 Hot & dry',
  rain: '🌧️ Rain & drizzle',
  storm: '🌩️ Heavy storm & lightning',
  hail: '🧊 Hailstorm',
  fog: '🌫️ Fog',
  smog: '😷 Smog / fine dust',
  autumn: '🍂 Falling leaves',
  spring: '🌸 Blossom drift',
  pollen: '🌼 Pollen drift',
  snow: '❄️ Snow & frost',
};
export const WEATHER_HINT: Record<WeatherChoice, string> = {
  random: 'Moves on to another everyday weather every few minutes, blending over two seconds (never snow or hail)',
  clear: 'Clear sky and a light breeze: people stroll and stop to chat',
  cloudy: 'A dark, desaturated grey sky, soft diffuse light and a cool breeze: jackets on',
  hot: 'Hard, bright sun with strong contrast: T-shirts, sunglasses and cold drinks',
  rain: 'Rain sets in gradually: people look up, raise their umbrellas one by one or run for the shelters, and the street turns wet',
  storm: 'Lightning, heavy slanting rain, wind streaks and trees bending; people crowd the glass bus stop calling taxis',
  hail: 'Ice pellets bouncing on the ground: everyone ducks under the entrance canopy (pick by hand only)',
  fog: 'Dense morning fog over the street, the lamps glowing; it lifts as the bank opens at 9:00',
  smog: 'A heavy yellowish haze with the street lights on: people wear face masks',
  autumn: 'A gusty day with brown and orange leaves blowing across the street: jackets on',
  spring: 'Pink and white blossom petals fluttering on the breeze',
  pollen: 'Pollen floating thick in the sunlight: people wear face masks',
  snow: 'Falling snow settling on the ground: coats, scarves and beanies (pick by hand only)',
};

/** In random mode, moves the weather on: once on arrival, then whenever the weather's spell is over (WEATHER_SPAN, in the bank's minutes. */
function RandomWeather() {
  const random = useWeather((s) => s.choice === 'random');
  const minute = useBankStore((s) => s.view.minute);
  // When the spell is over and what comes next is the weather cycle's to say (engine/world/weatherCycle.ts).
  const cycle = useMemo(() => new WeatherCycle(), []);
  useEffect(() => {
    const s = weatherStore.getState();
    const next = cycle.update(minute, s.weather, random);
    if (next) s.setWeather(next);
  }, [cycle, random, minute]);
  return null;
}

const CHOICES: readonly WeatherChoice[] = ['random', ...WEATHERS];

/** The weather dropdown: random (the default) or one of the nine weathers. */
function WeatherMenu({ compact = false }: { compact?: boolean }) {
  const choice = useWeather((s) => s.choice);
  const weather = useWeather((s) => s.weather);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const pickChoice = (c: WeatherChoice | undefined): void => {
    if (c) weatherStore.getState().choose(c);
    setOpen(false);
    trigger.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (!open) return;
    const next = listboxKey(e.key, active, CHOICES.length);
    if (next === null) return;
    e.preventDefault();
    if (next === 'pick') pickChoice(CHOICES[active]);
    else if (next === 'close') {
      e.stopPropagation();
      setOpen(false);
    } else setActive(next);
  };
  const shown = choice === 'random' ? `🎲 ${t('Random')} · ${t(WEATHER_LABEL[weather])}` : t(WEATHER_LABEL[choice]);
  // Where the row is tight the button shrinks to the weather's own icon, so everything stays on one line.
  const icon = `${choice === 'random' ? '🎲 ' : ''}${WEATHER_LABEL[weather].split(' ')[0]}`;
  return (
    <div className="relative shrink-0" data-testid="office-weather" data-weather={weather} data-choice={choice}>
      <button
        ref={trigger}
        type="button"
        className={`flex ${compact ? 'w-[76px]' : 'w-[250px]'} items-center justify-between gap-2 rounded-lg border border-white bg-white/90 px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-700 shadow-md hover:bg-white`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={t(WEATHER_HINT[choice])}
        onClick={() => {
          setActive(Math.max(0, CHOICES.indexOf(choice)));
          setOpen((o) => !o);
        }}
        onKeyDown={onKeyDown}
      >
        {compact ? (
          <span className="truncate" aria-label={`${t('Weather')}: ${shown}`}>
            {icon}
          </span>
        ) : (
          <span className="truncate">
            <span className="text-slate-500">{t('Weather')}:</span> {shown}
          </span>
        )}
        <span aria-hidden="true" className="text-slate-400">
          ▾
        </span>
      </button>
      {open && (
        <AdaptivePopover anchor={trigger} onClose={() => setOpen(false)} width={300} label={t('Weather')} testId="office-weather-list" activeIndex={active} className="border-slate-200 bg-white py-1 shadow-xl">
          {CHOICES.map((c, i) => (
            <li key={c} role="option" aria-selected={c === choice} data-index={i} data-weather-option={c}>
              <button
                type="button"
                className={`block w-full px-3 py-1.5 text-left ${c === choice ? 'bg-sky-50 text-sky-800' : i === active ? 'bg-slate-50 text-slate-700' : 'text-slate-700 hover:bg-slate-50'} ${c === 'random' ? 'border-b border-slate-100' : ''}`}
                onClick={() => pickChoice(c)}
              >
                <span className="block text-[12px] font-semibold">{t(WEATHER_LABEL[c])}</span>
                <span className="block text-[10.5px] leading-snug text-slate-500">{t(WEATHER_HINT[c])}</span>
              </button>
            </li>
          ))}
        </AdaptivePopover>
      )}
    </div>
  );
}

/** The time of day and the weather dropdown, beside the other 3D controls. */
function WeatherControls({ compact }: { compact: boolean }) {
  const part = useBankStore((s) => atmosphereAt(s.view.minute).part);
  const label = t(DAY_PART_LABEL[part]);
  return (
    <div className="flex shrink-0 items-center gap-1.5" data-testid="office-weather-bar">
      <span className="whitespace-nowrap rounded-lg border border-white bg-white/90 px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-700 shadow-md" data-testid="office-daypart" data-part={part} title={label}>
        {compact ? label.split(' ')[0] : label}
      </span>
      <WeatherMenu compact={compact} />
    </div>
  );
}

/** The 3D office's one row of controls, under the viewport dock: a single cluster centred in the free map, the sub-process menu first, then the time, weather and view controls. Only the controls catch the pointer, so the map can still be dragged either side of them. Above the map's banners and cards (z-40), under every modal (z-50 and up). */
export const TOOLBAR_CLASS = 'pointer-events-none absolute left-0 z-[45] flex w-full flex-row flex-nowrap items-center justify-center gap-3 px-2';

/** Under this width the row shrinks its words to icons (the full words are in their tooltips), so it stays on one line. */
export const TOOLBAR_FULL_PX = 900;

/** The 3D Isometric Office: the same bank as the 2D blueprint, as a bright low-poly diorama. */

class OfficeBoundary extends Component<{ onBack: () => void; children: ReactNode }, { error: string | null }> {
  override state = { error: null as string | null };

  static getDerivedStateFromError(error: unknown): { error: string } {
    return { error: error instanceof Error ? error.message : t('The 3D view could not start.') };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('3D office failed', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    return <Unavailable reason={this.state.error} onBack={this.props.onBack} />;
  }
}

function Unavailable({ reason, onBack }: { reason: string; onBack: () => void }) {
  return (
    <div className="grid h-full place-items-center bg-slate-950 p-8" role="alert" data-testid="office-3d-failed">
      <div className="max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center">
        <h2 className="text-[16px] font-bold text-slate-50">{t('The 3D office could not start')}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-300">{t('Your browser or graphics driver would not give us a 3D surface. Nothing is lost: the 2D blueprint shows the same bank.')}</p>
        <p className="mt-2 break-words text-[11px] text-slate-500">{reason}</p>
        <button type="button" onClick={onBack} className="mt-4 rounded-lg bg-lime-400 px-4 py-2 text-[13px] font-bold text-slate-950 hover:bg-lime-300">
          {t('Back to the 2D blueprint')}
        </button>
      </div>
    </div>
  );
}

function Office3DView() {
  const setViewMode = useBankStore((s) => s.setViewMode);
  const labelMode = useBankStore((s) => s.labelMode);
  const setLabelMode = useBankStore((s) => s.setLabelMode);
  const touring = useBankStore((s) => s.spotlight !== null);
  const flowOn = useBankStore((s) => activeFlowOf(s) !== null);
  const resumeOffered = useBankStore((s) => s.leftTour !== null);
  const [resetKey, setResetKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [lost, setLost] = useState(false);
  const back = useCallback(() => setViewMode('2d'), [setViewMode]);
  // The legend sits top-right, under the viewport dock and left of the zoom toolbar and the inspector, as on the 2D map.
  const legendTop = useBelowDock();
  // The row stands just under the viewport dock, whatever height the dock takes on screen.
  const dockBottom = useTopBand((s) => s.dock?.bottom ?? 0);
  const toolbarTop = dockBottom ? dockBottom + 6 : 12;
  const rightInset = useRightInset();
  const mapW = useTopBand((s) => s.mapW);
  const tight = mapW > 0 && mapW - rightInset < TOOLBAR_FULL_PX;
  const kickoff = useBankStore(floatingBarsHiddenOf);
  const showMenu = useBankStore((s) => s.scope === 'beginner' && s.spotlight === null) && !kickoff;
  const toolbar = useRef<HTMLDivElement>(null);
  useMeasuredBox(toolbar, (b) => topBand.setState({ toolbar: b }), [toolbarTop, tight, labelMode, touring, showMenu, kickoff]);
  const legendRight = useBankStore((s) => 76 + (s.selection.kind !== 'none' ? s.inspectorWidth : 0));

  if (lost) return <Unavailable reason="The graphics context was lost." onBack={back} />;

  const k = CAMERA_DISTANCE / Math.sqrt(CAMERA_DIRECTION[0] ** 2 + CAMERA_DIRECTION[1] ** 2 + 1);

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-900" data-testid="office-3d" data-ready={ready} data-tour={touring ? 'on' : 'off'}>
      <SkyBackdrop />
      {/* The sky behind the diorama dims with the room while a tour runs, so the lit desks stand out against it. */}
      <div className={`pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,#1e293b_0%,#0f172a_70%,#070b14_100%)] transition-opacity duration-700 ${touring ? 'opacity-90' : flowOn ? 'opacity-60' : 'opacity-0'}`} aria-hidden="true" />
      <OfficeBoundary onBack={back}>
        <Canvas
          orthographic
          flat
          // Drawn on demand: OfficeScene's FrameDriver asks for frames while something moves, and the canvas rests otherwise.
          frameloop="demand"
          dpr={[1, 1.5]}
          camera={{ position: [CAMERA_DIRECTION[0] * k, k, CAMERA_DIRECTION[1] * k], zoom: 28, near: 0.1, far: 400 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            setReady(true);
            gl.domElement.addEventListener('webglcontextlost', (e) => {
              e.preventDefault();
              setLost(true);
            });
          }}
        >
          <OfficeScene resetKey={resetKey} />
        </Canvas>
      </OfficeBoundary>

      {!ready && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-[13px] text-slate-500" role="status">
          Building the office…
        </div>
      )}

      <TourLayer3D />

      <div className={`pointer-events-none absolute bottom-3 left-3 z-30 ${touring || resumeOffered || flowOn ? 'hidden' : 'flex'} flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white bg-white/90 px-3 py-1.5 text-[11px] text-slate-500 shadow-md`} data-testid="office-hint">
        <span>
          <b className="font-semibold text-slate-800">{t('Drag')}</b>{t(' to pan')}
        </span>
        <span>
          <b className="font-semibold text-slate-800">{t('Scroll')}</b>{t(' to zoom')}
        </span>
        <span>
          <b className="font-semibold text-slate-800">{t('Right-drag')}</b>{t(' to turn')}
        </span>
        <span>
          <b className="font-semibold text-slate-800">{t('Click')}</b>{t(' a desk or a person to inspect it')}
        </span>
      </div>
      {/* One centred row: the menu, then the time, weather and view controls beside it. It never wraps: where the map is narrow the controls shrink to their icons instead. */}
      <div ref={toolbar} className={TOOLBAR_CLASS} style={{ top: toolbarTop, width: `calc(100% - ${rightInset}px)` }} data-testid="office-toolbar">
        {showMenu && (
          <div className="pointer-events-auto min-w-0 shrink" data-testid="office-toolbar-left">
            <SubProcessMenu />
          </div>
        )}
        <div className="pointer-events-auto flex shrink-0 flex-nowrap items-center gap-1.5" data-testid="office-toolbar-right">
          {!kickoff && <WeatherControls compact={tight} />}
        <button
          type="button"
          onClick={() => setResetKey((n) => n + 1)}
          data-testid="office-reset"
          className="whitespace-nowrap rounded-lg border border-white bg-white/90 px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-700 shadow-md transition hover:bg-white"
          title={touring ? t('Glide back to the desk the tour is at') : t('Glide back to the whole office')}
          aria-label={t('Reset view')}
        >
          {tight ? '↺' : t('Reset view')}
        </button>
        <button
          type="button"
          onClick={() => setLabelMode(labelMode === 'always' ? 'hover' : 'always')}
          data-testid="office-labels"
          aria-pressed={labelMode === 'hover'}
          className="whitespace-nowrap rounded-lg border border-white bg-white/90 px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-700 shadow-md transition hover:bg-white"
          title={labelMode === 'always' ? t('Hide the floating name badges until you point at a workstation') : t('Show a floating name badge over every workstation')}
        >
          {tight ? '🏷' : `${t('Labels:')} ${labelMode === 'always' ? t('Always Show') : t('Hover Only')}`}
        </button>
        </div>
      </div>
      {/* The weather keeps changing in random mode even while its controls stand aside (a tour's kickoff card). */}
      <RandomWeather />
      {!touring && <MapLegend top={legendTop} right={legendRight} />}
    </div>
  );
}

const Office3D = memo(Office3DView);
export default Office3D;
