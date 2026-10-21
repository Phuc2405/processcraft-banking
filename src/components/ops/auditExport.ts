import { auditCsv, auditFileName, buildAudit, type AuditReport } from '../../sim/audit';
import type { BankSimulation } from '../../sim/bankSimulation';
import { downloadText } from '../../utils/download';

/** The audit of the day the bank is on: final once the day is over, "so far" while it is still running. */
export function auditOf(sim: BankSimulation): AuditReport {
  return buildAudit(sim.report(), sim.transactionLog(), sim.ledgerEntries, sim.chaosView(), sim.snapshot().disputed);
}

/** Builds the audit and saves it as a CSV file. Run only on the learner's click. */
export function exportAudit(sim: BankSimulation): void {
  const audit = auditOf(sim);
  downloadText(auditCsv(audit), auditFileName(audit.summary.day));
}
