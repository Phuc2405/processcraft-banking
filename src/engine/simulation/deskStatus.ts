import type { StationId } from '../../sim/topology';
import type { BankView, StationView } from '../../sim/types';
import { statusAfterWorking, workingCount } from './deskActivity';

/**
 * Desk status as one stream both views subscribe to (Observer). The 2D map's desk cards and the 3D office's desk badges and
 * tooltips show the same thing ("X waiting · Y working", and the status word unless it would only repeat "working"), so it
 * is worked out once, here, from the bank's view; each subscriber hears only about its own desk, and only when its status
 * actually changed. Every figure either view shows for a desk comes from here. Pure: the bank's store comes in as a
 * BankSource.
 */

/** What a desk's badge says. */
export interface DeskStatus {
  waiting: number;
  working: number;
  status: StationView['status'];
  /** Whether the status word follows "Y working" (not while busy: "Y working" says it already). */
  showStatus: boolean;
}

/** Anything that holds the bank's latest view and says when it changes (the bank store is one). */
export interface BankSource {
  getState(): { view: BankView };
  subscribe(listener: () => void): () => void;
}

/** A desk's status, from its view. */
export function deskStatusOf(sv: StationView): DeskStatus {
  const working = workingCount(sv);
  return { waiting: sv.queueLength, working, status: sv.status, showStatus: statusAfterWorking(sv.status, working) };
}

/** The words a status line is written in (the views pass them in their language). */
export interface DeskStatusWords {
  waiting: string;
  working(n: number): string;
  status(s: StationView['status']): string;
}

/** A desk's status as one line, the same everywhere it is shown: "X waiting · Y working", then the status word if any. */
export function deskStatusLine(s: DeskStatus, words: DeskStatusWords): string {
  const parts = [`${s.waiting} ${words.waiting}`];
  if (s.working > 0) parts.push(words.working(s.working));
  if (s.showStatus) parts.push(words.status(s.status));
  return parts.join(' · ');
}

const same = (a: DeskStatus, b: DeskStatus): boolean => a.waiting === b.waiting && a.working === b.working && a.status === b.status && a.showStatus === b.showStatus;

interface Entry {
  /** The view this status was read from. */
  view: BankView;
  status: DeskStatus;
  /** The status the desk's subscribers were last told about. */
  told: DeskStatus;
}

export class DeskStatusFeed {
  private readonly entries = new Map<StationId, Entry>();
  private readonly listeners = new Map<StationId, Set<() => void>>();
  private unhook: (() => void) | null = null;

  constructor(private readonly source: BankSource) {}

  /** The desk's status now (the same object until it changes, so a view re-renders only on a real change). Each desk is
   * read on its own: reading one never uses up another desk's change before its subscribers have heard of it. */
  get(id: StationId): DeskStatus {
    const view = this.source.getState().view;
    const e = this.entries.get(id);
    if (!e) {
      const status = deskStatusOf(view.stations[id]);
      this.entries.set(id, { view, status, told: status });
      return status;
    }
    if (e.view !== view) {
      e.view = view;
      const now = deskStatusOf(view.stations[id]);
      if (!same(e.status, now)) e.status = now;
    }
    return e.status;
  }

  /** Hears about changes to desk `id`'s status; returns the way to stop. */
  subscribe(id: StationId, listener: () => void): () => void {
    let set = this.listeners.get(id);
    if (!set) {
      set = new Set();
      this.listeners.set(id, set);
    }
    set.add(listener);
    if (!this.unhook) this.unhook = this.source.subscribe(() => this.publish());
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(id);
      if (this.listeners.size === 0 && this.unhook) {
        this.unhook();
        this.unhook = null;
      }
    };
  }

  /** Tells each subscribed desk whose status is not what its subscribers were last told. */
  private publish(): void {
    for (const [id, set] of this.listeners) {
      const now = this.get(id);
      const e = this.entries.get(id)!;
      if (e.told === now) continue;
      e.told = now;
      for (const l of set) l();
    }
  }
}
