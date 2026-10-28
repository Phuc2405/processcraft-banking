/**
 * The clock everything that moves in the 3D office runs on: the people (customers, staff, passers-by, drivers, guards),
 * the vehicles and the payments in flight. It follows the simulation: frozen while the bank is paused, so the learner can
 * stop the world and inspect any desk, badge or person where it stands; and running at the bank's own speed multiplier
 * (0.25x to 10x) while it plays, so the whole scene speeds up and slows down in lockstep.
 *
 * The weather (rain, clouds, swaying trees) is not on this clock: it keeps going, as weather does.
 */
export const motion = {
  /** Seconds of motion so far, scaled by the multiplier (what walking, driving and animations read). */
  t: 0,
  /** This frame's step of `t`. */
  dt: 0,
  /** Milliseconds the bank has been playing, unscaled: the payments' flights, whose timings already follow the speed. */
  ms: 0,
  /** The multiplier this frame: 0 while paused. */
  scale: 0,
};

/** How fast the scene moves for the bank's state: not at all while paused (or while a guided tour holds the clock). */
export const motionScale = (playing: boolean, factor: number): number => (playing ? factor : 0);

/** Moves the clock on by one frame of `realDt` seconds. */
export function advanceMotion(realDt: number, playing: boolean, factor: number): void {
  const h = Math.min(Math.max(realDt, 0), 0.1);
  motion.scale = motionScale(playing, factor);
  motion.dt = h * motion.scale;
  motion.t += motion.dt;
  if (playing) motion.ms += h * 1000;
}

/** The payments' clock, in milliseconds. */
export const motionNow = (): number => motion.ms;

/** A step of `dt` seconds cut into pieces no longer than `max`, so a fast multiplier never makes a simulation jump. */
export function substeps(dt: number, max = 0.05): number[] {
  if (dt <= 0) return [];
  const n = Math.ceil(dt / max);
  return Array.from({ length: n }, () => dt / n);
}
