import { ContactShadows, OrbitControls } from '@react-three/drei';
import { ZOOM_STEP, zoomStore } from '../../../store/zoomStore';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef } from 'react';
import { t } from '../../../i18n/t';
import { useLocale } from '../../../i18n/locale';
import { AdditiveBlending, CanvasTexture, Color, ExtrudeGeometry, MeshBasicMaterial, MOUSE, Path, RepeatWrapping, ShapeGeometry, SpriteMaterial, SRGBColorSpace, TOUCH, Vector3, type AmbientLight, type DirectionalLight, type Group, type HemisphereLight } from 'three';
import { DEPARTMENTS, STATION_IDS, type DepartmentId } from '../../../sim/topology';
import { prefersReducedMotion } from '../../canvas/timing';
import { activeFlowOf, bankStore, useBankStore } from '../../../store/bankStore';
import { FlowStage3D, useAcademyCamera } from './FlowStage3D';
import { useTerms } from '../useTerms';
import { Desk3D } from './Desk3D';
import { AtmKiosk } from './AtmKiosk';
import { GateStanchions, Kiosks, Plants, ServerRoom, VaultRoom, Walls } from './Dressing';
import { Street } from './Street';
import { atmosphereAt, CLEAR, sameMix } from './atmosphere';
import { Environment3D } from './Environment3D';
import { liveMix, weatherStore } from './weather';
import { badgeFocus, LANE_DIM, litLanes, PULSE, pulseDistance } from './focus3d';
import { pathLength, pointAlongPath } from './tour3d';
import type { V2 } from './layout3d';
import { ribbonGeometry, roundedRect, roundedRectPath, shade, tint } from './kit';
import {
  CAMERA_DIRECTION,
  CAMERA_DISTANCE,
  FLOOR_SLAB,
  HOME_TARGET,
  ISO_AZIMUTH,
  ISO_POLAR,
  LANES,
  LANE_LABELS,
  laneLabelShown,
  ORBIT_RANGE,
  clampZoom3d,
  isCameraResetKey,
  ZOOM_3D,
  zoomBounds3d,
  clampTarget,
  departmentFloor,
  deskPose,
  fitZoom,
  isMachine,
  seatOffsets,
  smoothLane,
  viewGround,
} from './layout3d';
import { tape } from './materials';
import { laneHex, SET } from './palette';
import { Arrivals, Packets } from './Traffic';
import { TOUR_DAYLIGHT, TOUR_GLIDE_MS, type CamFocus } from './tour3d';
import { TourStage, useTourCamera } from './TourStage';

// ─────────────────────────────────────────────────────────────────────────────
// Camera
// ─────────────────────────────────────────────────────────────────────────────

type Controls = {
  enableDamping: boolean;
  target: Vector3;
  update(): void;
  addEventListener(type: 'change' | 'start' | 'end', fn: () => void): void;
  removeEventListener(type: 'change' | 'start' | 'end', fn: () => void): void;
};

const RESET_MS = 520;
const easeInOut = (u: number): number => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/** The height of the camera above the point it looks at, and how far it stands from it on the floor. They never change: the tilt is fixed. */
const CAM_HEIGHT = CAMERA_DISTANCE / Math.sqrt(CAMERA_DIRECTION[0] ** 2 + CAMERA_DIRECTION[1] ** 2 + 1);
const CAM_REACH = CAM_HEIGHT * Math.hypot(CAMERA_DIRECTION[0], CAMERA_DIRECTION[1]);

/** Where the camera stands to look at `target` from the direction `az` (radians round the vertical axis, 0 = straight in front). */
const standAt = (target: Vector3, az: number): Vector3 => new Vector3(target.x + Math.sin(az) * CAM_REACH, CAM_HEIGHT, target.z + Math.cos(az) * CAM_REACH);

/** One camera move: the point looked at, the direction it is looked from, and the zoom all slide from where they are to where they should be. */
interface Glide {
  t0: number;
  ms: number;
  fromTarget: Vector3;
  toTarget: Vector3;
  fromAz: number;
  toAz: number;
  fromZoom: number;
  toZoom: number;
}

/**
 * The isometric camera. It is orthographic and always looks down at the same angle; the learner can pan (drag), zoom
 * (scroll or pinch) and swing the view a little either side (right-drag), all with damping, and cannot lose the office:
 * the point the camera looks at is kept over the floor. "Reset view" glides back to the whole office.
 *
 * During a guided tour `focus` says where the camera should be for the current step. The camera dollies over the desks in play
 * and orbits a little towards them, and glides back home when the tour ends. The learner can still pan and zoom by hand
 * during a tour; the next step takes the camera back to where the story is.
 */
export function CameraRig({ resetKey, focus }: { resetKey: number; focus: CamFocus | null }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useRef<Controls | null>(null);
  const home = useRef({ w: 0, h: 0 });
  const glide = useRef<Glide | null>(null);
  // Until the learner moves the camera themselves, the floor is re-fitted whenever the window changes size.
  const touched = useRef(false);
  // While the learner drags the office, the view is theirs: glides asked for meanwhile wait for the release.
  const interacting = useRef(false);
  const pendingGlide = useRef<Parameters<typeof glideTo> | null>(null);
  const gl = useThree((s) => s.gl);
  const lastReset = useRef(resetKey);
  const focusRef = useRef<CamFocus | null>(focus);
  focusRef.current = focus;
  const wasFocused = useRef(false);
  const fit = fitZoom(size.width, size.height);
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const bounds = zoomBounds3d(fit);

  /** The point the home view looks at: the middle of the office and the pavement in front of it. */
  const homeTarget = (): Vector3 => new Vector3(HOME_TARGET[0], 0, HOME_TARGET[1]);

  /** Slides the camera to look at (x, z) from direction `az` at `zoom`. */
  function glideTo(x: number, z: number, az: number, zoom: number, ms: number): void {
    const c = controls.current;
    if (!c) return;
    if (interacting.current) {
      pendingGlide.current = [x, z, az, zoom, ms];
      return;
    }
    const fromTarget = c.target.clone();
    const fromAz = Math.atan2(camera.position.x - fromTarget.x, camera.position.z - fromTarget.z);
    if (ms <= 0 || prefersReducedMotion()) {
      glide.current = null;
      c.enableDamping = false;
      c.update();
      c.target.set(x, 0, z);
      camera.position.copy(standAt(c.target, az));
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      camera.lookAt(c.target);
      c.update();
      c.enableDamping = true;
      invalidate();
      return;
    }
    glide.current = { t0: performance.now(), ms, fromTarget, toTarget: new Vector3(x, 0, z), fromAz, toAz: az, fromZoom: camera.zoom, toZoom: zoom };
    invalidate();
  }

  const placeHome = (animate: boolean): void => {
    const c = controls.current;
    const zoom = fitZoom(size.width, size.height);
    home.current = { w: size.width, h: size.height };
    touched.current = false;
    if (animate && c) {
      glideTo(HOME_TARGET[0], HOME_TARGET[1], ISO_AZIMUTH, zoom, RESET_MS);
      return;
    }
    glide.current = null;
    // First let the controls spend any drift left from a drag (an update applies it), so that it cannot shift the view afterwards.
    if (c) {
      c.enableDamping = false;
      c.update();
    }
    const at = homeTarget();
    camera.position.copy(standAt(at, ISO_AZIMUTH));
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    if (c) {
      c.target.copy(at);
      c.update();
      c.enableDamping = true;
    }
    camera.lookAt(at);
    invalidate();
  };

  const goToFocus = (f: CamFocus): void => {
    touched.current = false;
    glideTo(f.x, f.z, f.az, f.zoom, TOUR_GLIDE_MS);
  };

  // Fit the floor on first show, glide home (or back to the step in a tour) whenever the learner presses "Reset view",
  // and re-fit when the window changes a lot.
  useEffect(() => {
    const pressed = resetKey !== lastReset.current;
    lastReset.current = resetKey;
    if (pressed && focusRef.current) goToFocus(focusRef.current);
    else placeHome(pressed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);
  useEffect(() => {
    camera.updateProjectionMatrix();
    const was = home.current;
    if (was.w === 0 || was.h === 0 || focusRef.current) return;
    if (!touched.current || Math.abs(size.width - was.w) / was.w > 0.35 || Math.abs(size.height - was.h) / was.h > 0.35) placeHome(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height]);

  // The floating zoom toolbar: + and − glide the zoom by one step about the middle of the view, Fit glides home.
  useEffect(
    () =>
      zoomStore.subscribe((st, prev) => {
        const cmd = st.command;
        const c = controls.current;
        if (!cmd || cmd === prev.command || !c) return;
        if (cmd.kind === 'fit') {
          if (focusRef.current) goToFocus(focusRef.current);
          else placeHome(true);
          return;
        }
        touched.current = true;
        const az = Math.atan2(camera.position.x - c.target.x, camera.position.z - c.target.z);
        const next = clampZoom3d(camera.zoom * (cmd.kind === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP), fitRef.current);
        glideTo(c.target.x, c.target.z, az, next, 220);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [camera],
  );

  // Each step of a tour moves the camera; the end of the tour brings it home.
  const focusKey = focus ? `${focus.x.toFixed(2)}|${focus.z.toFixed(2)}|${focus.zoom.toFixed(1)}|${focus.az.toFixed(3)}` : '';
  useEffect(() => {
    if (focus) {
      goToFocus(focus);
      wasFocused.current = true;
    } else if (wasFocused.current) {
      wasFocused.current = false;
      placeHome(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  // R / Esc: instant reset to the isometric home framing.
  const placeHomeRef = useRef(placeHome);
  placeHomeRef.current = placeHome;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!isCameraResetKey(e, e.target as HTMLElement | null)) return;
      placeHomeRef.current(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The percentage the toolbar shows: the camera's zoom against the zoom that fits the whole office.
  useFrame(() => {
    if (fit > 0) zoomStore.getState().report((camera.zoom / fit) * 100);
  });

  useFrame(() => {
    const g = glide.current;
    const c = controls.current;
    if (!g || !c) return;
    const u = Math.min(1, (performance.now() - g.t0) / g.ms);
    const e = easeInOut(u);
    c.target.lerpVectors(g.fromTarget, g.toTarget, e);
    camera.position.copy(standAt(c.target, g.fromAz + (g.toAz - g.fromAz) * e));
    // Zoom moves by a constant ratio per step of the glide, which looks even; a straight blend rushes at the end.
    camera.zoom = g.fromZoom * Math.pow(g.toZoom / g.fromZoom, e);
    camera.updateProjectionMatrix();
    c.update();
    if (u >= 1) glide.current = null;
  });

  // A drag moves the camera and the point it looks at together; keep the point where the view meets the floor over the office.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const onChange = (): void => {
      const zoom = clampZoom3d(camera.zoom, fitRef.current);
      if (zoom !== camera.zoom) camera.zoom = zoom;
      camera.updateProjectionMatrix();
      const [gx, gz] = viewGround([camera.position.x, camera.position.y, camera.position.z], [c.target.x, c.target.y, c.target.z]);
      const [x, z] = clampTarget(gx, gz);
      const dx = x - gx;
      const dz = z - gz;
      if (dx !== 0 || dz !== 0) {
        camera.position.x += dx;
        camera.position.z += dz;
        c.target.x += dx;
        c.target.z += dz;
      }
    };
    const canvas = gl.domElement;
    canvas.classList.add('bk-office-canvas');
    const onStart = (): void => {
      touched.current = true;
      glide.current = null;
      interacting.current = true;
      canvas.dataset.grabbing = '';
    };
    const onEnd = (): void => {
      interacting.current = false;
      delete canvas.dataset.grabbing;
      const pending = pendingGlide.current;
      pendingGlide.current = null;
      if (pending) glideTo(...pending);
    };
    c.addEventListener('change', onChange);
    c.addEventListener('start', onStart);
    c.addEventListener('end', onEnd);
    return () => {
      c.removeEventListener('change', onChange);
      c.removeEventListener('start', onStart);
      c.removeEventListener('end', onEnd);
      delete canvas.dataset.grabbing;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl]);

  return (
    <OrbitControls
      ref={controls as never}
      makeDefault
      enableDamping
      dampingFactor={0.1}
      enableRotate
      rotateSpeed={0.55}
      // The view is isometric: the camera looks down at one fixed angle and may only swing a little to either side.
      minPolarAngle={ISO_POLAR}
      maxPolarAngle={ISO_POLAR}
      minAzimuthAngle={ISO_AZIMUTH - ORBIT_RANGE}
      maxAzimuthAngle={ISO_AZIMUTH + ORBIT_RANGE}
      screenSpacePanning
      panSpeed={1}
      enableZoom
      zoomSpeed={ZOOM_3D.speed}
      // The wheel zooms towards the point under the cursor, not the middle of the screen.
      zoomToCursor
      minZoom={bounds.min}
      maxZoom={bounds.max}
      mouseButtons={{ LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }}
      touches={{ ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Floor
// ─────────────────────────────────────────────────────────────────────────────

/** Warm wooden planks, drawn once on a canvas: four world units square, eight planks, each a slightly different tone. */
function usePlanks(): CanvasTexture {
  const tex = useMemo(() => {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    // A small deterministic random generator, so the floor looks the same every time.
    let seed = 7;
    const rnd = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    if (g) {
      const planks = 8;
      const h = S / planks;
      for (let i = 0; i < planks; i++) {
        const light = 69 + rnd() * 6;
        g.fillStyle = `hsl(${33 + rnd() * 3}, ${44 + rnd() * 6}%, ${light}%)`;
        g.fillRect(0, i * h, S, h);
        // grain
        for (let k = 0; k < 14; k++) {
          g.strokeStyle = `rgba(120, 80, 40, ${0.04 + rnd() * 0.05})`;
          g.lineWidth = 1 + rnd() * 1.5;
          const y = i * h + 3 + rnd() * (h - 6);
          g.beginPath();
          g.moveTo(rnd() * S * 0.3, y);
          g.lineTo(S * (0.5 + rnd() * 0.5), y + (rnd() - 0.5) * 4);
          g.stroke();
        }
        // the seam above the plank, and a butt joint
        g.fillStyle = 'rgba(110, 76, 40, 0.34)';
        g.fillRect(0, i * h, S, 2);
        const joint = rnd() * S;
        g.fillRect(joint, i * h, 2, h);
      }
    }
    const t = new CanvasTexture(c);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(1 / 4, 1 / 4);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** The slab's corner radius: just enough to soften the edge, square enough that its front meets the pavement flush. */
const SLAB_CORNER = 0.12;

/** The slab the office stands on: a chunky plinth of dark wood with a floor of warm planks. Clicking bare floor clears the selection. */
const Floor = memo(function Floor() {
  const select = useBankStore((s) => s.select);
  const planks = usePlanks();
  const slab = useMemo(() => new ExtrudeGeometry(roundedRect(FLOOR_SLAB.w, FLOOR_SLAB.d, SLAB_CORNER), { depth: 0.5, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 12 }), []);
  const top = useMemo(() => new ShapeGeometry(roundedRect(FLOOR_SLAB.w - 0.04, FLOOR_SLAB.d - 0.04, SLAB_CORNER - 0.02), 12), []);
  useEffect(
    () => () => {
      slab.dispose();
      top.dispose();
    },
    [slab, top],
  );
  const click = (e: ThreeEvent<MouseEvent>): void => {
    if (e.delta > 4) return;
    select({ kind: 'none' });
  };
  return (
    <group name="office-floor">
      <mesh geometry={slab} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.56, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={SET.slabSide} roughness={0.8} />
      </mesh>
      <mesh geometry={top} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow onClick={click}>
        <meshStandardMaterial map={planks} roughness={0.78} />
      </mesh>
    </group>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Departments
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A name painted on the floor: a flat plane with the words drawn on a canvas. Unlike a floating label it sits in the
 * scene, so a desk or a person can stand in front of it, and it never covers anything. Long names wrap to two lines.
 */
function FloorLabel({ text, color, width, selected }: { text: string; color: string; width: number; selected: boolean }) {
  const made = useMemo(() => {
    const PX = 150; // canvas pixels per world unit
    const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
    const W = Math.max(64, Math.round(width * PX));
    const words = text.toUpperCase().split(' ');
    const probe = document.createElement('canvas').getContext('2d');
    let size = Math.round(0.42 * PX);
    let lines: string[] = [words.join(' ')];
    if (probe) {
      // The biggest type (up to 0.42 units tall) that fits on one line, else on two.
      const fits = (px: number): string[] | null => {
        probe.font = `800 ${px}px ${FONT}`;
        const room = W - 24;
        if (probe.measureText(words.join(' ')).width <= room) return [words.join(' ')];
        for (let cut = 1; cut < words.length; cut++) {
          const a = words.slice(0, cut).join(' ');
          const b = words.slice(cut).join(' ');
          if (probe.measureText(a).width <= room && probe.measureText(b).width <= room) return [a, b];
        }
        return null;
      };
      const floor = Math.round(0.26 * PX);
      for (let px = size; px >= floor; px -= 3) {
        const f = fits(px);
        if (f) {
          size = px;
          lines = f;
          break;
        }
        size = floor;
      }
    }
    const lineH = Math.round(size * 1.18);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = lineH * lines.length + 12;
    const c = canvas.getContext('2d');
    if (c) {
      c.font = `800 ${size}px ${FONT}`;
      c.textBaseline = 'top';
      c.fillStyle = color;
      lines.forEach((ln, i) => c.fillText(ln, 12, 6 + i * lineH));
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    return { texture, height: canvas.height / PX };
  }, [text, color, width]);
  useEffect(() => () => made.texture.dispose(), [made]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[width / 2, 0.045, made.height / 2]} renderOrder={2}>
      <planeGeometry args={[width, made.height]} />
      <meshBasicMaterial map={made.texture} transparent opacity={selected ? 1 : 0.92} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

const DEPARTMENT_IDS = Object.keys(DEPARTMENTS) as DepartmentId[];

/** A coloured rug for each department, with a border; the name is painted on the floor just outside its front edge. */
const Rug = memo(function Rug({ id }: { id: DepartmentId }) {
  const pose = useMemo(() => departmentFloor(id), [id]);
  const selected = useBankStore((s) => s.selection.kind === 'department' && s.selection.id === id);
  const select = useBankStore((s) => s.select);
  const terms = useTerms();
  const { fill, border } = useMemo(() => {
    const outer = roundedRect(pose.w, pose.d, 0.35);
    const hole = roundedRectPath(new Path(), pose.w - 0.14, pose.d - 0.14, 0.28);
    outer.holes.push(hole);
    return { fill: new ShapeGeometry(roundedRect(pose.w, pose.d, 0.35), 10), border: new ShapeGeometry(outer, 10) };
  }, [pose.w, pose.d]);
  useEffect(
    () => () => {
      fill.dispose();
      border.dispose();
    },
    [fill, border],
  );
  const labelW = Math.max(2, pose.w - 0.4);
  return (
    <group position={[pose.x, 0, pose.z]}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <mesh
          geometry={fill}
          position={[0, 0, 0.012]}
          receiveShadow
          onClick={(e) => {
            if (e.delta > 4) return;
            e.stopPropagation();
            select({ kind: 'department', id });
          }}
        >
          <meshStandardMaterial color={tint(pose.accent, selected ? 0.58 : 0.74)} roughness={0.95} />
        </mesh>
        <mesh geometry={border} position={[0, 0, 0.016]}>
          <meshBasicMaterial color={selected ? shade(pose.accent, 0.1) : tint(pose.accent, 0.3)} toneMapped={false} />
        </mesh>
      </group>
      {/* The name is painted on the floor just outside the front edge, the side the camera looks from, where no desk or person stands in front of it. */}
      <group position={[-pose.w / 2 + 0.15, 0, pose.d / 2 + 0.12]}>
        <FloorLabel text={terms.department(id)} color={shade(pose.accent, 0.42)} width={labelW} selected={selected} />
      </group>
    </group>
  );
});

/**
 * A lane painted on the floor along every wire of the 2D map, with rounded corners: the same path the packets fly. Pointing at
 * a desk lights its own lanes (a guided scenario lights its route) in their own 2D colours (blue approved, amber end of day,
 * purple OTP, red decline): a brightened stripe over a soft additive halo, the floor's stand-in for an emissive glow, with
 * pulses of light running along them, while every other lane fades to LANE_DIM, as the 2D map does.
 */
const Lanes = memo(function Lanes() {
  const geometry = useMemo(() => ribbonGeometry(LANES.map((l) => ({ points: smoothLane(l.points, 0.55, 5), color: laneHex(l.to, l.from) })), 0.11, 0.026), []);
  const hover = useBankStore((s) => (s.spotlight ? null : s.hoverPlace));
  const flow = useBankStore((s) => (s.spotlight ? null : activeFlowOf(s)));
  const { lanes: lit, dim } = useMemo(() => litLanes(hover, flow), [hover, flow]);
  const litLanes3d = useMemo(() => LANES.filter((l) => lit.has(l.id)).map((l) => ({ points: smoothLane(l.points, 0.55, 5), color: laneHex(l.to, l.from) })), [lit]);
  const paths = useMemo(() => litLanes3d.map((l) => l.points), [litLanes3d]);
  const colors = useMemo(() => litLanes3d.map((l) => l.color), [litLanes3d]);
  // The stripe is the lane's own colour, brightened toward white so it reads as lit; the halo glows in the same colour.
  const stripe = useMemo(() => (paths.length ? ribbonGeometry(litLanes3d.map((l) => ({ points: l.points, color: glowHex(l.color) })), 0.2, 0.034) : null), [litLanes3d, paths]);
  const halo = useMemo(() => (paths.length ? ribbonGeometry(litLanes3d, 0.62, 0.03) : null), [litLanes3d, paths]);
  const material = useMemo(() => {
    const m = tape.clone();
    m.transparent = true;
    return m;
  }, []);
  const haloMaterial = useMemo(() => new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false, blending: AdditiveBlending, toneMapped: false }), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => stripe?.dispose(), [stripe]);
  useEffect(() => () => halo?.dispose(), [halo]);
  useEffect(
    () => () => {
      material.dispose();
      haloMaterial.dispose();
    },
    [material, haloMaterial],
  );
  material.opacity = lit.size ? dim : 1;
  return (
    <>
      <mesh geometry={geometry} material={material} renderOrder={1} name="office-lanes" />
      {halo && <mesh geometry={halo} material={haloMaterial} renderOrder={2} name="office-lanes-halo" />}
      {stripe && <mesh geometry={stripe} material={tape} renderOrder={2} name="office-lanes-lit" />}
      {paths.length > 0 && <LanePulses paths={paths} colors={colors} />}
    </>
  );
});

let pulseTex: CanvasTexture | null = null;
/** A soft round spark, drawn once. */
function pulseTexture(): CanvasTexture {
  if (pulseTex) return pulseTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  pulseTex = new CanvasTexture(c);
  pulseTex.colorSpace = SRGBColorSpace;
  return pulseTex;
}

/** A lane colour pushed toward white: how a lit lane's stripe and pulses glow. */
const glowHex = (c: string): string => `#${new Color(c).lerp(new Color('#ffffff'), 0.35).getHexString()}`;

/** Glowing pulses running along the lit lanes, PULSE.perLane to a lane, each in its lane's colour, looping: the flow of a payment made visible. */
function LanePulses({ paths, colors }: { paths: readonly (readonly V2[])[]; colors: readonly string[] }) {
  const lengths = useMemo(() => paths.map(pathLength), [paths]);
  const materials = useMemo(() => {
    const byColor = new Map<string, SpriteMaterial>();
    for (const c of colors) if (!byColor.has(c)) byColor.set(c, new SpriteMaterial({ map: pulseTexture(), color: glowHex(c), transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false }));
    return byColor;
  }, [colors]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  const group = useRef<Group>(null);
  const clock = useRef(0);
  useFrame((_, dt) => {
    clock.current += Math.min(dt, 0.1);
    const g = group.current;
    if (!g) return;
    let n = 0;
    paths.forEach((path, i) => {
      for (let k = 0; k < PULSE.perLane; k++) {
        const [x, z] = pointAlongPath(path, pulseDistance(lengths[i]!, k, clock.current));
        g.children[n++]?.position.set(x, 0.12, z);
      }
    });
  });
  return (
    <group ref={group} name="office-lane-pulses">
      {paths.flatMap((_, i) => Array.from({ length: PULSE.perLane }, (__, k) => <sprite key={`${i}-${k}`} material={materials.get(colors[i]!)} scale={[0.46, 0.46, 1]} renderOrder={7} />))}
    </group>
  );
}

/** The badge looks: plain dark, or lit bright amber with dark bold words (the desk pointed at is on this lane). */
const BADGE_LOOK = {
  plain: { fill: '#0b1120', stroke: '#475569', ink: '#e2e8f0', weight: 600 },
  lit: { fill: '#fbbf24', stroke: '#fcd34d', ink: '#020617', weight: 700 },
} as const;

/** A lane's words as a crisp badge: drawn once per text and look on a canvas, at four times the size it shows. */
function useBadge(text: string, lit: boolean): { material: SpriteMaterial; aspect: number } {
  const made = useMemo(() => {
    const PX = 4;
    const look = BADGE_LOOK[lit ? 'lit' : 'plain'];
    const font = `${look.weight} ${9 * PX}px ui-sans-serif, system-ui, sans-serif`;
    const probe = document.createElement('canvas').getContext('2d');
    if (probe) probe.font = font;
    const w = Math.ceil((probe?.measureText(text).width ?? text.length * 5.4 * PX) + 16 * PX);
    const h = 14 * PX;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = look.fill;
      g.strokeStyle = look.stroke;
      g.lineWidth = PX;
      g.beginPath();
      g.roundRect(PX / 2, PX / 2, w - PX, h - PX, 4 * PX);
      g.fill();
      g.stroke();
      g.font = font;
      g.fillStyle = look.ink;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + PX / 2);
    }
    const map = new CanvasTexture(c);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 4;
    return { material: new SpriteMaterial({ map, transparent: true, depthWrite: false, toneMapped: false }), aspect: w / h };
  }, [text, lit]);
  useEffect(
    () => () => {
      made.material.map?.dispose();
      made.material.dispose();
    },
    [made],
  );
  return made;
}

/** The world height of a lane badge. */
const BADGE_H = 0.34;

function LaneBadge({ text, at, focus }: { text: string; at: readonly [number, number]; focus: 'lit' | 'dim' | 'plain' }) {
  const lit = focus === 'lit';
  const { material, aspect } = useBadge(text, lit);
  material.opacity = focus === 'dim' ? LANE_DIM : 1;
  // A lit badge is drawn a touch larger and over everything else on the floor.
  const h = BADGE_H * (lit ? 1.05 : 1);
  return <sprite material={material} position={[at[0], lit ? 0.36 : 0.32, at[1]]} scale={[h * aspect, h, 1]} renderOrder={lit ? 9 : 6} />;
}

/**
 * The conditions on the lanes, in the active language: the same words, and the same rules, as the 2D map (laneLabelShown).
 * Pointing at a desk lights its own lanes' badges bright yellow and fades every other badge in the bank (badgeFocus).
 */
const LaneLabels = memo(function LaneLabels() {
  useLocale();
  const hover = useBankStore((s) => (s.spotlight || activeFlowOf(s) ? null : s.hoverPlace));
  const always = useBankStore((s) => s.labelMode === 'always' && s.spotlight === null);
  return (
    <group name="office-lane-labels">
      {LANE_LABELS.filter((l) => hover !== null || laneLabelShown(l, hover, always)).map((l) => (
        <LaneBadge key={l.id} text={t(l.text)} at={l.at} focus={badgeFocus(l, hover)} />
      ))}
    </group>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// The scene
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `window.__officeProbe(stationId)` answers where a counter is on screen, in CSS pixels from the top-left of the page.
 * It exists so the 3D view can be driven by a browser test, which cannot see inside a canvas.
 */
function Probe() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as unknown as { target: Vector3; update(): void } | null;
  useEffect(() => {
    const w = window as unknown as {
      __officeProbe?: (id: string, worker?: number) => { x: number; y: number; zoom: number } | null;
      __officeView?: (x: number, z: number, zoom: number) => void;
      __officeStats?: () => { calls: number; triangles: number; geometries: number; textures: number };
      __officeCam?: () => { x: number; z: number; zoom: number; az: number } | null;
    };
    w.__officeProbe = (id, worker) => {
      if (!(STATION_IDS as readonly string[]).includes(id)) return null;
      const sid = id as (typeof STATION_IDS)[number];
      const pose = deskPose(sid);
      let [px, py, pz] = [pose.x, 0.6, pose.z];
      if (worker !== undefined) {
        // The head of one of the staff at this desk, instead of the counter.
        const seat = seatOffsets(bankStore.getState().view.stations[sid].workers.length)[worker];
        if (!seat) return null;
        [px, py, pz] = [pose.x + seat[0], 1.3, pose.z + seat[1]];
      }
      const v = new Vector3(px, py, pz).project(camera);
      const r = gl.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, zoom: (camera as { zoom?: number }).zoom ?? 1 };
    };
    // Put the camera over a point of the floor at a zoom, keeping the isometric angle (for browser checks).
    w.__officeView = (x, z, zoom) => {
      const k = CAMERA_DISTANCE / Math.sqrt(CAMERA_DIRECTION[0] ** 2 + CAMERA_DIRECTION[1] ** 2 + 1);
      camera.position.set(x + CAMERA_DIRECTION[0] * k, k, z + CAMERA_DIRECTION[1] * k);
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      controls?.target.set(x, 0, z);
      controls?.update();
    };
    w.__officeCam = () => {
      if (!controls) return null;
      const t = controls.target;
      return { x: t.x, z: t.z, zoom: (camera as { zoom?: number }).zoom ?? 1, az: Math.atan2(camera.position.x - t.x, camera.position.z - t.z) };
    };
    w.__officeStats = () => ({ frame: gl.info.render.frame, calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures });
    return () => {
      delete w.__officeProbe;
      delete w.__officeView;
      delete w.__officeStats;
      delete w.__officeCam;
    };
  }, [camera, gl, controls]);
  return null;
}

/**
 * Daylight that follows the bank's clock: a sun from the front-left, a sky-and-floor bounce, and a cool fill from behind so
 * the shaded faces are not black. The colours and strengths come from the time-of-day presets in atmosphere.ts (morning,
 * noon, afternoon, night) and dim under rain; after dusk the street lamps and the city's windows take over.
 */
function Lights() {
  const sky = useRef<HemisphereLight>(null);
  const sun = useRef<DirectionalLight>(null);
  const ambient = useRef<AmbientLight>(null);
  const fill = useRef<DirectionalLight>(null);
  /** 0 in daylight, 1 while a guided tour has the office dimmed; eased so the room fades rather than snaps. */
  const tour = useRef(0);
  useFrame((_, dt) => {
    const s = bankStore.getState();
    // Morning, noon, afternoon or night, under the weather blend (atmosphere.ts).
    const a = atmosphereAt(s.view.minute, liveMix);
    // A tour turns the daylight right down; a guided flow (Beginner scope) turns it down part of the way.
    const want = s.spotlight ? 1 : activeFlowOf(s) ? 0.6 : 0;
    tour.current += (want - tour.current) * Math.min(1, dt * 3);
    const k = tour.current;
    const keep = (left: number): number => 1 + (left - 1) * k;
    if (sky.current) {
      sky.current.intensity = a.hemi.intensity * keep(TOUR_DAYLIGHT.sky);
      sky.current.color.set(a.hemi.sky);
      sky.current.groundColor.set(a.hemi.ground);
    }
    if (sun.current) {
      sun.current.intensity = a.sun.intensity * keep(TOUR_DAYLIGHT.sun);
      sun.current.color.set(a.sun.color);
      // The sun moves across the sky: low in the east in the morning, high at noon, low and raking from the west late on.
      sun.current.position.set(a.sun.dir[0], a.sun.dir[1], a.sun.dir[2]);
    }
    if (ambient.current) ambient.current.intensity = 0.28 * keep(TOUR_DAYLIGHT.ambient);
    if (fill.current) fill.current.intensity = 0.4 * keep(TOUR_DAYLIGHT.fill);
  });
  return (
    <>
      <hemisphereLight ref={sky} args={['#fff8ec', '#ecd9bb', 1.15]} />
      <ambientLight ref={ambient} intensity={0.28} />
      <directionalLight
        ref={sun}
        position={[-17, 30, 15]}
        intensity={2.4}
        color="#fff0d6"
      />
      <directionalLight ref={fill} position={[15, 10, -9]} intensity={0.4} color="#d6e6ff" />
    </>
  );
}

export function OfficeScene({ resetKey }: { resetKey: number }) {
  const tourCamera = useTourCamera();
  // A chapter tour owns the camera; otherwise it goes to the node the Academy split view is teaching.
  const academyCamera = useAcademyCamera();
  return (
    <>
      <Lights />
      <CameraRig resetKey={resetKey} focus={tourCamera ?? academyCamera} />
      <Probe />
      <Floor />
      <FrameDriver />
      <Environment3D />
      <ContactShadows position={[0, -0.66, 0]} scale={[FLOOR_SLAB.w + 6, FLOOR_SLAB.d + 6]} far={0.9} blur={2.8} opacity={0.4} resolution={512} frames={1} color="#6b4f35" />
      {/* Soft contact shadows under every desk, person and plant on the office floor, baked once. They replace the real-time
          shadow map of the sun, which redrew the whole office a second time on every frame. */}
      <ContactShadows position={[0, 0.03, 0]} scale={[FLOOR_SLAB.w, FLOOR_SLAB.d]} far={2.4} blur={2} opacity={0.4} resolution={1024} frames={1} color="#5b4330" />
      {DEPARTMENT_IDS.map((id) => (
        <Rug key={id} id={id} />
      ))}
      <Lanes />
      <LaneLabels />
      <Walls />
      <VaultRoom />
      <ServerRoom />
      <Plants />
      <Street />
      <GateStanchions />
      {STATION_IDS.map((id) => (isMachine(id) ? <AtmKiosk key={id} id={id} /> : <Desk3D key={id} id={id} />))}
      <Kiosks />
      <Arrivals />
      <Packets />
      <TourStage />
      <FlowStage3D />
    </>
  );
}

/** How long the office keeps drawing after anything in the bank changed, so fades and glides can finish. */
const AWAKE_MS = 1600;

/**
 * The canvas draws on demand (frameloop="demand"): a frame is drawn only when something asks for one. This keeps it drawing
 * while the bank clock runs, while a tour plays, and for a moment after any change or any pointer move over the office, and
 * otherwise lets it rest, so a paused office costs the graphics card nothing.
 */
function FrameDriver() {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    let awakeUntil = performance.now() + AWAKE_MS;
    let frame = 0;
    const wake = (): void => {
      awakeUntil = performance.now() + AWAKE_MS;
    };
    const loop = (): void => {
      const s = bankStore.getState();
      // Weather keeps moving (rain, swaying trees, a sky still blending), so it keeps the canvas drawing while it lasts.
      const weather = weatherStore.getState().weather !== 'clear' || !sameMix(liveMix, CLEAR);
      if (s.playing || s.spotlight !== null || weather || performance.now() < awakeUntil) invalidate();
      frame = requestAnimationFrame(loop);
    };
    const unsubscribe = bankStore.subscribe(wake);
    const unsubscribeWeather = weatherStore.subscribe(wake);
    const el = gl.domElement;
    el.addEventListener('pointermove', wake);
    el.addEventListener('wheel', wake, { passive: true });
    el.addEventListener('pointerdown', wake);
    window.addEventListener('resize', wake);
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
      unsubscribeWeather();
      el.removeEventListener('pointermove', wake);
      el.removeEventListener('wheel', wake);
      el.removeEventListener('pointerdown', wake);
      window.removeEventListener('resize', wake);
    };
  }, [invalidate, gl]);
  return null;
}
