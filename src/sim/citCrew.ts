/**
 * The CIT crew's walk at the vault's loading bay: one pure timeline both maps read (2D on the CIT clock, 3D on the motion clock), so
 * they tell the same story. A custodian carries, a guard walks a few paces behind and never carries; nobody pops in at the door.
 *  - Inflow (van → vault): the crew steps out of the cab, takes the cassettes from the van's rear, walks the corridor into the vault
 *    and deposits them (gold pulse, Dr 1111), walks back and boards.
 *  - Outflow (vault → van): the crew comes out of the vault with the cassettes (orange pulse, Cr 1111), walks the corridor to the
 *    van, loads it and boards.
 */

export type CrewFlow = 'IN' | 'OUT';
export type CrewStage = 'stepOut' | 'atVan' | 'toVault' | 'atVault' | 'toVan' | 'board';
type Spot = 'cab' | 'van' | 'vault';
/** When in a stage the custodian holds the cassettes: never, throughout, or in its first or second half. */
type Carry = 'none' | 'all' | 'first' | 'second';

export interface CrewPoint {
  stage: CrewStage;
  /** Where along the walk, 0 at the cab door to 1 at the vault. */
  along: number;
  walking: boolean;
  carrying: boolean;
}

/** Each stage: what it is, the fraction of the stop at which it ends, where it walks from and to, and when the cassettes are in hand. */
type Stage = readonly [CrewStage, number, Spot, Spot, Carry];
const TIMELINE: Readonly<Record<CrewFlow, readonly Stage[]>> = {
  IN: [
    ['stepOut', 0.08, 'cab', 'van', 'none'],
    ['atVan', 0.13, 'van', 'van', 'second'],
    ['toVault', 0.43, 'van', 'vault', 'all'],
    ['atVault', 0.57, 'vault', 'vault', 'first'],
    ['toVan', 0.88, 'vault', 'van', 'none'],
    ['board', 0.97, 'van', 'cab', 'none'],
  ],
  OUT: [
    ['atVault', 0.14, 'vault', 'vault', 'second'],
    ['toVan', 0.7, 'vault', 'van', 'all'],
    ['atVan', 0.8, 'van', 'van', 'first'],
    ['board', 0.94, 'van', 'cab', 'none'],
  ],
};
/** How far behind the custodian the guard walks, as a fraction of the stop. */
export const GUARD_LAG = 0.025;

const clamp01 = (u: number): number => Math.min(1, Math.max(0, u));

/**
 * The custodian `u` (0-1) through the stop, or null while the crew is out of sight (in the van, or inside the vault before an outflow).
 * `rear` is where the van's rear doors are along the walk (0-1): the 2D bay draws cab and rear at one spot (0), the 3D van has them apart.
 */
export function crewAt(flow: CrewFlow, u: number, rear = 0): CrewPoint | null {
  const spot: Readonly<Record<Spot, number>> = { cab: 0, van: rear, vault: 1 };
  let start = 0;
  for (const [stage, end, from, to, carry] of TIMELINE[flow]) {
    if (u >= start && u < end) {
      const k = clamp01((u - start) / (end - start));
      const carrying = carry === 'all' || (carry === 'first' && k < 0.5) || (carry === 'second' && k >= 0.5);
      return { stage, along: spot[from] + (spot[to] - spot[from]) * k, walking: from !== to, carrying };
    }
    start = end;
  }
  return null;
}

/** The crew `u` through the stop: the custodian, and the guard a little behind; null while neither is in sight. */
export function crewOf(flow: CrewFlow, u: number, rear = 0): { custodian: CrewPoint | null; guard: CrewPoint | null } | null {
  const custodian = crewAt(flow, u, rear);
  const behind = crewAt(flow, u - GUARD_LAG, rear);
  const guard = behind && { ...behind, carrying: false };
  return custodian || guard ? { custodian, guard } : null;
}

/** The longest single walk of a stop, as a fraction of it: a view sizes its stop so that walk goes at its people's pace. */
export const walkShare = (flow: CrewFlow): number => {
  let start = 0;
  let most = 0;
  for (const [, end, from, to] of TIMELINE[flow]) {
    if (from !== to && from !== 'cab' && to !== 'cab') most = Math.max(most, end - start);
    start = end;
  }
  return most;
};

/** Whether the vault lights for the cash crossing its door now: gold for a deposit (Dr 1111), orange for a withdrawal (Cr 1111). */
export const vaultPulseAt = (flow: CrewFlow, u: number): CrewFlow | null => (crewAt(flow, u)?.stage === 'atVault' ? flow : null);
