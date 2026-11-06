/**
 * The sub-process sheet model: what one bilingual fact sheet holds, the actors it names, and how a GL line reads its code and name
 * from the book that owns the account (core ledger, retail book, CIT book). Legal chips are regulatory-registry ids. No React here.
 */

import { CHART_OF_ACCOUNTS } from '../engine/ledger';
import type { Locale, Localized } from '../i18n/localeCore';
import { citAccount, type CitAccountId } from '../sim/citEngine';
import { accountName } from '../sim/plainLanguage';
import { opsAccount, type OpsAccountId } from '../sim/retailOps';
import type { PlaceId } from '../sim/topology';
import type { AccountId } from '../types/processLearning';
import type { FlowId } from '../types/viewport';
import type { InfoKey } from './subProcessKeys';

export const L = (en: string, vi: string): Localized<string> => ({ en, vi });

export type StpMode = 'STP' | 'MANUAL' | 'HYBRID';

export const ACTORS = {
  customer: { icon: '🧑', name: L('Customer', 'Khách hàng') },
  merchant: { icon: '🏬', name: L('Merchant / acquirer', 'Đơn vị chấp nhận thẻ') },
  teller: { icon: '🧑‍💼', name: L('Teller', 'Giao dịch viên') },
  underwriter: { icon: '🧮', name: L('Underwriter', 'Chuyên viên thẩm định') },
  cit: { icon: '🚚', name: L('CIT team & custodians', 'Đội CIT & thủ quỹ') },
  ledger: { icon: '📒', name: L('Core Banking Ledger', 'Sổ cái Core Banking') },
  stp: { icon: '⚡', name: L('STP engine', 'Bộ máy STP') },
  ekyc: { icon: '🪪', name: L('eKYC service', 'Dịch vụ eKYC') },
  fds: { icon: '🛡️', name: L('FDS / fraud desk', 'FDS / Bộ phận chống gian lận') },
  aml: { icon: '🔎', name: L('AML analyst', 'Chuyên viên AML') },
  switch: { icon: '🔀', name: L('Card scheme / NAPAS switch', 'Tổ chức thẻ / NAPAS') },
  ops: { icon: '🌙', name: L('Night ops & reconciliation', 'Vận hành đêm & đối soát') },
  sbv: { icon: '🏦', name: L('State Bank of Vietnam', 'Ngân hàng Nhà nước') },
  collections: { icon: '📞', name: L('Collections & credit risk', 'Thu hồi nợ & Rủi ro tín dụng') },
} as const;
export type ActorId = keyof typeof ACTORS;

export type GlRef = { book: 'core'; account: AccountId; side: 'dr' | 'cr' } | { book: 'ops'; account: OpsAccountId; side: 'dr' | 'cr' } | { book: 'cit'; account: CitAccountId; side: 'dr' | 'cr' };

export interface SubProcessInfo {
  key: InfoKey;
  /** The process code on the drawer's header: `POS-01`, `CIT-01`. */
  code: string;
  flow: FlowId;
  icon: string;
  mode: StpMode;
  title: Localized<string>;
  overview: Localized<string>;
  actors: ReadonlyArray<{ id: ActorId; duty: Localized<string> }>;
  steps: readonly Localized<string>[];
  impact: readonly Localized<string>[];
  risks: readonly Localized<string>[];
  gl: readonly GlRef[];
  /** Regulatory-registry ids. */
  legal: readonly string[];
  kpi: { sla: Localized<string>; strPct: number | null; note: Localized<string> };
  related: readonly InfoKey[];
  /** The station the drawer's "show on map" focuses. */
  place: PlaceId;
}

export const dr = <B extends GlRef['book']>(book: B, account: Extract<GlRef, { book: B }>['account']): GlRef => ({ book, account, side: 'dr' }) as GlRef;
export const cr = <B extends GlRef['book']>(book: B, account: Extract<GlRef, { book: B }>['account']): GlRef => ({ book, account, side: 'cr' }) as GlRef;

/** A GL line's code, name and book, read from the chart that owns the account. */
export function glLine(ref: GlRef, locale: Locale): { code: string; name: string; book: GlRef['book'] } {
  if (ref.book === 'ops') {
    const a = opsAccount(ref.account);
    return { code: a.code, name: a.name[locale], book: ref.book };
  }
  if (ref.book === 'cit') {
    const a = citAccount(ref.account);
    return { code: a.code, name: a.name[locale], book: ref.book };
  }
  return { code: CHART_OF_ACCOUNTS[ref.account].code, name: accountName(ref.account, locale), book: ref.book };
}
