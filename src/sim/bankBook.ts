/**
 * The bank's running books: its capital reserves and its customer base, carried from one day to the next.
 *
 * The simulation itself models payments, not accounts, so both are kept deliberately simple and fully deterministic:
 *
 *   Reserves   start at STARTING_RESERVES_CENTS and move by each day's net result (the Day result line of the P&L).
 *   Customers  start at STARTING_CUSTOMERS. Each day:
 *                - churn   = genuine customers turned away by friction or a false decline (the "Good customers lost" count:
 *                            an expired code, an OTP they walked away from, a 3DS reject, a long wait). They take their
 *                            business elsewhere.
 *                - signups = one in SIGNUP_EVERY approved payments came from a first-time customer who now has an account.
 *
 * Each day's report stores where the books ended, so the next day starts from there even after a reload or once early
 * reports have dropped out of the saved history.
 */

import type { DayKpis, DayReport } from './types';

export const STARTING_RESERVES_CENTS = 10_000_000; // $100,000.00
export const STARTING_CUSTOMERS = 5_400;
export const SIGNUP_EVERY = 20;

export interface BankBook {
  reservesStartCents: number;
  reservesEndCents: number;
  customersStart: number;
  signups: number;
  churned: number;
  customersEnd: number;
}

export const signupsFor = (k: DayKpis): number => Math.round(k.approved / SIGNUP_EVERY);
export const churnFor = (k: DayKpis): number => k.frictionLostCount;

/** Where the books stood when `day` began, from the report of the day before (or the opening balance). */
export function openingBook(previous: DayReport | undefined, netOf: (r: DayReport) => number): { reservesCents: number; customers: number } {
  if (!previous) return { reservesCents: STARTING_RESERVES_CENTS, customers: STARTING_CUSTOMERS };
  if (previous.book) return { reservesCents: previous.book.reservesEndCents, customers: previous.book.customersEnd };
  // A report saved before the books existed: rebuild them from what it does have.
  const k = previous.kpis;
  return { reservesCents: STARTING_RESERVES_CENTS + netOf(previous), customers: Math.max(0, STARTING_CUSTOMERS + signupsFor(k) - churnFor(k)) };
}

export function closeBook(opening: { reservesCents: number; customers: number }, k: DayKpis, netCents: number): BankBook {
  const signups = signupsFor(k);
  const churned = churnFor(k);
  return {
    reservesStartCents: opening.reservesCents,
    reservesEndCents: opening.reservesCents + netCents,
    customersStart: opening.customers,
    signups,
    churned,
    customersEnd: Math.max(0, opening.customers + signups - churned),
  };
}
