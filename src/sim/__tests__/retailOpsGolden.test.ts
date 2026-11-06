import { describe, expect, it } from 'vitest';
import { OPS_ACTIONS, openingBook, runOpsAction, type OpsBook } from '../retailOps';

/**
 * Content-strict baseline for every retail-ops posting strategy: the decision, the copy (both locales), the journal lines and the
 * book each action leaves, byte for byte, from the books that change what an action does (a locked counter, locked collateral, an
 * empty cassette) and along one run through every action in order. The snapshot was recorded before the switch became a strategy
 * table; any change to an outcome or its wording fails here.
 */

const AT = 'D1 09:00:00';
const BOOKS: Record<string, () => OpsBook> = {
  opening: openingBook,
  counterLocked: () => runOpsAction(openingBook(), 'teller-exceed-limit', AT).book,
  collateralLocked: () => runOpsAction(openingBook(), 'collateral-lock', AT).book,
  cassetteEmpty: () => ({ ...openingBook(), balances: { ...openingBook().balances, CASH_ATM: 0 } }),
};

describe('retail-ops posting strategies match the recorded baseline', () => {
  for (const [name, make] of Object.entries(BOOKS)) {
    it(`every action from the ${name} book`, async () => {
      const out = Object.fromEntries(OPS_ACTIONS.map((a) => [a.id, runOpsAction(make(), a.id, AT)]));
      await expect(JSON.stringify(out, null, 1)).toMatchFileSnapshot(`./__snapshots__/retailOpsGolden.${name}.json`);
    });
  }

  it('one run through every action in order', async () => {
    let book = openingBook();
    const steps = OPS_ACTIONS.map((a) => {
      const r = runOpsAction(book, a.id, AT);
      book = r.book;
      return r.outcome;
    });
    await expect(JSON.stringify({ steps, book }, null, 1)).toMatchFileSnapshot('./__snapshots__/retailOpsGolden.chain.json');
  });
});
