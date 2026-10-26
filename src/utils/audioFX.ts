/**
 * A tiny Web Audio synthesiser for the Living Bank's sound effects. No audio files: every sound is built from oscillators.
 *
 *   posSuccessDing   two bright sine notes, like a card terminal's approval chime
 *   errorBuzz        a short, low, pulsing square buzz for a decline or a fault
 *   botnetSiren      a two-second rising and falling siren for a botnet velocity alert
 *   comboSuccess     a high double beep for a correct review decision
 *   comboUp          an ascending major arpeggio when a combo reaches x1.5 or x2.0
 *   sopError         a low filtered buzz for a review decision against the SOP
 *   badgeUnlock      a bright rising fanfare with a shimmer when a badge unlocks
 *
 * Browsers only let a page make sound after the person has interacted with it, so the AudioContext is created lazily on the
 * first sound and resumed if it was suspended. Everything is a silent no-op where Web Audio does not exist (tests, old
 * browsers) or while sound is switched off. `bindAudioFX` listens to the bank and plays the right sound for what happens.
 */

import type { StoreApi } from 'zustand/vanilla';
import { comboTierUp } from '../sim/staffRoleplay';
import type { BankState } from '../store/bankStore';
import type { UiState } from '../store/uiStore';

type AudioCtor = typeof AudioContext;

let ctx: AudioContext | null = null;
let enabled = true;
/** The time each sound last started, so a burst of events never stacks the same sound on itself. */
const lastPlayed: Record<SoundName, number> = { posSuccessDing: 0, errorBuzz: 0, botnetSiren: 0, comboSuccess: 0, comboUp: 0, sopError: 0, badgeUnlock: 0 };
const MIN_GAP_MS: Record<SoundName, number> = { posSuccessDing: 120, errorBuzz: 350, botnetSiren: 2_500, comboSuccess: 120, comboUp: 300, sopError: 350, badgeUnlock: 1_200 };

export type SoundName = 'posSuccessDing' | 'errorBuzz' | 'botnetSiren' | 'comboSuccess' | 'comboUp' | 'sopError' | 'badgeUnlock';

function audioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** True when this browser can make sounds at all. */
export const audioSupported = (): boolean => audioCtor() !== null;

function context(): AudioContext | null {
  if (!enabled) return null;
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return ctx;
  }
  const Ctor = audioCtor();
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/** Turns every sound on or off. Off also suspends the context so it uses no CPU. */
export function setAudioEnabled(on: boolean): void {
  enabled = on;
  if (!on && ctx && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
}

export const audioEnabled = (): boolean => enabled;

/** One oscillator with an attack-decay envelope, starting `at` seconds from now. */
function tone(c: AudioContext, opts: { type: OscillatorType; freq: number; at: number; dur: number; gain: number; endFreq?: number }): void {
  const t0 = c.currentTime + opts.at;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.endFreq), t0 + opts.dur);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(opts.gain, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  osc.connect(amp);
  amp.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + opts.dur + 0.02);
}

/** The terminal's approval chime: E6 then A6, short and bright. */
export function posSuccessDing(): void {
  const c = context();
  if (!c) return;
  tone(c, { type: 'sine', freq: 1318.5, at: 0, dur: 0.16, gain: 0.18 });
  tone(c, { type: 'sine', freq: 1760, at: 0.11, dur: 0.32, gain: 0.16 });
  tone(c, { type: 'triangle', freq: 3520, at: 0.11, dur: 0.12, gain: 0.03 });
}

/** A decline: three quick low square pulses. */
export function errorBuzz(): void {
  const c = context();
  if (!c) return;
  for (let i = 0; i < 3; i++) tone(c, { type: 'square', freq: 110, at: i * 0.09, dur: 0.07, gain: 0.07 });
  tone(c, { type: 'sawtooth', freq: 82, at: 0, dur: 0.28, gain: 0.04 });
}

/** A botnet alarm: a siren that sweeps up and down twice over two seconds. */
export function botnetSiren(): void {
  const c = context();
  if (!c) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(520, t0);
  for (let i = 0; i < 2; i++) {
    osc.frequency.linearRampToValueAtTime(1180, t0 + i * 1 + 0.5);
    osc.frequency.linearRampToValueAtTime(520, t0 + i * 1 + 1);
  }
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2200, t0);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(0.09, t0 + 0.05);
  amp.gain.setValueAtTime(0.09, t0 + 1.85);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + 2);
  osc.connect(filter);
  filter.connect(amp);
  amp.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + 2.05);
}

/** A correct review: two quick high beeps (B6, B6). */
export function comboSuccess(): void {
  const c = context();
  if (!c) return;
  tone(c, { type: 'sine', freq: 1975.5, at: 0, dur: 0.08, gain: 0.14 });
  tone(c, { type: 'sine', freq: 1975.5, at: 0.11, dur: 0.12, gain: 0.14 });
}

/** A combo tier reached: C5–E5–G5–C6 rising, the last note held. */
export function comboUp(): void {
  const c = context();
  if (!c) return;
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => tone(c, { type: 'triangle', freq, at: i * 0.07, dur: i === 3 ? 0.45 : 0.2, gain: 0.12 }));
  tone(c, { type: 'sine', freq: 2093, at: 0.21, dur: 0.3, gain: 0.03 });
}

/** An SOP violation: a low sawtooth buzz through a lowpass, falling slightly. */
export function sopError(): void {
  const c = context();
  if (!c) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const filter = c.createBiquadFilter();
  const amp = c.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(90, t0);
  osc.frequency.linearRampToValueAtTime(65, t0 + 0.45);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(600, t0);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(0.1, t0 + 0.02);
  amp.gain.setValueAtTime(0.1, t0 + 0.35);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
  osc.connect(filter);
  filter.connect(amp);
  amp.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + 0.5);
}

/** A badge unlocked: G5–C6–E6–G6 rising into a held C7 chord with a high shimmer. */
export function badgeUnlock(): void {
  const c = context();
  if (!c) return;
  [783.99, 1046.5, 1318.5, 1568].forEach((freq, i) => tone(c, { type: 'triangle', freq, at: i * 0.09, dur: 0.22, gain: 0.11 }));
  [1046.5, 1318.5, 2093].forEach((freq) => tone(c, { type: 'sine', freq, at: 0.38, dur: 0.9, gain: 0.07 }));
  [4186, 3520, 4698.6].forEach((freq, i) => tone(c, { type: 'sine', freq, at: 0.42 + i * 0.08, dur: 0.18, gain: 0.025 }));
}

const SOUNDS: Record<SoundName, () => void> = { posSuccessDing, errorBuzz, botnetSiren, comboSuccess, comboUp, sopError, badgeUnlock };

/** Plays a sound by name, unless sound is off or the same sound played a moment ago. */
export function play(name: SoundName, nowMs: number = Date.now()): boolean {
  if (!enabled || nowMs - lastPlayed[name] < MIN_GAP_MS[name]) return false;
  lastPlayed[name] = nowMs;
  try {
    SOUNDS[name]();
  } catch {
    // A sound that cannot be made is never worth an error.
  }
  return true;
}

export const playSuccessSFX = (): boolean => play('comboSuccess');
export const playComboSFX = (): boolean => play('comboUp');
export const playErrorSFX = (): boolean => play('sopError');

/** The sound for one review decision given the streak after it. Pure, for tests. */
export function reviewSound(correct: boolean, comboAfter: number): SoundName {
  if (!correct) return 'sopError';
  return comboTierUp(comboAfter) ? 'comboUp' : 'comboSuccess';
}

/** What a change in the bank sounds like, or null for silence. Pure, so it can be tested without Web Audio. */
export function soundFor(prev: Pick<BankState, 'presetTrace' | 'view'>, next: Pick<BankState, 'presetTrace' | 'view'>): SoundName | null {
  const pc = prev.view.chaos.stats;
  const nc = next.view.chaos.stats;
  if (nc.velocityAlerts > pc.velocityAlerts) return 'botnetSiren';
  // The learner's own payment finishing is the clearest moment to hear.
  const was = prev.presetTrace;
  const now = next.presetTrace;
  if (now?.done && now.record && !(was?.done && was.id === now.id)) return now.record.status === 'APPROVED' ? 'posSuccessDing' : 'errorBuzz';
  const faults = (s: typeof nc): number => s.posOutageDeclines + s.hsmDeclines + s.inquiriesFailed + s.misApprovals;
  if (faults(nc) > faults(pc)) return 'errorBuzz';
  return null;
}

/** Plays the bank's sounds while bound. Returns the function that unbinds it. */
export function bindAudioFX(bank: StoreApi<BankState>, ui: StoreApi<UiState>): () => void {
  setAudioEnabled(ui.getState().soundOn);
  const offUi = ui.subscribe((s, p) => {
    if (s.soundOn !== p.soundOn) {
      setAudioEnabled(s.soundOn);
      if (s.soundOn) play('posSuccessDing');
    }
  });
  const offBank = bank.subscribe((s, p) => {
    if (s.view === p.view && s.presetTrace === p.presetTrace) return;
    const name = soundFor(p, s);
    if (name) play(name);
  });
  return () => {
    offUi();
    offBank();
  };
}
