import { useMemo } from 'react';
import { citCashFlows, mergeFlows, type VaultCashFlow } from '../../sim/vaultFlows';
import { useVaultFlowStore } from '../../store/vaultFlowStore';
import { useCit } from '../ops/CitPanel';

/** The cash crossing the Main Cash Vault's door right now (CIT runs and the retail book's echoes), for both maps and the inspector. */
export function useVaultFlows(): VaultCashFlow[] {
  const cit = useCit();
  const retail = useVaultFlowStore((s) => s.retail);
  return useMemo(() => mergeFlows(citCashFlows(cit), retail), [cit, retail]);
}
