/** The Message & Ledger Inspector's examples. */

import type { FlowId } from '../types/viewport';
import { BankSimulation } from './bankSimulation';
import { WORK_START } from './clock';
import { journalLines, journalText, rawMessage, responseCodeFor, type JournalLine } from './isoMessages';
import { PRIMARY_PRESET, presetCustomer, presetById, type PresetId } from './presets';
import type { AcademyLevel } from './academyCatalog';

export interface InspectorSample {
  preset: PresetId;
  /** Plain label for what the sample is, e.g. "Swipe $20 (Approved 00)". */
  label: string;
  /** The payment as ISO 8583 (a pacs.008 header for a transfer). */
  message: Readonly<Record<string, unknown>>;
  /** The ledger lines the payment posted, each balanced debit against credit. */
  journal: readonly JournalLine[];
  journalText: readonly string[];
  /** Response code shown by the sample, e.g. "00". */
  responseCode: string;
}

const cache = new Map<PresetId, InspectorSample | null>();

/** Plays one preset payment to its end and records its message and postings. Null for a preset that is not a payment. */
export function sampleFor(preset: PresetId): InspectorSample | null {
  if (cache.has(preset)) return cache.get(preset) ?? null;
  let sample: InspectorSample | null = null;
  const sim = new BankSimulation({ seed: 2026, headless: true });
  sim.stepUntil(WORK_START + 30);
  const customer = presetCustomer(preset, sim.rules);
  const txId = customer ? sim.inject(customer) : null;
  if (txId) {
    for (let i = 0; i < 60 && !sim.traceOf(txId)?.done; i++) sim.step();
    const trace = sim.traceOf(txId);
    if (trace?.done) {
      const journal = journalLines(trace);
      sample = {
        preset,
        label: presetById(preset)?.label ?? preset,
        message: rawMessage(trace),
        journal,
        journalText: journal.map(journalText),
        responseCode: responseCodeFor(trace).code,
      };
    }
  }
  cache.set(preset, sample);
  return sample;
}

/** The sample a level shows. */
export function sampleForLevel(level: Pick<AcademyLevel, 'flow'>): InspectorSample | null {
  if (level.flow === null) return null;
  return sampleFor(level.flow === 4 ? PRIMARY_PRESET[1] : PRIMARY_PRESET[level.flow as FlowId]);
}
