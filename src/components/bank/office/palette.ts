import type { PacketKind, StationStatus } from '../../../sim/types';

/** The colour of a desk's lamp and edge strip. */
export const STATUS_HEX: Record<StationStatus, string> = {
  IDLE: '#94a3b8',
  BUSY: '#22c55e',
  CONGESTED: '#f59e0b',
  ALERT: '#ef4444',
};

/** The colour of a payment on its way between desks. */
export const PACKET_HEX: Record<PacketKind, string> = {
  VIRTUAL: '#8b5cf6',
  POS: '#0ea5e9',
  ECOM: '#10b981',
  BNPL: '#ec4899',
  A2A: '#14b8a6',
  ATM: '#16a34a',
  ONBOARD: '#2dd4bf',
  QR: '#06b6d4',
  TELLER: '#84cc16',
  SWIFT: '#fb923c',
  DISPUTE: '#f87171',
  SETTLEMENT: '#f59e0b',
};

/** What a wire carries, by the 2D map legend: a decline, the night run, an OTP challenge, or the approved, everyday path. */
export type LaneKind = 'reject' | 'night' | 'otp' | 'approve';

/** The same rules as the 2D map's wire colours (BankMap wireStyle). */
export function laneKind(to: string, from: string): LaneKind {
  if (to === 'OUT_DECLINED') return 'reject';
  if (from === 'OUT_APPROVED' || from.startsWith('EOD_') || from === 'RECON' || from === 'SUSPENSE' || to === 'OUT_SETTLED') return 'night';
  if (to === 'CUSTOMER_OTP' || from === 'CUSTOMER_OTP') return 'otp';
  return 'approve';
}

/**
 * How each kind of lane is drawn: its pastel tape on the warm floor; the legend colour it glows in when lit (the 2D Map
 * Legend's own strokes: red, blue, amber, purple); and its dashes in world units (red dashed, purple dotted, as in 2D).
 */
export const LANE_STYLE: Readonly<Record<LaneKind, { tape: string; glow: string; dash?: readonly [number, number] }>> = {
  reject: { tape: '#f0a3b3', glow: '#fb7185', dash: [0.42, 0.3] },
  approve: { tape: '#c9c2b4', glow: '#38bdf8' },
  night: { tape: '#e8bd7a', glow: '#fbbf24' },
  otp: { tape: '#c4b5fd', glow: '#a78bfa', dash: [0.13, 0.15] },
};

/** The colour of a wire's painted lane: pastel tape on the warm floor, matching the 2D map's meaning. */
export const laneHex = (to: string, from: string): string => LANE_STYLE[laneKind(to, from)].tape;

export const KIOSK_HEX = {
  OUT_APPROVED: '#22c55e',
  OUT_DECLINED: '#f43f5e',
  OUT_SETTLED: '#f59e0b',
  CUSTOMER_OTP: '#8b5cf6',
} as const;

/** The daylight diorama: warm wood, cream walls, slate trim. Every colour of the set lives here so it can be tuned in one place. */
export const SET = {
  /** Behind the office. */
  sky: '#dbe7f3',
  slabSide: '#5a4a3f',
  slabTrim: '#3f3430',
  wood: '#d9bf99',
  woodDark: '#c4a57c',
  wall: '#f3eadb',
  wainscot: '#d9c7a8',
  wallCap: '#b79f7f',
  skirting: '#8d7a64',
  glass: '#bfe3f2',
  steel: '#9aa8b6',
  steelDark: '#5b6776',
  desk: '#f1ebdf',
  deskTop: '#cfa56f',
  deskKick: '#6b5d50',
  chair: '#475569',
  chairTrim: '#334155',
  pot: '#e9d9c3',
  potDark: '#b9946a',
  leaf: ['#3f8f4f', '#4fa35c', '#2f7a43'],
  trousers: '#3b4760',
  shoes: '#2a2f3a',
  paper: '#fbf8f1',
  screenOff: '#475569',
  screenOn: '#7dd3fc',
  brass: '#d4a73c',
  rope: '#d64550',
} as const;
