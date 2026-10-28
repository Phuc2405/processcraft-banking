import { t } from '../../../i18n/t';
import { Canvas } from '@react-three/fiber';
import { Component, memo, useCallback, useState, type ErrorInfo, type ReactNode } from 'react';
import { useAcademyStore } from '../../../store/academyStore';
import { activeFlowOf, useBankStore } from '../../../store/bankStore';
import { OfficeScene } from './OfficeScene';
import { TourLayer3D } from './TourLayer3D';
import { CAMERA_DIRECTION, CAMERA_DISTANCE } from './layout3d';
import { atmosphereAt, WEATHERS, type DayPart, type Weather } from './atmosphere';
import { useWeather, weatherStore } from './weather';
import { skyFlash } from './Environment3D';
import { SegmentedToggle } from '../../shell/SegmentedToggle';
import { MapLegend } from '../MapLegend';
import { useDockInset } from '../ViewportControls';

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
const WEATHER_LABEL: Record<Weather, string> = { clear: '🌤️ Clear', harsh: '🔆 Harsh sun', overcast: '☁️ Overcast', rain: '🌧️ Rain', storm: '⛈️ Storm' };
const WEATHER_HINT: Record<Weather, string> = {
  clear: 'Clear sky and a light breeze: people stroll and stop to chat',
  harsh: 'Hard, bright sun with strong contrast and dust in the air',
  overcast: 'A grey, gloomy sky and soft, shadowless light',
  rain: 'Rain: people open umbrellas one by one or run for the shelters, and the street turns wet',
  storm: 'A storm: dark clouds, lightning, heavy rain and trees bending in the wind; people crowd the bus stop calling taxis',
};

/** The time of day and the weather picker, beside the other 3D controls. The sky eases to a new weather over two seconds. */
function WeatherControls() {
  const part = useBankStore((s) => atmosphereAt(s.view.minute).part);
  const weather = useWeather((s) => s.weather);
  return (
    <div className="flex items-center gap-1.5">
      <span className="rounded-lg border border-white bg-white/90 px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-700 shadow-md" data-testid="office-daypart" data-part={part}>
        {t(DAY_PART_LABEL[part])}
      </span>
      <SegmentedToggle<Weather>
        label={t('Weather')}
        value={weather}
        onChange={(w) => weatherStore.getState().setWeather(w)}
        testId="office-weather"
        stateKey="weather"
        options={WEATHERS.map((w) => ({ value: w, label: t(WEATHER_LABEL[w]), hint: t(WEATHER_HINT[w]), tone: w === 'storm' ? 'violet' : 'sky' }))}
      />
    </div>
  );
}

/**
 * The 3D Isometric Office: the same bank as the 2D blueprint, as a bright low-poly diorama. It reads the same store, so
 * the desks, the queues, the staff and the payments on the move are the ones the 2D map shows, and clicking a counter
 * opens the same inspector. It is loaded on demand (LivingBank lazy-imports it), so the 2D view never pays for three.js.
 *
 * The component takes no props and is memoised: when the inspector opens over it, nothing here re-renders and the canvas
 * keeps its size, so there is no resize and no layout work.
 */

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
  const splitOpen = useAcademyStore((s) => s.isSplitScreenOpen);
  const resumeOffered = useBankStore((s) => s.leftTour !== null);
  const [resetKey, setResetKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [lost, setLost] = useState(false);
  const back = useCallback(() => setViewMode('2d'), [setViewMode]);
  // The legend sits top-right, under the viewport dock and left of the zoom toolbar and the inspector, as on the 2D map.
  const dockInset = useDockInset();
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
      {/* Beside the Academy panel the map is narrow, so these controls step down below the viewport dock instead of sharing its row. */}
      <div className={`absolute left-3 z-30 flex flex-col items-start gap-1.5 ${splitOpen ? 'top-[108px]' : 'top-3 xl:flex-row xl:items-center'}`}>
        <button
          type="button"
          onClick={() => setResetKey((n) => n + 1)}
          data-testid="office-reset"
          className="rounded-lg border border-white bg-white/90 px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-700 shadow-md transition hover:bg-white"
          title={touring ? t('Glide back to the desk the tour is at') : t('Glide back to the whole office')}
        >
          {t('Reset view')}
        </button>
        <button
          type="button"
          onClick={() => setLabelMode(labelMode === 'always' ? 'hover' : 'always')}
          data-testid="office-labels"
          aria-pressed={labelMode === 'hover'}
          className="rounded-lg border border-white bg-white/90 px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-700 shadow-md transition hover:bg-white"
          title={labelMode === 'always' ? t('Hide the floating name badges until you point at a workstation') : t('Show a floating name badge over every workstation')}
        >
          {t('Labels:')} {labelMode === 'always' ? t('Always Show') : t('Hover Only')}
        </button>
        <WeatherControls />
      </div>
      {!touring && <MapLegend top={dockInset + 12} right={legendRight} />}
    </div>
  );
}

const Office3D = memo(Office3DView);
export default Office3D;
