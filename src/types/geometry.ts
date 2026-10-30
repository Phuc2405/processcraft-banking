/** Shapes on the screen and on the 2D plan, shared by the engine's layout and the views that draw it. */

/** A point on the 2D plan or the screen: [x, y]. */
export type Pt = readonly [number, number];

/** A box on the screen in CSS pixels, edge by edge (as getBoundingClientRect gives it, relative to whatever it is measured from). */
export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The side of a box a wire leaves or enters by: left, right, top or bottom. */
export type BoxSide = 'l' | 'r' | 't' | 'b';
