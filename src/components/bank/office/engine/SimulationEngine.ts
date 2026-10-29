import { beatMs, SPEEDS } from '../../../../sim/clock';
import type { Weather } from '../atmosphere';
import { DeskStatusFeed, type BankSource } from './deskStatus';
import { EntityFactory } from './EntityFactory';
import { WorldEngine } from './WorldEngine';

/**
 * The simulation behind both views of the bank, as one pure engine:
 *
 *   the bank      the bank's own simulation (sim/bankSimulation.ts), held in the bank store and advanced a beat at a time;
 *                 the engine says when the next beat is due (`nextBeatMs`), the page's timer only waits that long
 *   desks         the desks' statuses as an event stream (DeskStatusFeed), which the 2D map and the 3D office both read
 *   the world     the 3D office's world around the bank (WorldEngine), made per scene by `createWorld`
 *
 * It depends on nothing of React, three.js or the page (engine.test.ts walks its imports to hold it to that): the bank's
 * store reaches it as a BankSource, and the views reach it through thin hooks.
 */
export interface BankClockSource extends BankSource {
  getState(): ReturnType<BankSource['getState']> & { playing: boolean; speedIndex: number };
}

export class SimulationEngine {
  readonly desks: DeskStatusFeed;

  constructor(
    readonly bank: BankClockSource,
    private readonly factory: EntityFactory = new EntityFactory(),
  ) {
    this.desks = new DeskStatusFeed(bank);
  }

  /**
   * How long the beat now showing stays on screen before the next is due, in real milliseconds (null while paused): by its
   * phase (the busy hours slow enough to watch, the quiet ones quicker), the hours before a shift (slow, while the staff
   * walk in), and the speed picked.
   */
  nextBeatMs(): number | null {
    const s = this.bank.getState();
    if (!s.playing) return null;
    return beatMs(s.view.phase, SPEEDS[s.speedIndex]?.factor ?? 1, s.view.minute);
  }

  /** A world for a 3D scene to draw, starting from the bank's clock now and the weather picked. */
  createWorld(weather: Weather): WorldEngine {
    return new WorldEngine({ minute: this.bank.getState().view.minute, weather }, this.factory);
  }
}
