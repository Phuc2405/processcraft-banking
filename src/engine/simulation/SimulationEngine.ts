import { beatMs, SPEEDS } from '../../sim/clock';
import type { Weather } from '../world/atmosphere';
import { DeskStatusFeed, type BankSource } from './deskStatus';
import { EntityFactory } from './EntityFactory';
import { WorldEngine } from './WorldEngine';

/** The simulation behind both views of the bank, as one pure engine. */
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

  /** How long the beat now showing stays on screen before the next is due, in real milliseconds (null while paused). */
  nextBeatMs(): number | null {
    const s = this.bank.getState();
    if (!s.playing) return null;
    return beatMs(s.view.phase, SPEEDS[s.speedIndex]?.factor ?? 1, s.view.minute);
  }

  /** A world for a 3D scene to draw, starting from the bank's clock now and the weather picked. */
  createWorld(weather: Weather): WorldEngine {
    const view = this.bank.getState().view;
    const world = new WorldEngine({ minute: view.minute, weather }, this.factory);
    world.onBank(view);
    return world;
  }
}
