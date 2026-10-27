import type { SearchAction } from '../../hooks/useSearchIndex';
import type { LevelId } from '../../sim/academyCatalog';
import type { PlaceId } from '../../sim/topology';
import { academyStore } from '../../store/academyStore';
import { bankStore } from '../../store/bankStore';
import { navStore } from '../../store/navStore';
import { uiStore } from '../../store/uiStore';

/** Fly the 2D map to a place and glow it. */
export function goToPlace(place: PlaceId): void {
  const bank = bankStore.getState();
  if (bank.viewMode !== '2d') bank.setViewMode('2d');
  if (academyStore.getState().isMaximized) academyStore.getState().setMaximized(false);
  navStore.getState().jump(place);
}

/** Open the Academy panel on a lesson. */
export function goToLesson(level: LevelId): void {
  const a = academyStore.getState();
  a.setStudyTab('lessons');
  a.setLevel(level);
  if (!academyStore.getState().isSplitScreenOpen) a.setSplitScreen(true);
}

export function runSearchAction(action: SearchAction): void {
  if (action.kind === 'place') goToPlace(action.place);
  else if (action.kind === 'lesson') goToLesson(action.level);
  else uiStore.getState().openKnowledge(action.anchor);
}
