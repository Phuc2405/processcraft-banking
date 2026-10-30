/**
 * The notification manager (Observer): the feedback toasts of Location B, and where they may stand.
 *
 * Location A, the top system banner zone, belongs to the start-of-day banner alone (DayIntroBanner reports its box here).
 * Location B, the action feedback zone, sits directly underneath it: toasts never cover the banner. A toast the learner's own
 * click raised shows at once; one that arrived on its own (an FIU directive, an EDD timeout during the rollover) waits until
 * the start-of-day banner has gone. They come in one at a time, a beat apart, at most NOTICE_MAX at once, and each fades out
 * after NOTICE_TTL_MS unless closed first.
 */

import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Localized } from '../i18n/locale';

export type NoticeTone = 'danger' | 'success' | 'info' | 'warning';

export interface Notice {
  id: number;
  tone: NoticeTone;
  icon: string;
  title: Localized<string>;
  body?: Localized<string>;
  /** Arrived on its own rather than from the learner's click: it waits while the start-of-day banner shows. */
  deferred: boolean;
  /** What raised it (a case id), for tests and the DOM. */
  source?: string;
  /** Clicking the toast does this (and closes it): e.g. open the AML desk on the case. */
  onOpen?: () => void;
}

export interface ShownNotice extends Notice {
  /** When it appeared (ms). */
  at: number;
}

/** Location A's box in the viewport: where the start-of-day banner stands, and whether it is showing. */
export interface SodBand {
  open: boolean;
  top: number;
  bottom: number;
}

export const NOTICE_TTL_MS = 5_000;
export const NOTICE_FADE_MS = 450;
export const NOTICE_STAGGER_MS = 700;
export const NOTICE_MAX = 3;
/** The gap between Location A and Location B (px). */
export const NOTICE_GAP = 8;
/** Where Location B starts while the banner has never been measured: just under the app's header. */
export const DEFAULT_SOD_TOP = 80;

export interface NoticeQueue {
  queue: readonly Notice[];
  shown: readonly ShownNotice[];
  /** When the last toast appeared (ms), for the stagger. */
  lastAt: number;
}

/** One beat of the queue at `now`: expired toasts leave, and the next one waiting comes in if there is room and its turn has come. */
export function pumpNotices(q: NoticeQueue, now: number, sodOpen: boolean): NoticeQueue {
  const shown = q.shown.filter((n) => now - n.at < NOTICE_TTL_MS);
  let { queue, lastAt } = q;
  if (shown.length < NOTICE_MAX && now - lastAt >= NOTICE_STAGGER_MS) {
    const i = queue.findIndex((n) => !(n.deferred && sodOpen));
    if (i >= 0) {
      shown.push({ ...queue[i]!, at: now });
      queue = [...queue.slice(0, i), ...queue.slice(i + 1)];
      lastAt = now;
    }
  }
  return shown.length === q.shown.length && queue === q.queue ? q : { queue, shown, lastAt };
}

/** Where Location B's top edge goes: under the banner while it shows, else where the banner stands. */
export const noticeTop = (sod: SodBand): number => (sod.open ? sod.bottom + NOTICE_GAP : sod.top);

export interface NotificationState extends NoticeQueue {
  sod: SodBand;
  push(n: Omit<Notice, 'id'>): number;
  dismiss(id: number): void;
  /** Moves the queue on to `now` (ms). */
  pump(now: number): void;
  setSod(sod: SodBand): void;
  clear(): void;
}

export function createNotificationStore(): StoreApi<NotificationState> {
  let nextId = 1;
  return createStore<NotificationState>()((set, get) => ({
    queue: [],
    shown: [],
    lastAt: -Infinity,
    sod: { open: false, top: DEFAULT_SOD_TOP, bottom: DEFAULT_SOD_TOP },
    push: (n) => {
      const id = nextId++;
      set((s) => ({ queue: [...s.queue, { ...n, id }] }));
      return id;
    },
    dismiss: (id) => set((s) => ({ queue: s.queue.filter((n) => n.id !== id), shown: s.shown.filter((n) => n.id !== id) })),
    pump: (now) => {
      const s = get();
      const next = pumpNotices(s, now, s.sod.open);
      if (next !== s) set({ queue: next.queue, shown: next.shown, lastAt: next.lastAt });
    },
    setSod: (sod) => {
      const cur = get().sod;
      if (cur.open !== sod.open || cur.top !== sod.top || cur.bottom !== sod.bottom) set({ sod });
    },
    clear: () => set({ queue: [], shown: [], lastAt: -Infinity }),
  }));
}

export const notificationStore = createNotificationStore();

export function useNotificationStore<T>(selector: (state: NotificationState) => T): T {
  return useStore(notificationStore, selector);
}
