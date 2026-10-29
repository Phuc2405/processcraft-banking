import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, CanvasTexture, Path, ShapeGeometry, SRGBColorSpace, Vector3, type Group, type Mesh, type MeshBasicMaterial, type PointLight } from 'three';
import type { PlaceId } from '../../../sim/topology';
import { prefersReducedMotion } from '../../canvas/timing';
import { useSpotlightFocus, type Focus } from '../useSpotlight';
import { roundedRect, roundedRectPath } from './kit';
import { publishTourScreen, type ScreenRect } from './tourBridge';
import { frameFocus, framedPlaces, MAX_POOLS, placeFootprint, placeXZ, pointAlongPath, pathLength, poolPlaces, TOKEN_HEIGHT, tourPath, tourTravelMs, type CamFocus } from './tour3d';
import type { V2 } from '../../../engine/plan/layout3d';

/**
 * The 3D half of a guided tour (the words are the same StepCard the 2D map uses, laid over the canvas by Office3D):
 *
 *   useTourCamera   where the camera should be for the current step (OfficeScene hands it to the CameraRig)
 *   TourStage       a soft ring of light on the floor round every desk of the chapter, real pools of light on the nearest ones,
 *                   and a glowing token that travels the floor lanes from desk to desk
 *
 * The daylight itself is dimmed by the Lights of the scene while a tour runs, so the lit desks stand out.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Camera
// ─────────────────────────────────────────────────────────────────────────────

/** The camera for the tour step on screen, or null when there is no tour. The briefing shows the whole chapter at once. */
export function useTourCamera(): CamFocus | null {
  const focus = useSpotlightFocus();
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  return useMemo(() => {
    if (!focus) return null;
    const viewport = { w: width, h: height };
    if (focus.tour.intro) return frameFocus([...focus.scope.places], viewport);
    return frameFocus(framedPlaces(focus.current.place, focus.plan.steps[focus.index + 1]?.place), viewport);
  }, [focus, width, height]);
}

/** How long the 3D office takes to bring the token to the current step: the same number the token itself uses. */
export function arrivalMs3d(focus: Focus): number {
  if (prefersReducedMotion() || focus.current.route.length < 2) return 0;
  return tourTravelMs(tourPath(focus.current.route));
}

// ─────────────────────────────────────────────────────────────────────────────
// Light on the floor
// ─────────────────────────────────────────────────────────────────────────────

export type Role = 'here' | 'next' | 'visited' | 'lit';

let glowTex: CanvasTexture | null = null;
/** A soft round spot, white in the middle and clear at the edge, drawn once and tinted by each material. */
function glowTexture(): CanvasTexture {
  if (glowTex) return glowTex;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
  }
  glowTex = new CanvasTexture(c);
  glowTex.colorSpace = SRGBColorSpace;
  return glowTex;
}

const RING_OPACITY: Record<Role, number> = { here: 0.95, next: 0.7, visited: 0.5, lit: 0.34 };
const GLOW_OPACITY: Record<Role, number> = { here: 0.7, next: 0.42, visited: 0.28, lit: 0.2 };

/** The ring of light round one desk of the chapter: a crisp rounded outline and a soft glow under it. The desk the token is at pulses. */
export function GroundMark({ place, role, accent }: { place: PlaceId; role: Role; accent: string }) {
  const f = useMemo(() => placeFootprint(place), [place]);
  const ring = useMemo(() => {
    const w = f.w + 0.9;
    const d = f.d + 0.8;
    const outer = roundedRect(w, d, 0.7);
    outer.holes.push(roundedRectPath(new Path(), w - 0.2, d - 0.2, 0.6));
    return new ShapeGeometry(outer, 12);
  }, [f.w, f.d]);
  useEffect(() => () => ring.dispose(), [ring]);
  const ringMat = useRef<MeshBasicMaterial>(null);
  const glowMat = useRef<MeshBasicMaterial>(null);
  const roleRef = useRef(role);
  roleRef.current = role;
  useFrame((state, dt) => {
    const r = roleRef.current;
    const pulse = r === 'here' ? 0.8 + 0.2 * Math.sin(state.clock.elapsedTime * 3.2) : 1;
    const k = Math.min(1, dt * 6);
    if (ringMat.current) ringMat.current.opacity += (RING_OPACITY[r] * pulse - ringMat.current.opacity) * k;
    if (glowMat.current) glowMat.current.opacity += (GLOW_OPACITY[r] * pulse - glowMat.current.opacity) * k;
  });
  return (
    <group position={[f.x, 0, f.z]} name={`tour-ring-${place}`}>
      <mesh geometry={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.075, 0]} renderOrder={3}>
        <meshBasicMaterial ref={ringMat} color={accent} transparent opacity={0} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]} renderOrder={2}>
        <planeGeometry args={[f.w + 3.6, f.d + 3.6]} />
        <meshBasicMaterial ref={glowMat} map={glowTexture()} color={accent} transparent opacity={0} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </mesh>
    </group>
  );
}

const POOL_INTENSITY: Record<Role, number> = { here: 46, next: 26, visited: 18, lit: 15 };

/** One of the fixed pool of lights. It slides to the desk it is given and fades to its brightness, or out when it has none. */
function PoolLight({ place, role, accent }: { place: PlaceId | null; role: Role; accent: string }) {
  const light = useRef<PointLight>(null);
  const want = useRef<{ x: number; z: number; i: number }>({ x: 0, z: 0, i: 0 });
  if (place) {
    const [x, z] = placeXZ(place);
    want.current = { x, z, i: POOL_INTENSITY[role] };
  } else want.current = { ...want.current, i: 0 };
  useFrame((_, dt) => {
    const l = light.current;
    if (!l) return;
    const k = Math.min(1, dt * 5);
    const w = want.current;
    // A light that was off jumps to its new desk instead of sliding across the office.
    if (l.intensity < 0.5) l.position.set(w.x, 3.4, w.z);
    else {
      l.position.x += (w.x - l.position.x) * k;
      l.position.z += (w.z - l.position.z) * k;
    }
    l.intensity += (w.i - l.intensity) * k;
  });
  return <pointLight ref={light} color={accent} intensity={0} distance={9} decay={1.6} position={[0, 3.4, 0]} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// The token
// ─────────────────────────────────────────────────────────────────────────────

/** The path the token takes to arrive at the current step: forward along the route, back along the next one, or set straight down. */
function arrivalPath(focus: Focus, from: number | null): V2[] {
  const here = focus.current;
  if (focus.tour.intro || from === null) return [placeXZ(here.place)];
  if (from === focus.index - 1) return tourPath(here.route);
  if (from === focus.index + 1) {
    const back = focus.plan.steps[from];
    return back ? [...tourPath(back.route)].reverse() : [placeXZ(here.place)];
  }
  return [placeXZ(here.place)];
}

const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function TourToken({ focus }: { focus: Focus }) {
  const group = useRef<Group>(null);
  const halo = useRef<Mesh>(null);
  const was = useRef<{ index: number; intro: boolean; plan: Focus['plan'] } | null>(null);
  const run = useRef<{ path: V2[]; length: number; t0: number; ms: number }>({ path: [placeXZ(focus.current.place)], length: 0, t0: 0, ms: 0 });

  useLayoutEffect(() => {
    const before = was.current;
    was.current = { index: focus.index, intro: focus.tour.intro, plan: focus.plan };
    const sameRun = before !== null && before.plan === focus.plan;
    const from = sameRun && !focus.tour.intro ? (before.intro ? focus.index : before.index) : null;
    const path = arrivalPath(focus, from);
    const ms = prefersReducedMotion() ? 0 : tourTravelMs(path);
    run.current = { path, length: pathLength(path), t0: performance.now(), ms };
  }, [focus.index, focus.tour.intro, focus.plan]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const r = run.current;
    const u = r.ms <= 0 ? 1 : Math.min(1, (performance.now() - r.t0) / r.ms);
    const [x, z] = pointAlongPath(r.path, r.length * ease(u));
    const t = state.clock.elapsedTime;
    g.position.set(x, TOKEN_HEIGHT + Math.sin(t * 2.4) * 0.08, z);
    if (halo.current) {
      halo.current.rotation.z = t * 1.4;
      halo.current.scale.setScalar(1 + 0.12 * Math.sin(t * 3.2));
    }
  });

  return (
    <group ref={group} name="tour-token">
      <mesh>
        <sphereGeometry args={[0.24, 20, 14]} />
        <meshBasicMaterial color={focus.accent} toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.46, 20, 14]} />
        <meshBasicMaterial color={focus.accent} transparent opacity={0.28} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </mesh>
      <mesh ref={halo} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.62, 0.035, 8, 40]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.85} toneMapped={false} />
      </mesh>
      {/* a soft shaft of light down to the floor, so the token reads as being over a particular desk */}
      <mesh position={[0, -TOKEN_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[0.1, 0.55, TOKEN_HEIGHT, 20, 1, true]} />
        <meshBasicMaterial color={focus.accent} transparent opacity={0.16} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </mesh>
      <pointLight color={focus.accent} intensity={14} distance={5} decay={1.6} />
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Telling the page where the desks are on screen
// ─────────────────────────────────────────────────────────────────────────────

const probe = new Vector3();

function ScreenPublisher({ focus }: { focus: Focus }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const last = useRef('');
  const here = focus.tour.intro ? null : focus.current.place;
  const upNext = focus.plan.steps[focus.index + 1]?.place;
  const lit = useMemo(() => [...focus.scope.places], [focus.scope]);

  useEffect(() => () => publishTourScreen(null), []);

  useFrame(() => {
    const sig = `${here}|${upNext}|${size.width}|${size.height}|${camera.position.x.toFixed(2)}|${camera.position.z.toFixed(2)}|${camera.zoom.toFixed(2)}`;
    if (sig === last.current) return;
    last.current = sig;
    if (!here) {
      publishTourScreen(null);
      return;
    }
    const rectOf = (place: PlaceId): ScreenRect => {
      const f = placeFootprint(place);
      let left = Infinity;
      let top = Infinity;
      let right = -Infinity;
      let bottom = -Infinity;
      for (const dx of [-0.5, 0.5]) {
        for (const dz of [-0.5, 0.5]) {
          for (const y of [0, 1.9]) {
            probe.set(f.x + dx * f.w, y, f.z + dz * f.d).project(camera);
            const sx = ((probe.x + 1) / 2) * size.width;
            const sy = ((1 - probe.y) / 2) * size.height;
            left = Math.min(left, sx);
            right = Math.max(right, sx);
            top = Math.min(top, sy);
            bottom = Math.max(bottom, sy);
          }
        }
      }
      return { left: Math.round(left), top: Math.round(top), right: Math.round(right), bottom: Math.round(bottom) };
    };
    publishTourScreen({
      w: size.width,
      h: size.height,
      here: rectOf(here),
      next: upNext && upNext !== here ? rectOf(upNext) : null,
      lit: lit.filter((p) => p !== here && p !== upNext).map(rectOf),
    });
  });
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

/** Everything the tour adds to the office. Nothing at all when there is no tour. */
export function TourStage() {
  const focus = useSpotlightFocus();
  if (!focus) return null;
  return <TourStageOn focus={focus} />;
}

function TourStageOn({ focus }: { focus: Focus }) {
  const here = focus.current.place;
  const upNext = focus.tour.intro ? undefined : focus.plan.steps[focus.index + 1]?.place;
  const roleOf = (place: PlaceId): Role => {
    if (focus.tour.intro) return 'lit';
    if (place === here) return 'here';
    if (place === upNext) return 'next';
    return focus.visited.has(place) ? 'visited' : 'lit';
  };
  const places = [...focus.scope.places];
  const pools = poolPlaces(focus.scope.places, here, upNext);
  return (
    <group name="tour-stage">
      {places.map((p) => (
        <GroundMark key={p} place={p} role={roleOf(p)} accent={focus.accent} />
      ))}
      {Array.from({ length: MAX_POOLS }, (_, i) => {
        const p = pools[i] ?? null;
        return <PoolLight key={i} place={p} role={p ? roleOf(p) : 'lit'} accent={focus.accent} />;
      })}
      <TourToken focus={focus} />
      <ScreenPublisher focus={focus} />
    </group>
  );
}
