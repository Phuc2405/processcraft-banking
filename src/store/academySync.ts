/**
 * Links the Academy split view to the Living Bank: whatever chapter or level the learner is on becomes the lit flow and the
 * focused node on the 2D map and in the 3D office.
 *
 *   panel closed     nothing is focused
 *   level chosen     its Phase 1 guided flow is lit (or the Advanced scope, for a desk no flow covers) and its node is focused
 *   chapter only     the chapter's flow is lit, with no single node focused
 *
 * One subscription, no timers. Returns the function that stops it.
 */

import type { StoreApi } from 'zustand/vanilla';
import { chapterById, levelById } from '../sim/academyCatalog';
import type { FlowId } from '../types/viewport';
import type { AcademyState } from './academyStore';
import type { BankState } from './bankStore';

export function applyAcademyFocus(academy: AcademyState, bank: Pick<BankState, 'focusAcademyStep' | 'clearAcademyFocus'>): void {
  if (!academy.isSplitScreenOpen) {
    bank.clearAcademyFocus();
    return;
  }
  const level = levelById(academy.activeLevelId);
  if (level) bank.focusAcademyStep({ flow: level.flow, place: level.place });
  else bank.focusAcademyStep({ flow: chapterById(academy.activeChapterId).flow, place: null });
}

export function bindAcademySync(academy: StoreApi<AcademyState>, bank: StoreApi<BankState>): () => void {
  applyAcademyFocus(academy.getState(), bank.getState());
  const stop = academy.subscribe((s, prev) => {
    if (s.isSplitScreenOpen === prev.isSplitScreenOpen && s.activeChapterId === prev.activeChapterId && s.activeLevelId === prev.activeLevelId) return;
    applyAcademyFocus(s, bank.getState());
  });
  return () => {
    stop();
    bank.getState().clearAcademyFocus();
  };
}

/**
 * "[▶ Simulate this Flow]": closes the lesson panel so the whole map is free, then lights the flow and plays its main payment
 * on the live 2D/3D map. With the bank paused, only that one payment plays and the clock stops when it is done.
 */
export function simulateFlow(academy: StoreApi<AcademyState>, bank: StoreApi<BankState>, flow: FlowId): void {
  academy.getState().setSplitScreen(false);
  bank.getState().triggerGuidedFlow(flow);
}
