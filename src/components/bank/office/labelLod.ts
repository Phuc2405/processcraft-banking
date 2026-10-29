import { useZoomStore } from '../../../store/zoomStore';

/** How much a 3D badge says at the camera's zoom (Google Maps style): far off just a dot and a count, closer the desk's name, close up every detail. */

export type LabelLod = 'far' | 'mid' | 'near';

/** The zooms (percent of the zoom that fits the whole office) where badges grow a level. */
export const LABEL_LOD = { mid: 75, near: 150 } as const;

export const labelLodAt = (percent: number): LabelLod => (percent < LABEL_LOD.mid ? 'far' : percent < LABEL_LOD.near ? 'mid' : 'near');

/** What a badge shows at a level: its name, its "working" chip, and whether a mere tally (a kiosk's) shows at all. */
export const lodShows = (lod: LabelLod): { name: boolean; working: boolean; tally: boolean } => ({ name: lod !== 'far', working: lod === 'near', tally: lod !== 'far' });

/** The level of detail now; re-renders only when it changes. */
export const useLabelLod = (): LabelLod => useZoomStore((s) => labelLodAt(s.percent));
