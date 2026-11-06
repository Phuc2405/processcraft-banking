/**
 * Regression suite: the Map Legend's Xuất quỹ / Nhập quỹ words, one vault name across the 2D map and the 3D signs, the same hover card
 * on the vault and the CIT bay in 2D and 3D, and the 3D cash wires dashed like the 2D ones.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { StationTooltip } from '../../../components/bank/StationTooltip';
import { LEGEND_CASH_TERMS, MapLegend } from '../../../components/bank/MapLegend';
import { CASH_DASH_3D, dashSegments, lineDistances } from '../../../components/bank/office/VaultCash3D';
import { signMessages } from '../../../components/bank/office/signs.messages';
import { citMessages } from '../../../components/ops/cit.messages';
import { setActiveLocale } from '../../../i18n/localeCore';
import { bankStore } from '../../../store/bankStore';
import { useWireHoverStore } from '../../../store/wireHoverStore';
import { message } from '../../../utils/i18nHelper';
import { CASH_STATIONS, cashStationTip, TIP_ACCOUNTS } from '../../cashStationTip';
import { hoverCardPlace } from '../../hoverCard';
import { citAt } from '../../citEngine';
import { DEPARTMENTS, STATIONS } from '../../topology';
import { stationTitle, TERM_MODES } from '../../terms';
import { src } from './harness';

afterEach(() => {
  setActiveLocale('en');
  bankStore.getState().setHoverPlace(null);
  useWireHoverStore.getState().set(null);
});

const legend = (): string => renderToStaticMarkup(createElement(MapLegend, { initiallyOpen: true }));

describe('the Map Legend defines Xuất quỹ and Nhập quỹ', () => {
  it('lists both cash words under the wire terminology, in Vietnamese', () => {
    setActiveLocale('vi');
    const out = legend();
    expect(out).toContain('Thuật ngữ trên đường nối');
    expect(out).toContain('Xuất quỹ ➔ [Trạm]');
    expect(out).toContain('Tiền mặt đi RA từ Kho Quỹ Trung Tâm đến trạm đích');
    expect(out).toContain('Nhập quỹ ⬅ [Trạm]');
    expect(out).toContain('Tiền mặt thu gom từ trạm đích đi VÀO lại Kho Quỹ Trung Tâm');
    // The words come before the other wire terms, right after the title.
    expect(out.indexOf('data-legend-term="cashOut"')).toBeLessThan(out.indexOf('data-legend-term="CTR"'));
  });

  it('lists them in English too, matching the wire labels themselves', () => {
    const out = legend();
    expect(out).toContain('Cash out ➔ [Station]');
    expect(out).toContain('Cash in ⬅ [Station]');
    expect(LEGEND_CASH_TERMS.map((t) => t.id)).toEqual(['cashOut', 'cashIn']);
    // The legend's arrows are the ones on the wires (cit.messages wire_*_OUT / wire_*_IN).
    setActiveLocale('vi');
    expect(message(citMessages, 'wire_ATM_OUT')).toMatch(/^Xuất quỹ ➔/);
    expect(message(citMessages, 'wire_ATM_IN')).toMatch(/^Nhập quỹ ⬅/);
  });
});

describe('the Main Cash Vault has one name on the 2D card and the 3D sign', () => {
  it('reads Main Cash Vault / Kho Quỹ Trung Tâm on the 2D card in every vocabulary', () => {
    expect(STATIONS.MAIN_CASH_VAULT.name).toBe('Main Cash Vault');
    expect(DEPARTMENTS.CASH.name).toBe('Main Cash Vault');
    for (const mode of TERM_MODES) {
      setActiveLocale('en');
      expect(stationTitle('MAIN_CASH_VAULT', mode)).toBe('Main Cash Vault');
      setActiveLocale('vi');
      expect(stationTitle('MAIN_CASH_VAULT', mode)).toBe('Kho Quỹ Trung Tâm');
    }
  });

  it('reads MAIN VAULT · 1111 / KHO QUỸ TRUNG TÂM · 1111 on the 3D sign, the 2D name in capitals', () => {
    expect(message(signMessages, 'mainVault')).toBe('MAIN VAULT · 1111');
    setActiveLocale('vi');
    expect(message(signMessages, 'mainVault')).toBe(`${stationTitle('MAIN_CASH_VAULT', 'expert').toUpperCase()} · 1111`);
  });

  it('no longer says "Central Cash Vault" anywhere on the map', () => {
    for (const f of ['sim/topology.ts', 'sim/terms.ts', 'sim/citRoute.ts', 'sim/guidedFlows.ts', 'components/bank/BankMap.tsx', 'components/bank/CitBay2D.tsx']) expect(src(f)).not.toContain('Central Cash Vault');
  });
});

describe('one hover card for the vault and the CIT bay, on both maps', () => {
  const cit = citAt(1, 9 * 60);

  it('models the vault with its three cash GLs and the bay with the vault and transit', () => {
    const vault = cashStationTip('MAIN_CASH_VAULT', cit);
    expect(vault.balances.map((b) => b.code)).toEqual(['1111', '1112', '1131']);
    expect(['outflow', 'inflow', 'vaultIdle']).toContain(vault.status);
    const bay = cashStationTip('LOADING_BAY', cit);
    expect(bay.balances.map((b) => b.account)).toEqual(TIP_ACCOUNTS.LOADING_BAY);
    expect(bay.status).toMatch(/^bayState_(AT_BAY|ON_ROAD|IDLE)$/);
    for (const b of [...vault.balances, ...bay.balances]) expect(b.cents).toBe(cit.book[b.account]);
  });

  it('renders the description, the state and the balances, in either language', () => {
    for (const id of CASH_STATIONS) {
      const en = renderToStaticMarkup(createElement(StationTooltip, { place: id }));
      expect(en).toContain(`data-place="${id}"`);
      for (const part of ['title', 'definition', 'status', 'balances']) expect(en).toContain(`data-tip="${part}"`);
      setActiveLocale('vi');
      const vi = renderToStaticMarkup(createElement(StationTooltip, { place: id }));
      expect(vi).toContain(id === 'MAIN_CASH_VAULT' ? 'Kho Quỹ Trung Tâm' : 'Sảnh Giao Nhận CIT');
      expect(vi).toContain('Số dư hôm nay');
      setActiveLocale('en');
    }
  });

  it('the 2D vault card and the 2D bay open that card on hover', () => {
    expect(src('components/bank/BankMap.tsx')).toMatch(/<MapCard place=\{id\} side=\{TIP_SIDE\[id\]\} \/>/);
    const bay = src('components/bank/CitBay2D.tsx');
    expect(bay).toMatch(/onMouseEnter=\{\(\) => setHover\(true\)\}/);
    expect(bay).toMatch(/hover && <StationTooltip place="LOADING_BAY"/);
  });

  it('the 3D door and bay hover handlers dispatch the station tooltip trigger', () => {
    // What the vault door's onPointerOver dispatches (VaultCash3D: setHoverPlace(VAULT_STATION)) opens the vault's card.
    expect(src('components/bank/office/VaultCash3D.tsx')).toMatch(/onPointerOver=[\s\S]*setHoverPlace\(VAULT_STATION\)/);
    bankStore.getState().setHoverPlace('MAIN_CASH_VAULT');
    expect(hoverCardPlace(bankStore.getState().hoverPlace, useWireHoverStore.getState().node)).toBe('MAIN_CASH_VAULT');
    bankStore.getState().setHoverPlace(null);
    // What the bay's floor pad and label dispatch (LoadingBay3D: the wire node 'BAY') opens the bay's card.
    expect(src('components/bank/office/LoadingBay3D.tsx')).toMatch(/useWireHoverStore\.getState\(\)\.set\(on \? 'BAY' : null\)/);
    useWireHoverStore.getState().set('BAY');
    expect(hoverCardPlace(bankStore.getState().hoverPlace, useWireHoverStore.getState().node)).toBe('LOADING_BAY');
    useWireHoverStore.getState().set(null);
    expect(hoverCardPlace(bankStore.getState().hoverPlace, null)).toBeNull();
    // Another desk under the pointer opens its own card, not the vault's or the bay's.
    expect(hoverCardPlace('TELLER_CASH', 'TELLER')).toBe('TELLER_CASH');
  });

  it('the 3D office shows that same card component from its one host', () => {
    expect(src('components/bank/office/StationTooltip3D.tsx')).toMatch(/<StationTooltip place=\{place\}/);
    expect(src('components/bank/office/OfficeScene.tsx')).toContain('<StationTooltip3D />');
  });
});

describe('the 3D cash wires are yellow dashed, like the 2D ones', () => {
  it('keeps the 2D 6 : 4 dash rhythm in metres', () => {
    expect(CASH_DASH_3D.dash / CASH_DASH_3D.gap).toBeCloseTo(6 / 4);
    const vault = src('components/bank/office/VaultCash3D.tsx');
    expect(vault).toContain('LineDashedMaterial');
    expect(vault).not.toContain('LineBasicMaterial');
    expect(vault).toMatch(/lit: dashed\('#facc15'/);
  });

  it('counts line distances along the arc for the dashes', () => {
    expect(lineDistances([0, 0, 0, 3, 4, 0, 3, 4, 2])).toEqual([0, 5, 7]);
  });

  it('cuts the lit tube into dashes and gaps', () => {
    const keep = dashSegments(1, 20);
    expect(keep).toHaveLength(20);
    // 0.3 m dash, 0.2 m gap at 0.05 m a segment: 6 on, 4 off, twice.
    expect(keep.map((k) => (k ? 1 : 0)).join('')).toBe('11111100001111110000');
  });
});
