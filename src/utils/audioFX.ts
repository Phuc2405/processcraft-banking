/**
 * A tiny Web Audio synthesiser for the Living Bank's sound effects. No audio files: every sound is built from oscillators.
 *
 *   posSuccessDing   two bright sine notes, like a card terminal's approval chime
 *   errorBuzz        a short, low, pulsing square buzz for a decline or a fault
 *   botnetSiren      a two-second rising and falling siren for a botnet velocity alert
 *
 * Browsers only let a page make sound after the person has interacted with it, so the AudioContext is created lazily on the
 * first sound and resumed if it was suspended. Everything is a silent no-op where Web Audio does not exist (tests, old
 * browsers) or while sound is switched off. `bindAudioFX` listens to the bank and plays the right sound for what happens.
 */

import type { StoreApi } from 'zustand/vanilla';
import type { BankState } from '../store/bankStore';
import type { UiState } from '../store/uiStore';

type AudioCtor = typeof AudioContext;

let ctx: AudioContext | null = null;
let enabled = true;
/** The time each sound last started, so a burst of events never stacks the same sound on itself. */
const lastPlayed: Record<SoundName, number> = { posSuccessDing: 0, errorBuzz: 0, botnetSiren: 0 };
const MIN_GAP_MS: Record<SoundName, number> = { posSuccessDing: 120, errorBuzz: 350, botnetSiren: 2_500 };

export type SoundName = 'posSuccessDing' | 'errorBuzz' | 'botnetSiren';

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

const SOUNDS: Record<SoundName, () => void> = { posSuccessDing, errorBuzz, botnetSiren };

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
