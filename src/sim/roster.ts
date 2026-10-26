/**
 * The people. Every desk has named staff who get tired over a shift and slow down as they do.
 * Names, looks and pace are fixed by the seed, so the same bank has the same people every time it is opened.
 */

import { hashSeed, Rng } from './prng';
import { STATION_IDS, STATIONS, type StationId } from './topology';
import type { WorkerProfileSeed } from './types';

export interface WorkerSeed {
  id: string;
  name: string;
  role: string;
  station: StationId;
  /** 0.88-1.12: how fast this person is compared with a typical colleague. */
  pace: number;
  profile: WorkerProfileSeed;
  shift: string;
}

const FIRST_NAMES = [
  'Amara', 'Wei', 'Priya', 'Mateo', 'Imani', 'Hiro', 'Sofia', 'Kofi', 'Linh', 'Rafael', 'Noor', 'Tomasz', 'Aroha', 'Dmitri',
  'Zainab', 'Mei', 'Jamal', 'Ingrid', 'Arjun', 'Camila', 'Oluwaseun', 'Yuki', 'Hana', 'Lucas', 'Fatima', 'Declan', 'Anh', 'Rosa',
  'Kwame', 'Leila', 'Sven', 'Malia', 'Tariq', 'Elena', 'Ravi', 'Chloe', 'Joon', 'Beatriz', 'Samir', 'Nadia',
] as const;

const LAST_NAMES = [
  'Okafor', 'Chen', 'Nair', 'Alvarez', 'Mensah', 'Tanaka', 'Rossi', 'Nguyen', 'Haddad', 'Kowalski', 'Walker', 'Singh', 'Costa',
  'Larsen', 'Adeyemi', 'Park', 'Moreau', 'Fraser', 'Bianchi', 'Khan', 'Murphy', 'Sato', 'Petrov', 'Lopez', 'Ndlovu', 'Hughes',
  'Tran', 'Reyes', 'Cohen', 'Ito',
] as const;

const SKIN = ['#f1c9a5', '#e0ac86', '#c68863', '#8d5a3b', '#6b4226', '#f6d7bd'] as const;
const HAIR = ['#171717', '#2b2118', '#3b2f2f', '#5b3a1e', '#7c4a21', '#a8742a', '#4a4a4a'] as const;

const SHIRT: Record<StationId, string> = {
  GATE_VIRTUAL: '#65a30d',
  GATE_POS: '#65a30d',
  GATE_ECOM: '#65a30d',
  SEC_VAULT: '#0e7490',
  SEC_DCVV: '#6d28d9',
  SEC_3DS: '#4f46e5',
  LEDGER_DEBIT: '#047857',
  LEDGER_CREDIT: '#0f766e',
  BNPL: '#be185d',
  EOD_BATCH: '#b45309',
  EOD_VISA: '#a16207',
  RECON: '#b45309',
  SUSPENSE: '#92400e',
  GATE_A2A: '#65a30d',
  GATE_ATM: '#0284c7',
  ATM_CASH: '#0284c7',
  GATE_EKYC: '#0f766e',
  GATE_QR: '#0f766e',
  TELLER_CASH: '#115e59',
  SEC_FACEPAY: '#0f766e',
  SEC_FDS: '#b91c1c',
  AML_DESK: '#991b1b',
  DISPUTE_DESK: '#c2410c',
  GATE_SWIFT: '#c2410c',
};

export const ROLE: Record<StationId, string> = {
  GATE_VIRTUAL: 'Gateway monitor, virtual cards',
  GATE_POS: 'Gateway monitor, card terminals',
  GATE_ECOM: 'Gateway monitor, e-commerce',
  SEC_VAULT: 'Token vault clerk',
  SEC_DCVV: 'Card security teller',
  SEC_3DS: '3DS risk officer',
  LEDGER_DEBIT: 'Debit ledger accountant',
  LEDGER_CREDIT: 'Credit line analyst',
  BNPL: 'Pay-in-4 underwriter',
  EOD_BATCH: 'Batch clearing operator',
  EOD_VISA: 'Settlement operator',
  RECON: 'Reconciliation accountant',
  SUSPENSE: 'Suspense account clerk',
  GATE_A2A: 'Gateway monitor, instant payments',
  GATE_ATM: 'Machine: card reader and PIN pad',
  ATM_CASH: 'Machine: cash dispenser',
  GATE_EKYC: 'Server AI engine, eKYC',
  GATE_QR: 'Gateway monitor, VietQR',
  TELLER_CASH: 'Branch teller',
  SEC_FACEPAY: 'Server AI engine, FacePay',
  SEC_FDS: 'Server AI engine, FDS',
  AML_DESK: 'Compliance analyst',
  DISPUTE_DESK: 'Disputes specialist',
  GATE_SWIFT: 'Gateway monitor, SWIFT',
};

/** A machine's name where a person's would be. */
const MACHINE_NAME: Partial<Record<StationId, string>> = { GATE_ATM: 'Card & PIN bay', ATM_CASH: 'Cash bay' };

export const DAY_SHIFT = '08:00 – 18:00';
export const NIGHT_SHIFT = '22:30 – 02:00';

export const isNightStation = (station: StationId): boolean => station === 'EOD_BATCH' || station === 'EOD_VISA' || station === 'RECON';

function nameFor(rng: Rng, taken: Set<string>): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    const name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
    if (!taken.has(name)) {
      taken.add(name);
      return name;
    }
  }
  return `Colleague ${taken.size + 1}`;
}

export function workerSeed(seed: number, station: StationId, index: number, taken: Set<string>, temp = false): WorkerSeed {
  if (STATIONS[station].automated) {
    // A machine is the same every day, draws nothing from the seed, and never takes a name a person might have.
    return {
      id: `w_${station.toLowerCase()}_${index + 1}`,
      name: MACHINE_NAME[station] ?? 'ATM',
      role: ROLE[station],
      station,
      pace: 1,
      profile: { skin: '#94a3b8', hair: '#475569', shirt: SHIRT[station] },
      shift: 'Open 24 hours',
    };
  }
  const rng = new Rng(hashSeed(seed, 'worker', station, index, temp ? 'temp' : 'perm'));
  return {
    id: `w_${station.toLowerCase()}_${temp ? 't' : ''}${index + 1}`,
    name: temp ? `${nameFor(rng, taken)} (cover)` : nameFor(rng, taken),
    role: ROLE[station],
    station,
    pace: Math.round((0.88 + rng.next() * 0.24) * 100) / 100,
    profile: { skin: rng.pick(SKIN), hair: rng.pick(HAIR), shirt: SHIRT[station] },
    shift: temp ? 'Temporary cover, today only' : isNightStation(station) ? NIGHT_SHIFT : DAY_SHIFT,
  };
}

/** Everyone who is on the books, by desk. */
export function rosterFor(seed: number): Record<StationId, WorkerSeed[]> {
  const taken = new Set<string>();
  const out = {} as Record<StationId, WorkerSeed[]>;
  for (const station of STATION_IDS) {
    out[station] = Array.from({ length: STATIONS[station].staff }, (_, i) => workerSeed(seed, station, i, taken));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiredness
// ─────────────────────────────────────────────────────────────────────────────

/** A fresh person works at 1. A worn-out one at about half. */
export const productivityFor = (fatigue: number): number => 1 - 0.45 * (Math.min(100, Math.max(0, fatigue)) / 100) ** 1.6;

/**
 * How much more tired someone gets over `minutes` of bank time if they were busy `busyShare` (0-1) of it.
 * Being at a desk wears you down a little; being flat out wears you down a lot; idle moments let you recover.
 */
export function fatigueChange(minutes: number, busyShare: number): number {
  const u = Math.min(1, Math.max(0, busyShare));
  return minutes * (0.03 + 0.145 * u - 0.06 * (1 - u));
}

/**
 * Stamina recovery: while a desk's load (the share of the beat its people were busy) stays below `belowLoad`, everyone on
 * shift there gets their breath back on top of the idle recovery in fatigueChange, so a quiet spell after a rush refills the bar.
 */
export const STAMINA_RECOVERY = { belowLoad: 0.3, perMinute: 0.12 } as const;

/** Fatigue points recovered over `minutes` at a desk running at `deskLoad` (0-1). */
export const staminaRecovery = (minutes: number, deskLoad: number): number => (deskLoad < STAMINA_RECOVERY.belowLoad ? minutes * STAMINA_RECOVERY.perMinute : 0);

/** After a night's sleep, a person keeps this share of their tiredness. */
export const OVERNIGHT_KEEP = 0.35;

/** The chance a tired person fumbles an item and has to redo it. Zero until they are quite worn out. */
export const mistakeChance = (fatigue: number): number => (fatigue <= 60 ? 0 : ((fatigue - 60) / 40) * 0.12);

export const MAX_COVER_PER_STATION = 2;

/**
 * The night team works through the body's low point, so a minute of work tires them more than the same minute by day. How much
 * more depends on how hard they are working: someone keeping up with a light night barely feels it, someone flat out on a
 * heavy one tires about three and a half times as fast. `busyShare` is the share of the beat the person was working (their
 * throughput against their capacity), so the drop follows the load instead of being a fixed penalty on whoever is on shift.
 */
export const NIGHT_FATIGUE = { idle: 1.2, flatOut: 3.6 } as const;
export const nightFatigueFactor = (busyShare: number): number => NIGHT_FATIGUE.idle + (NIGHT_FATIGUE.flatOut - NIGHT_FATIGUE.idle) * Math.min(1, Math.max(0, busyShare));

/** Tiredness at the start of a night shift, and in the morning for a day shift that has had no overtime. */
export const NIGHT_START_FATIGUE = 18;
export const DAY_START_FATIGUE = 6;

// ─────────────────────────────────────────────────────────────────────────────
// The night rota
// ─────────────────────────────────────────────────────────────────────────────

/** The desks of the night shift, in the order seats are handed out. */
export const NIGHT_STATIONS = ['EOD_BATCH', 'EOD_VISA', 'RECON'] as const satisfies readonly StationId[];
export type NightStation = (typeof NIGHT_STATIONS)[number];

/** People on the night team's books beyond the seats to fill, so that every night some of them have the night off. */
export const NIGHT_RESERVES = 3;

/** The night seats: how many people each night desk needs. */
export const NIGHT_SEATS: number = NIGHT_STATIONS.reduce((n, id) => n + STATIONS[id].staff, 0);

/**
 * Everyone on the night team. The first ones are the people `rosterFor` seats at the night desks (so day 1 is the same crew as
 * always); the reserves are drawn after the whole roster, so no one else's name changes. Each person can work any night desk:
 * their id, name, look and pace are their own, and the desk they sit at decides their role and uniform for the night.
 */
export function nightPoolFor(seed: number): WorkerSeed[] {
  const roster = rosterFor(seed);
  const taken = new Set(STATION_IDS.flatMap((id) => roster[id].map((w) => w.name)));
  const seated = NIGHT_STATIONS.flatMap((id) => roster[id]);
  const reserves = Array.from({ length: NIGHT_RESERVES }, (_, i) => workerSeed(seed, 'RECON', STATIONS.RECON.staff + i, taken));
  return [...seated, ...reserves].map((w, i) => ({ ...w, id: `w_night_${i + 1}` }));
}

export interface NightRota {
  /** Pool indices seated at each desk tonight. */
  seats: Record<NightStation, number[]>;
  /** Pool indices with the night off. */
  resting: number[];
}

/**
 * Who works which night desk on `day`. The pool turns by NIGHT_RESERVES places a day, so with 9 people and 6 seats everyone
 * works two nights in three and has the third off, and the one-person desks (Batch Clearing, Visa Settlement) change hands
 * every night. It is a pure function of the day, so reloading the page, "Reset day" and the what-if runs all see the same crew.
 */
export function nightRotaFor(day: number, poolSize = NIGHT_SEATS + NIGHT_RESERVES): NightRota {
  const shift = (((Math.max(1, Math.floor(day)) - 1) * NIGHT_RESERVES) % poolSize + poolSize) % poolSize;
  const order = Array.from({ length: poolSize }, (_, i) => (i + shift) % poolSize);
  const seats = {} as Record<NightStation, number[]>;
  let at = 0;
  for (const id of NIGHT_STATIONS) {
    seats[id] = order.slice(at, at + STATIONS[id].staff);
    at += STATIONS[id].staff;
  }
  return { seats, resting: order.slice(at) };
}

/** A pool member dressed for the desk they sit at tonight. */
export const seatAt = (member: WorkerSeed, station: NightStation): WorkerSeed => ({
  ...member,
  station,
  role: ROLE[station],
  profile: { ...member.profile, shirt: SHIRT[station] },
  shift: NIGHT_SHIFT,
});
