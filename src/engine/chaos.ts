/** Chaos Monkey: fault injection for the Living Bank, and the two scripted operations days. */

import type { CheckoutKind } from '../sim/types';

export interface ChaosToggles {
  posOutage: boolean;
  hsmFailure: boolean;
  congestion: boolean;
  fatigueSpike: boolean;
}

export interface ChaosConfig extends ChaosToggles {
  /** Day 2 is the flash-sale surge and day 3 the botnet attack. */
  scriptedDays: boolean;
}

export type ChaosToggleId = keyof ChaosToggles;
export const CHAOS_TOGGLE_IDS: readonly ChaosToggleId[] = ['posOutage', 'hsmFailure', 'congestion', 'fatigueSpike'];

export const NO_CHAOS: ChaosConfig = { posOutage: false, hsmFailure: false, congestion: false, fatigueSpike: false, scriptedDays: false };

export type ChaosScenario = 'NONE' | 'FLASH_SURGE' | 'BOTNET';

/** What Chaos Monkey did to one payment, for the audit trail. */
export type ChaosTag = 'SURGE' | 'BOT' | 'MISAPPROVED' | 'POS_OUTAGE' | 'HSM_FAILURE' | 'TIMEOUT_504' | 'INQUIRY_RECOVERED';

/** What the chaos engine did today. Reset at the start of every day. */
export interface ChaosStats {
  /** Extra customers the flash sale brought in. */
  surgeCustomers: number;
  botAttempts: number;
  botBlocked: number;
  botApproved: number;
  /** Bots a fatigued analyst waved through. */
  misApprovals: number;
  posOutageDeclines: number;
  hsmDeclines: number;
  /** Payments that hit a 504 gateway timeout. */
  timeouts504: number;
  /** Of those, recovered by the automatic status inquiry. */
  inquiriesRecovered: number;
  /** Of those, still unanswered after the inquiry and declined (RC 68). */
  inquiriesFailed: number;
  velocityAlerts: number;
  /** Seconds of extra latency the congestion added, across every payment. */
  addedLatencyMs: number;
}

export interface ChaosView {
  scenario: ChaosScenario;
  config: ChaosConfig;
  stats: ChaosStats;
  /** Any fault on, or a scripted scenario running today. */
  active: boolean;
}

export const emptyChaosStats = (): ChaosStats => ({
  surgeCustomers: 0,
  botAttempts: 0,
  botBlocked: 0,
  botApproved: 0,
  misApprovals: 0,
  posOutageDeclines: 0,
  hsmDeclines: 0,
  timeouts504: 0,
  inquiriesRecovered: 0,
  inquiriesFailed: 0,
  velocityAlerts: 0,
  addedLatencyMs: 0,
});

// Tuning

export const SURGE_MULTIPLIER = 3;
export const BOTS_PER_BEAT = 4;
export const BOT_AMOUNT_CENTS = 100;
export const CONGESTION_LATENCY_MS = 4_500;
export const CONGESTION_TIMEOUT_RATE = 0.35;
export const INQUIRY_RECOVERY_RATE = 0.8;
export const FATIGUE_SPIKE_LEVEL = 90;
/** Fatigue points a fraud analyst gains for every bot alert they look at. */
export const ALERT_FATIGUE_PER_BOT = 0.08;
/** Above this fatigue the fraud desk starts to wave bots through. */
export const MISAPPROVAL_FATIGUE = 70;
export const MAX_MISAPPROVAL_CHANCE = 0.6;

/** Channels whose cryptograms (3DS, dCVV) the HSM signs. */
export const HSM_CHANNELS: ReadonlySet<CheckoutKind> = new Set<CheckoutKind>(['ECOM', 'VIRTUAL', 'BNPL']);

/** The ISO 8583 response code each fault answers with. */
export const CHAOS_RESPONSE_CODE = { posOutage: '91', hsmFailure: '96', timeout: '68' } as const;

// Rules

export const scenarioForDay = (day: number, scriptedDays: boolean): ChaosScenario => (!scriptedDays ? 'NONE' : day === 2 ? 'FLASH_SURGE' : day === 3 ? 'BOTNET' : 'NONE');

/** Congestion is on when the toggle is, and throughout the flash sale. */
export const congestionOn = (config: ChaosConfig, scenario: ChaosScenario): boolean => config.congestion || scenario === 'FLASH_SURGE';

export const anyToggle = (t: ChaosToggles): boolean => CHAOS_TOGGLE_IDS.some((id) => t[id]);

export const chaosActive = (config: ChaosConfig, scenario: ChaosScenario): boolean => anyToggle(config) || scenario !== 'NONE';

export type CongestionOutcome = 'CLEAR' | 'RECOVERED' | 'TIMED_OUT';

/** One payment through a congested network, from two independent draws in [0, 1): did it hit a 504, and if so did the status inquiry bring the answer back? */
export function congestionOutcome(timeoutDraw: number, inquiryDraw: number): CongestionOutcome {
  if (timeoutDraw >= CONGESTION_TIMEOUT_RATE) return 'CLEAR';
  return inquiryDraw < INQUIRY_RECOVERY_RATE ? 'RECOVERED' : 'TIMED_OUT';
}

/** How likely a fraud analyst at this fatigue is to wave a bot through. 0 up to 70%, rising to 60% at 100%. */
export function misApprovalChance(fatigue: number): number {
  if (!Number.isFinite(fatigue) || fatigue <= MISAPPROVAL_FATIGUE) return 0;
  return Math.min(MAX_MISAPPROVAL_CHANCE, ((fatigue - MISAPPROVAL_FATIGUE) / (100 - MISAPPROVAL_FATIGUE)) * MAX_MISAPPROVAL_CHANCE);
}

/** A config read back from storage or a caller, with every field a boolean. */
export function cleanChaos(v: unknown): ChaosConfig {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof ChaosConfig, unknown>>;
  return {
    posOutage: o.posOutage === true,
    hsmFailure: o.hsmFailure === true,
    congestion: o.congestion === true,
    fatigueSpike: o.fatigueSpike === true,
    scriptedDays: o.scriptedDays === true,
  };
}
