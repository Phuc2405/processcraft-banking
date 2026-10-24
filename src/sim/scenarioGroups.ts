/**
 * Sorts a lesson's example payments into the two groups the test-scenario picker shows:
 *
 *   happy   approved under the bank's default rules, not fraud, and no desk on the way raises a warning or a failure
 *           (no OTP challenge, no fallback, no flag): the straight-through path (Luồng chuẩn)
 *   edge    anything else: a decline, a hold in suspense, a detour, or fraud that slips through (Tình huống lỗi & Ngoại lệ)
 *
 * The group is read from the walkthrough's own verdict under DEFAULT_RULES, so it can never disagree with what the tour
 * shows on its first run, and it does not move when a learner turns a dial. Pure, memoised per lesson.
 */

import { LESSONS, type LessonExample, type ProcessId } from './learning';
import { DEFAULT_RULES } from './rules';
import { buildWalkthrough } from './walkthrough';

export type ScenarioPath = 'happy' | 'edge';

export const SCENARIO_PATHS: readonly ScenarioPath[] = ['happy', 'edge'];

const cache = new Map<ProcessId, ReadonlyMap<string, ScenarioPath>>();

function pathsOf(lessonId: ProcessId): ReadonlyMap<string, ScenarioPath> {
  const hit = cache.get(lessonId);
  if (hit) return hit;
  const out = new Map<string, ScenarioPath>();
  for (const ex of LESSONS[lessonId].examples) {
    const walk = buildWalkthrough(lessonId, ex.id, DEFAULT_RULES);
    const straight = walk.steps.every((s) => s.tone === 'neutral' || s.tone === 'good');
    out.set(ex.id, walk.verdict.outcome === 'APPROVED' && !ex.payload.isFraud && straight ? 'happy' : 'edge');
  }
  cache.set(lessonId, out);
  return out;
}

/** Which group an example belongs to. An unknown id counts as an edge case. */
export const scenarioPathOf = (lessonId: ProcessId, exampleId: string): ScenarioPath => pathsOf(lessonId).get(exampleId) ?? 'edge';

/** The examples split into the two groups, each in the lesson's own order. Works on localised examples too (ids are shared). */
export function groupScenarios<E extends Pick<LessonExample, 'id'>>(lessonId: ProcessId, examples: readonly E[]): Record<ScenarioPath, E[]> {
  const groups: Record<ScenarioPath, E[]> = { happy: [], edge: [] };
  for (const ex of examples) groups[scenarioPathOf(lessonId, ex.id)].push(ex);
  return groups;
}
