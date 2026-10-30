/**
 * Whether the 3D office is hidden behind a full-screen window (the Knowledge Base, the AML desk, the analyst workspace, the
 * day's report, the welcome chooser...). While it is, nobody can see the office, so the canvas stops asking for frames: its
 * animation loop (traffic, people, weather) would otherwise keep the main thread busy and make the window on top of it stutter.
 * Nothing in the bank stops: the simulation runs on its own clock, and the office catches up the moment the window closes.
 */

import type { Overlay } from '../../../store/uiStore';

/** The overlays drawn as an opaque full-screen modal over the map. */
const COVERING: ReadonlySet<Overlay> = new Set<Overlay>(['aml', 'benchmark', 'chaos', 'knowledge']);

export interface CoverState {
  overlay: Overlay;
  welcomeOpen: boolean;
  /** The analyst workspace's desk, when it is open. */
  staffDesk: string | null;
  reportOpen: boolean;
}

export const sceneCovered = (s: CoverState): boolean => COVERING.has(s.overlay) || s.welcomeOpen || s.staffDesk !== null || s.reportOpen;
