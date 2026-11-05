/**
 * The sub-process registry: one bilingual fact sheet per guided flow, per sub-group the top menu lists, and per cross-cutting domain
 * (CIT, AML), read by the right-side info drawer. The model is in subProcessModel.ts, the sheets in subProcessFlowSheets.ts and
 * subProcessGroupSheets.ts, and the keys in subProcessKeys.ts (so the menu and the inspector can use them without this content).
 */

import { FLOW_SHEETS } from './subProcessFlowSheets';
import { GROUP_SHEETS } from './subProcessGroupSheets';
import type { SubProcessInfo } from './subProcessModel';
import type { InfoKey } from './subProcessKeys';

export { ACTORS, glLine, type ActorId, type GlRef, type StpMode, type SubProcessInfo } from './subProcessModel';
export { GROUP_INFO_KEYS, INFO_KEYS, infoKeyForChoice, infoKeyForPlace, isInfoKey, type GroupInfoKey, type InfoKey } from './subProcessKeys';

export const SUB_PROCESS_REGISTRY: Readonly<Record<InfoKey, SubProcessInfo>> = Object.fromEntries([...FLOW_SHEETS, ...GROUP_SHEETS].map((e) => [e.key, e])) as Record<InfoKey, SubProcessInfo>;
export const subProcessInfo = (key: InfoKey): SubProcessInfo => SUB_PROCESS_REGISTRY[key];
