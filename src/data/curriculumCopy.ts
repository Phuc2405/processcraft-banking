/**
 * The short names the level bar shows, so the six stages fit on one line. The full title is the tab's tooltip
 * and the heading of the level brief. One `Localized` table: a second language is one more entry.
 */

import { pick, type Localized } from '../i18n/locale';
import type { Id } from '../types/processLearning';

const EN: Readonly<Record<Id, string>> = {
  lvl_05_first_swipes: 'First Swipes',
  lvl_01_virtual_card_dcvv: 'Virtual Card',
  lvl_02_three_ds_routing: '3DS Routing',
  lvl_06_card_testing: 'Card-Testing',
  lvl_04_bnpl_pay_in_4: 'BNPL Pay-in-4',
  lvl_07_a2a_iso20022: 'A2A Rails',
  lvl_03_eod_recon_suspense: 'EOD Recon',
  lvl_08_fx_breaks: 'FX Breaks',
  lvl_09_sanctions_storm: 'Sanctions Storm',
  lvl_10_chargeback_warfare: 'Chargebacks',
};

export const LEVEL_TAB_LABELS: Localized<Readonly<Record<Id, string>>> = { en: EN };

/** The name on a level's tab: the short name when there is one, otherwise the full title. */
export const levelTabLabel = (levelId: Id, fullTitle: string): string => pick(LEVEL_TAB_LABELS)[levelId] ?? fullTitle;
