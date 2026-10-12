import { curriculumPosition } from './seedChallenges';

/** One colour per stage of the Academy, so a stage looks the same in the level bar, the tour and the cards. */
const STAGE_ACCENT: Readonly<Record<number, string>> = { 1: '#34d399', 2: '#fbbf24', 3: '#a78bfa', 4: '#2dd4bf', 5: '#38bdf8', 6: '#fb7185' };

export const stageAccent = (stage: number): string => STAGE_ACCENT[stage] ?? '#38bdf8';

export const levelAccent = (levelId: string): string => stageAccent(curriculumPosition(levelId)?.stage ?? 5);
