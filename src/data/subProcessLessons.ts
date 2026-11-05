/**
 * The 📖 of every sub-process: the Knowledge Base anchor its lesson lives at. One table for every sheet key (flows, sub-groups, the
 * CIT children and the domains) and every demo group, so the top menu, the drawer and the dock all open the same lesson. A test
 * holds every anchor to a section the Knowledge Base really renders.
 */

import type { DemoGroupId } from '../sim/demoGroups';
import { opsLessonAnchor } from './retailOpsKnowledge';
import type { InfoKey } from './subProcessKeys';

export type LessonKey = InfoKey | DemoGroupId;

export const SUBPROCESS_LESSON: Readonly<Record<LessonKey, string>> = {
  // The eight flows
  'flow-1': 'card-pos-auth',
  'flow-2': 'card-3ds-token',
  'flow-3': 'retail-atm',
  'flow-4': 'retail-eod-recon',
  'flow-5': 'retail-ekyc-risk',
  'flow-6': 'retail-teller-vault',
  'flow-7': 'retail-wallet-qr',
  'flow-8': 'flow-swift',
  // Core sub-groups
  'card-auth': 'card-pos-auth',
  'token-3ds': 'card-3ds-token',
  'eod-batch': 'retail-eod-recon',
  'ekyc-onboard': 'retail-ekyc-risk',
  'cash-ctr': 'aml-typologies',
  'swift-remit': 'flow-swift',
  disputes: 'flow-dispute',
  // Retail sub-processes: each has a lesson of its own
  'bill-pay': opsLessonAnchor('bill-pay'),
  'wallet-qr': opsLessonAnchor('wallet-qr'),
  'atm-napas': opsLessonAnchor('atm-napas'),
  'cassette-jam': opsLessonAnchor('cassette-jam'),
  'teller-vault': opsLessonAnchor('teller-vault'),
  'card-fees': opsLessonAnchor('card-fees'),
  'bnpl-credit': opsLessonAnchor('bnpl-credit'),
  'debt-waterfall': opsLessonAnchor('debt-waterfall'),
  'credit-risk': opsLessonAnchor('credit-risk'),
  'term-deposit': opsLessonAnchor('term-deposit'),
  collateral: opsLessonAnchor('collateral'),
  'auto-pay': opsLessonAnchor('auto-pay'),
  // The CIT domain and its four children
  'cit-vault': 'cit-concept',
  '06-cit-atm': 'cit-atm',
  '06-cit-doorstep': 'cit-doorstep',
  '06-cit-sbv': 'cit-sbv',
  '06-cit-teller-vault': 'cit-teller',
  // AML
  'aml-sanctions': 'aml-cft',
};

export const lessonAnchor = (key: LessonKey): string => SUBPROCESS_LESSON[key];
