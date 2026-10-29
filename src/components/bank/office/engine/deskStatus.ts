import type { StationId } from '../../../../sim/topology';
import type { BankView, StationView } from '../../../../sim/types';
import { statusAfterWorking, workingCount } from '../../deskActivity';

/**
 * Desk status as one stream both views subscribe to (Observer). The 2D map's desk cards and the 3D office's desk badges and
 * tooltips show the same thing ("X waiting · Y working", and the status word unless it would only repeat "working"), so it
 * is worked out once, here, from the bank's view; each subscriber hears only about its own desk, and only when its status
 * actually changed. Pure: the bank's store comes in as a BankSource.
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

const same = (a: DeskStatus, b: DeskStatus): boolean => a.waiting === b.waiting && a.working === b.working && a.status === b.status && a.showStatus === b.showStatus;

export class DeskStatusFeed {
  private readonly current = new Map<StationId, DeskStatus>();
  private readonly listeners = new Map<StationId, Set<() => void>>();
  private unhook: (() => void) | null = null;
  private seen: BankView | null = null;

  constructor(private readonly source: BankSource) {}

  /** The desk's status now (the same object until it changes, so a view re-renders only on a real change). */
  get(id: StationId): DeskStatus {
    this.refresh();
    let s = this.current.get(id);
    if (!s) {
      s = deskStatusOf(this.source.getState().view.stations[id]);
      this.current.set(id, s);
    }
    return s;
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

  /** Brings every known desk's status up to date with the bank's view; the desks whose status changed. */
  private refresh(): StationId[] {
    const view = this.source.getState().view;
    if (view === this.seen) return [];
    this.seen = view;
    const changed: StationId[] = [];
    for (const [id, was] of this.current) {
      const now = deskStatusOf(view.stations[id]);
      if (!same(was, now)) {
        this.current.set(id, now);
        changed.push(id);
      }
    }
    return changed;
  }

  private publish(): void {
    for (const id of this.refresh()) for (const l of this.listeners.get(id) ?? []) l();
  }
}
