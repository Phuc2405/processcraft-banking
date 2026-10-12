/**
 * Everything the guided walkthrough says that is not about a particular payment: the opening scene of each process, the
 * headings, the button labels, the words of the quiz feedback. One `Localized` table, so a second language is one more
 * entry and not a change to any component.
 */

import { pick, type Localized } from '../i18n/locale';
import type { ProcessId } from '../sim/learning';

export interface Scene {
  /** The chapter heading on the opening card. */
  chapter: string;
  /** Two or three sentences that put the learner in the story before the token moves. */
  scene: string;
  /** What to watch for while the token travels. */
  lookFor: string[];
}

export interface WalkUi {
  tour: string;
  chapter: string;
  thisRun: string;
  lookFor: string;
  example: string;
  start: string;
  startHint: string;
  stepOf: (n: number, total: number) => string;
  whatHappens: string;
  forThisPayment: string;
  takeaway: string;
  canGoWrong: string;
  thinkOfItLike: string;
  previous: string;
  next: string;
  autoPlay: string;
  pause: string;
  resume: string;
  replay: string;
  exit: string;
  ruleLab: string;
  speedLocked: string;
  quizTitle: string;
  quizAsk: string;
  quizLocked: string;
  correct: string;
  notQuite: string;
  rightAnswer: string;
  tourDone: string;
  score: (right: number, total: number) => string;
  noQuestions: string;
}

interface WalkBook {
  scenes: Record<ProcessId, Scene>;
  ui: WalkUi;
}

const EN: WalkBook = {
  scenes: {
    A: {
      chapter: 'The virtual card: a number that is not the card',
      scene:
        'Customer An has just bought a shirt online. She did not type her real card number: she used a virtual card from her banking app, a stand-in number that works for a few minutes. The shop’s checkout now sends that number and its security code to the bank. In a few seconds the bank must decide whether this really is An.',
      lookFor: ['Where the real card hides.', 'Why the security code is checked before anyone looks at her money.', 'What a slow typist and a thief have in common.'],
    },
    B: {
      chapter: 'The gatekeeper: friction only where it pays',
      scene:
        'Customer An is buying a bag online with her everyday card. The checkout sends the payment with a risk score, a number from 0 (calm) to 100 (alarming). The bank has a split second to decide: wave her through, stop her and send a code to her phone, or turn her away at the door.',
      lookFor: ['Who is waved through without a single question.', 'What happens on the customer’s phone.', 'Who pays if a payment that passed this check turns out to be fraud.'],
    },
    C: {
      chapter: 'Pay in four: trust, with a plan B',
      scene:
        'Customer An wants a jacket but would rather pay for it in four parts. She applies for Buy Now Pay Later at checkout. The bank has to decide whether to trust her with a plan, and what to do with the sale if the answer is no.',
      lookFor: ['The two tests a plan must pass.', 'How a “no” can still keep the sale.', 'How a plan can be approved and still fail.'],
    },
    D: {
      chapter: 'The night run: do three sets of books agree?',
      scene:
        'It is 23:00. The shops are closed, and every payment approved today is waiting at the Approved box. Tonight the bank must prove that three independent sets of records agree about every one of them, and park the ones that do not.',
      lookFor: ['The three records, and who keeps each.', 'What counts as dust and what counts as a real break.', 'Why a mismatch is parked, never forced to match.'],
    },
    E: {
      chapter: 'The instant transfer: no card, no second chances',
      scene:
        'Mia is at dinner. She scans a QR code on the bill and taps send: $18.50 to a friend who banks somewhere else. There is no card and no night cycle to fix a mistake: the moment the bank says yes, the money is gone. So the bank reads the message her app sent, line by line, before it even looks at her balance.',
      lookFor: ['The fields the gateway insists on.', 'Why a flawed message never reaches the ledger.', 'What “instant” takes away from the bank.'],
    },
    F: {
      chapter: 'After the payment: who is it for, and who pays if it goes wrong?',
      scene:
        'This chapter has two stories. In the first, a long-standing customer sends $25,000.00 and the screening engine thinks his name looks like a sanctioned man’s. In the second, a cardholder says a purchase was not hers. Pick an example that starts with “AML:” or “Dispute:” to walk one or the other through the real diagram.',
      lookFor: ['The difference between a lead and a verdict.', 'Which evidence the analyst trusts.', 'Why the filing window is checked before the liability.'],
    },
  },
  ui: {
    tour: 'Learn & Explore',
    chapter: 'Chapter',
    thisRun: 'This run',
    lookFor: 'Look out for',
    example: 'Example payment',
    start: 'Start the tour',
    startHint: 'The token sets off. It stops at every desk to explain, and at every decision to ask you a question.',
    stepOf: (n, total) => `Step ${n} of ${total}`,
    whatHappens: 'What is happening here?',
    forThisPayment: 'For this payment',
    takeaway: 'Key takeaway',
    canGoWrong: 'What can go wrong',
    thinkOfItLike: 'Think of it like',
    previous: 'Previous step',
    next: 'Next step',
    autoPlay: 'Auto-play',
    pause: 'Pause',
    resume: 'Resume',
    replay: 'Replay',
    exit: 'Exit tutorial',
    ruleLab: 'Open rule lab',
    speedLocked: 'Speed locked to 0.25×',
    quizTitle: 'Quick check',
    quizAsk: 'Answer to let the token carry on.',
    quizLocked: 'Answer the question to move on.',
    correct: 'Correct!',
    notQuite: 'Not quite.',
    rightAnswer: 'The answer',
    tourDone: 'End of the tour',
    score: (right, total) => `Quick checks: ${right} of ${total} right`,
    noQuestions: 'No quick checks in this run',
  },
};

export const WALK_COPY: Localized<WalkBook> = { en: EN };

export const walkUi = (): WalkUi => pick(WALK_COPY).ui;
export const sceneOf = (process: ProcessId): Scene => pick(WALK_COPY).scenes[process];
