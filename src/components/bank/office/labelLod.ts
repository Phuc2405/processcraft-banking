import { useZoomStore } from '../../../store/zoomStore';

/** How much a 3D badge says at the camera's zoom (Google Maps style): far off just a dot and a count, closer the desk's name, close up every detail. */

export type LabelLod = 'far' | 'mid' | 'near';

/** The zooms (percent of the zoom that fits the whole office) where badges grow a level. */
export const LABEL_LOD = { mid: 75, near: 150 } as const;

export const labelLodAt = (percent: number): LabelLod => (percent < LABEL_LOD.mid ? 'far' : percent < LABEL_LOD.near ? 'mid' : 'near');

/** What a badge shows at a level: its name and its words ("X waiting", "Y working") or just the one total, and whether a mere tally (a kiosk's) shows at all. */
export const lodShows = (lod: LabelLod): { name: boolean; words: boolean; tally: boolean } => ({ name: lod !== 'far', words: lod !== 'far', tally: lod !== 'far' });

/** A desk's active items: those waiting at it and those being worked there right now. */
export const activeCount = (d: { waiting: number; working: number }): number => Math.max(0, d.waiting) + Math.max(0, d.working);

/**
 * The pills on a desk's badge, never one that says 0: zoomed out, one pill with the total active (waiting + working); closer,
 * "X waiting" and "Y working", each only when it is not 0. With nothing active (a desk pointed at or picked) there is no pill:
 * the badge is its dot and its name.
 */
export function badgePills(d: { waiting: number; working: number; lod: LabelLod }): { total: number | null; waiting: number | null; working: number | null } {
  const total = activeCount(d);
  if (total === 0) return { total: null, waiting: null, working: null };
  if (!lodShows(d.lod).words) return { total, waiting: null, working: null };
  return { total: null, waiting: d.waiting > 0 ? d.waiting : null, working: d.working > 0 ? d.working : null };
}

/** The level of detail now; re-renders only when it changes. */
export const useLabelLod = (): LabelLod => useZoomStore((s) => labelLodAt(s.percent));

/** How a badge shows: in full (name, counts, by the zoom's level of detail), compact (its status dot and count only), or not at all. */
export type BadgeMode = 'full' | 'compact' | 'hidden';

/** Desks whose count only ever builds up (items parked for tomorrow): their number is never zero, so it says little at a glance. */
export const ACCUMULATING: ReadonlySet<string> = new Set(['SUSPENSE']);

/**
 * Which badges the office shows, so the screen stays clear for the payments moving between the desks: a desk pointed at, picked
 * or lit by a tour always in full; otherwise (with labels on) only a desk with something active, waiting + working > 0, and a
 * desk that just accumulates compact. A desk with nothing active wears no badge at all until it is pointed at or picked.
 */
export function badgeMode(d: { hovered: boolean; selected: boolean; lit: boolean | null; always: boolean; waiting: number; working: number; accumulates: boolean }): BadgeMode {
  if (d.hovered || d.selected || d.lit === true) return 'full';
  if (d.lit === false || !d.always || activeCount(d) === 0) return 'hidden';
  return d.accumulates ? 'compact' : 'full';
}
