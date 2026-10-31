/** Which overlay is open over the app (the welcome chooser, the AML desk, the payment-rail benchmark, the Chaos Monkey panel, the audit report) and whether sound is on. */

import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { browserStorage, type KeyValueStorage } from './persistence';

export const ONBOARDED_KEY = 'processcraft_has_onboarded';
export const SOUND_KEY = 'processcraft:v1:sound';

export type Overlay = 'none' | 'aml' | 'benchmark' | 'chaos' | 'audit' | 'knowledge';

/** The Knowledge Base's tabs: the core ledger, AML compliance, the retail scenarios, and the retail flashcards. */
export type KnowledgeTab = 'core' | 'aml' | 'retail' | 'flashcards';

/** The tab an anchor lives on: AML anchors start with `aml`, retail guides with `retail`, cards with `flash-`, everything else is the core ledger's. */
export const knowledgeTabOf = (anchor: string | null): KnowledgeTab => (anchor?.startsWith('aml') ? 'aml' : anchor?.startsWith('retail') ? 'retail' : anchor?.startsWith('flash-') ? 'flashcards' : 'core');

export interface UiState {
  /** The "Choose Your Experience Mode" chooser. */
  welcomeOpen: boolean;
  overlay: Overlay;
  /** The Knowledge Base section to scroll to when the article opens (a section, an account `gl-<ID>` or a term `term-<KEY>`). */
  knowledgeAnchor: string | null;
  /** The tab the Knowledge Base opens on: where it was opened from (the ledger, the AML desk), or the anchor's. */
  knowledgeTab: KnowledgeTab;
  /** The overlay the Knowledge Base was opened over, which closing it returns to. */
  knowledgeReturn: Overlay;
  /** The AML case the desk should open on (a toast's click), until the desk has. */
  amlFocus: string | null;
  /** Opens the AML desk on one case. */
  openAmlCase(caseId: string): void;
  clearAmlFocus(): void;
  /** Sound effects are on. */
  soundOn: boolean;
  openWelcome(): void;
  /** Closes the chooser and remembers that the learner has seen it. */
  closeWelcome(): void;
  open(overlay: Exclude<Overlay, 'none'>): void;
  close(): void;
  toggle(overlay: Exclude<Overlay, 'none'>): void;
  setSoundOn(on: boolean): void;
  /** Opens the Knowledge Base, optionally at an anchor, on the tab given (or the anchor's). */
  openKnowledge(anchor?: string | null, tab?: KnowledgeTab): void;
  setKnowledgeTab(tab: KnowledgeTab): void;
  /** Closes the Knowledge Base, back to the overlay it was opened over. */
  closeKnowledge(): void;
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
    knowledgeTab: 'core',
    knowledgeReturn: 'none',
    amlFocus: null,
    openAmlCase: (caseId) => set({ overlay: 'aml', amlFocus: caseId }),
    clearAmlFocus: () => {
      if (get().amlFocus !== null) set({ amlFocus: null });
    },
    soundOn: readSound(storage),
    openWelcome: () => set({ welcomeOpen: true, overlay: 'none' }),
    closeWelcome: () => {
      write(storage, ONBOARDED_KEY, 'true');
      if (get().welcomeOpen) set({ welcomeOpen: false });
    },
    open: (overlay) => set({ overlay }),
    openKnowledge: (anchor = null, tab) => {
      const from = get().overlay;
      set({ overlay: 'knowledge', knowledgeAnchor: anchor, knowledgeTab: tab ?? knowledgeTabOf(anchor), knowledgeReturn: from === 'knowledge' ? get().knowledgeReturn : from });
    },
    setKnowledgeTab: (tab) => set({ knowledgeTab: tab, knowledgeAnchor: null }),
    closeKnowledge: () => set({ overlay: get().knowledgeReturn, knowledgeReturn: 'none', knowledgeAnchor: null }),
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
