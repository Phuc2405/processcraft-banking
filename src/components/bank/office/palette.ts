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
  SETTLEMENT: '#f59e0b',
};

/** The colour of a wire's painted lane: pastel tape on the warm floor, matching the 2D map's meaning. */
export function laneHex(to: string, from: string): string {
  if (to === 'OUT_DECLINED') return '#f0a3b3';
  if (from === 'OUT_APPROVED' || from.startsWith('EOD_') || from === 'RECON' || from === 'SUSPENSE' || to === 'OUT_SETTLED') return '#e8bd7a';
  if (to === 'CUSTOMER_OTP' || from === 'CUSTOMER_OTP') return '#c4b5fd';
  return '#c9c2b4';
}

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
