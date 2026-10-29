/** Which overlay is open over the app (the welcome chooser, the AML desk, the payment-rail benchmark, the Chaos Monkey panel, the audit report) and whether sound is on. */

import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { browserStorage, type KeyValueStorage } from './persistence';

export const ONBOARDED_KEY = 'processcraft_has_onboarded';
export const SOUND_KEY = 'processcraft:v1:sound';

export type Overlay = 'none' | 'aml' | 'benchmark' | 'chaos' | 'audit' | 'knowledge';

export interface UiState {
  /** The "Choose Your Experience Mode" chooser. */
  welcomeOpen: boolean;
  overlay: Overlay;
  /** The Knowledge Base section to scroll to when the article opens (a section, an account `gl-<ID>` or a term `term-<KEY>`). */
  knowledgeAnchor: string | null;
  /** Sound effects are on. */
  soundOn: boolean;
  openWelcome(): void;
  /** Closes the chooser and remembers that the learner has seen it. */
  closeWelcome(): void;
  open(overlay: Exclude<Overlay, 'none'>): void;
  close(): void;
  toggle(overlay: Exclude<Overlay, 'none'>): void;
  setSoundOn(on: boolean): void;
  /** Opens the Knowledge Base, optionally at an anchor. */
  openKnowledge(anchor?: string | null): void;
}

function readOnboarded(storage: KeyValueStorage | null): boolean {
  try {
    const v = storage?.getItem(ONBOARDED_KEY) ?? null;
    return v !== null && v !== 'false';
  } catch {
    // Storage can be blocked (private windows, strict settings): the welcome then shows once per visit, which is harmless.
    return false;
  }
}

function readSound(storage: KeyValueStorage | null): boolean {
  try {
    return storage?.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

function write(storage: KeyValueStorage | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Remembering it is a nicety.
  }
}

export function createUiStore(options: { storage?: KeyValueStorage | null } = {}): StoreApi<UiState> {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  return createStore<UiState>()((set, get) => ({
    welcomeOpen: !readOnboarded(storage),
    overlay: 'none',
    knowledgeAnchor: null,
    soundOn: readSound(storage),
    openWelcome: () => set({ welcomeOpen: true, overlay: 'none' }),
    closeWelcome: () => {
      write(storage, ONBOARDED_KEY, 'true');
      if (get().welcomeOpen) set({ welcomeOpen: false });
    },
    open: (overlay) => set({ overlay }),
    openKnowledge: (anchor = null) => set({ overlay: 'knowledge', knowledgeAnchor: anchor }),
    close: () => {
      if (get().overlay !== 'none') set({ overlay: 'none' });
    },
    toggle: (overlay) => set({ overlay: get().overlay === overlay ? 'none' : overlay }),
    setSoundOn: (on) => {
      write(storage, SOUND_KEY, on ? 'on' : 'off');
      set({ soundOn: on });
    },
  }));
}

export const uiStore = createUiStore();

export function useUiStore<T>(selector: (state: UiState) => T): T {
  return useStore(uiStore, selector);
}
