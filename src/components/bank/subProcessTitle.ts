import { pick, type Locale } from '../../i18n/locale';
import { flowText, GUIDED_FLOWS } from '../../sim/guidedFlows';
import { demoGroup, groupOf, showsGroupsOf } from '../../sim/demoGroups';
import { citChildOf, type BankState } from '../../store/bankStore';
import { CIT_INFO_KEYS } from '../../data/subProcessKeys';
import { CIT_SHEETS } from '../../data/subProcessCitSheets';

const CIT_SHEET_OF = new Map(CIT_SHEETS.map((s) => [s.key, s]));

/**
 * What the sub-process menu names as lit, in one place for the menu and the hover card's 📌 line: a picked CIT child (with its icon),
 * else the flow's picked sub-group (when the flow lists several), else the flow itself ("06. …").
 */
export function subProcessTitle(s: Pick<BankState, 'flow' | 'subProcess'>, locale: Locale): string {
  const child = citChildOf(s);
  const cit = child ? CIT_SHEET_OF.get(CIT_INFO_KEYS[child]) : undefined;
  if (cit) return `${cit.icon} ${pick(cit.title, locale)}`;
  const sub = groupOf(s.subProcess);
  if (sub && showsGroupsOf(s.flow)) return pick(demoGroup(sub).title, locale);
  return `${GUIDED_FLOWS[s.flow].code}. ${flowText(s.flow).title}`;
}
