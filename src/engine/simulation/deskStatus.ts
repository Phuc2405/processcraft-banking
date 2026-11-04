import type { StationId } from '../../sim/topology';
import type { BankView, StationView } from '../../sim/types';
import { statusAfterWorking, workingCount } from './deskActivity';

/** Desk status as one stream both views subscribe to (Observer). */

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

/** The people drawn at a desk on top of the simulation's own queue (the desk visits of sim/deskVisit.ts). */
export interface DeskPeople {
  waiting: number;
  processing: number;
}

/** Where those people are counted, and how to hear that the count changed. Each desk's entry keeps its identity until it changes. */
export interface DeskOverlay {
  get(id: StationId): DeskPeople | undefined;
  subscribe(listener: () => void): () => void;
}

/** A desk's status, from its view and the people drawn at it: "X waiting" counts both, "Y working" whichever is more, and an idle desk with people at it is busy. */
export function deskStatusOf(sv: StationView, people?: DeskPeople): DeskStatus {
  const working = Math.max(workingCount(sv), people?.processing ?? 0);
  const waiting = sv.queueLength + (people?.waiting ?? 0);
  const status = sv.status === 'IDLE' && waiting + working > 0 ? 'BUSY' : sv.status;
  return { waiting, working, status, showStatus: statusAfterWorking(status, working) };
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
  /** The view and the overlay entry this status was read from. */
  view: BankView;
  people: DeskPeople | undefined;
  status: DeskStatus;
  /** The status the desk's subscribers were last told about. */
  told: DeskStatus;
}

export class DeskStatusFeed {
  private readonly entries = new Map<StationId, Entry>();
  private readonly listeners = new Map<StationId, Set<() => void>>();
  private unhook: (() => void) | null = null;

  constructor(
    private readonly source: BankSource,
    private readonly overlay?: DeskOverlay,
  ) {}

  /** The desk's status now (the same object until it changes, so a view re-renders only on a real change). */
  get(id: StationId): DeskStatus {
    const view = this.source.getState().view;
    const people = this.overlay?.get(id);
    const e = this.entries.get(id);
    if (!e) {
      const status = deskStatusOf(view.stations[id], people);
      this.entries.set(id, { view, people, status, told: status });
      return status;
    }
    if (e.view !== view || e.people !== people) {
      e.view = view;
      e.people = people;
      const now = deskStatusOf(view.stations[id], people);
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
    if (!this.unhook) {
      const a = this.source.subscribe(() => this.publish());
      const b = this.overlay?.subscribe(() => this.publish());
      this.unhook = () => {
        a();
        b?.();
      };
    }
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
