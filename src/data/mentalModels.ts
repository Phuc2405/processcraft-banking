/**
 * Four everyday pictures for the four ideas learners find hardest. Beginner mode shows them in the inspector, in the
 * Learning Hub and inside the guided walkthrough; nothing here changes how the simulation behaves.
 *
 * Each model is a small table: the real thing on one side, the picture on the other, and one line about where the
 * picture stops being true. The words sit in a `Localized` block so a second language only adds a block.
 */

import { pick, type Localized } from '../i18n/locale';
import type { ProcessId } from '../sim/learning';
import type { StationId } from '../sim/topology';

export type MentalModelId = 'ledger-hold' | 'tokenization' | 'three-ds' | 'eod-recon';

/** One row of "this part of the bank is that part of the picture". */
export interface ModelPart {
  /** The banking term. */
  real: string;
  /** What it is in the picture. */
  picture: string;
  /** One or two sentences tying the two together. */
  explain: string;
}

export interface MentalModelCopy {
  /** The picture, as a short heading. */
  title: string;
  /** The banking topic it explains, in the Fintech Expert vocabulary. */
  topic: string;
  /** The whole idea in one sentence. */
  hook: string;
  parts: ModelPart[];
  /** Where the picture stops helping: the thing that goes wrong in the real bank. */
  watchOut: string;
}

export interface MentalModel {
  id: MentalModelId;
  /** A single glyph for the card. */
  glyph: string;
  accent: string;
  /** The desks this picture is about. */
  stations: readonly StationId[];
  /** The Learning Hub processes it belongs to. */
  processes: readonly ProcessId[];
  copy: Localized<MentalModelCopy>;
}

export const MENTAL_MODELS: Record<MentalModelId, MentalModel> = {
  'ledger-hold': {
    id: 'ledger-hold',
    glyph: '👛',
    accent: '#34d399',
    stations: ['LEDGER_DEBIT', 'LEDGER_CREDIT'],
    processes: ['A', 'B', 'C'],
    copy: {
      en: {
        title: 'A wallet with a temporary-lock pocket',
        topic: 'Core Ledger & Hold Balance',
        hook: 'Swiping a card does not take money out of your wallet: it locks that money in a side pocket until the shop claims it.',
        parts: [
          {
            real: 'Available balance',
            picture: 'Free-to-spend money',
            explain: 'The open part of the wallet. It is the only part a new purchase is allowed to use.',
          },
          {
            real: 'Hold (authorisation)',
            picture: 'The locked pocket',
            explain: 'When you swipe, the bank locks that amount in a temporary pocket. You cannot spend it, yet it has not left the wallet.',
          },
          {
            real: 'Settlement',
            picture: 'Handing the cash over',
            explain: 'One to two days later the shop’s settlement order arrives and the locked money is really deducted.',
          },
        ],
        watchOut: 'A hold nobody claims expires and the money springs back, which is why a pending charge can simply vanish. Meanwhile it still shrinks what you can spend.',
      },
    },
  },
  tokenization: {
    id: 'tokenization',
    glyph: '🪪',
    accent: '#a3e635',
    stations: ['GATE_VIRTUAL', 'SEC_VAULT', 'SEC_DCVV'],
    processes: ['A'],
    copy: {
      en: {
        title: 'A one-time fake ID',
        topic: 'Tokenization & dCVV',
        hook: 'The shop only ever sees a stand-in ID and a ticket that stops working after a minute, never the real card.',
        parts: [
          {
            real: 'Real card number (FPAN)',
            picture: 'Your real identity',
            explain: 'It never leaves the bank. Only the vault knows it.',
          },
          {
            real: 'Virtual card number (DPAN)',
            picture: 'The fake ID',
            explain: 'A mask number that points to the real card. The vault turns it back into the real one, and nobody else can.',
          },
          {
            real: 'Dynamic CVV (dCVV)',
            picture: 'A 60-second ticket',
            explain: 'A security code that keeps changing. A sneaky photo of it is useless a minute later.',
          },
        ],
        watchOut: 'A longer ticket window is kinder to slow typists and friendlier to a thief replaying a copied code. The window is a trade-off, not a free gift.',
      },
    },
  },
  'three-ds': {
    id: 'three-ds',
    glyph: '🛂',
    accent: '#a78bfa',
    stations: ['GATE_ECOM', 'SEC_3DS'],
    processes: ['B'],
    copy: {
      en: {
        title: 'The gatekeeper who recognises regulars',
        topic: '3-D Secure 2.x',
        hook: 'A regular buying familiar things walks straight in; anything unusual is stopped at the door and asked to prove who they are.',
        parts: [
          {
            real: 'Frictionless flow',
            picture: 'Walking straight in',
            explain: 'Low risk: a regular, doing what they always do. The gatekeeper nods and nobody is interrupted.',
          },
          {
            real: 'Challenge (SMS OTP / biometric)',
            picture: 'Stopped and asked for ID',
            explain: 'Unusual risk, such as a strange place or a late hour. The customer must type a code sent to their phone, or use their fingerprint.',
          },
          {
            real: 'Reject',
            picture: 'Turned away',
            explain: 'Too risky even to ask. The payment is declined at the door.',
          },
        ],
        watchOut: 'A strict gatekeeper loses honest customers who give up at the door (cart abandonment). A relaxed one lets fraud walk in. The two dials pull against each other.',
      },
    },
  },
  'eod-recon': {
    id: 'eod-recon',
    glyph: '🧮',
    accent: '#fbbf24',
    stations: ['EOD_BATCH', 'EOD_VISA', 'RECON', 'SUSPENSE'],
    processes: ['D'],
    copy: {
      en: {
        title: 'Counting the till and the lost-property safe',
        topic: 'EOD Reconciliation & Suspense',
        hook: 'At closing time three people count the same till. If their totals differ, the odd money goes into a safe until someone finds out why.',
        parts: [
          {
            real: '3-way match (Merchant, Visa, Core bank)',
            picture: 'Three people counting the same till',
            explain: 'The shop’s report, Visa’s file and the bank’s own ledger must all show the same number.',
          },
          {
            real: 'Break',
            picture: 'A count that does not agree',
            explain: 'One total is different, or missing, or counted twice. Something went wrong and nobody knows what yet.',
          },
          {
            real: 'Suspense account',
            picture: 'The lost-property safe',
            explain: 'Money that does not match goes into a safe and stays there. The next morning a clerk investigates and clears it.',
          },
        ],
        watchOut: 'Never force a break to match. A growing safe means the night’s rules are too tight, or the day team is overloaded.',
      },
    },
  },
};

export const MENTAL_MODEL_IDS = Object.keys(MENTAL_MODELS) as MentalModelId[];

/** The words of one model, in the active language. */
export const modelCopy = (id: MentalModelId): MentalModelCopy => pick(MENTAL_MODELS[id].copy);

/** The picture that explains a desk, if there is one. */
export function modelForStation(station: StationId): MentalModel | null {
  return MENTAL_MODEL_IDS.map((id) => MENTAL_MODELS[id]).find((m) => m.stations.includes(station)) ?? null;
}

/** The pictures that belong to a Learning Hub process, in the order a payment meets them. */
export function modelsForProcess(process: ProcessId): MentalModel[] {
  return MENTAL_MODEL_IDS.map((id) => MENTAL_MODELS[id]).filter((m) => m.processes.includes(process));
}
