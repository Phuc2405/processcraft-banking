/**
 * Everything the Build Lab guided tour says that is not about one particular payment: the opening scene of every level,
 * what each kind of desk does, the headings, the button labels. One `Localized` table, so a second language is one more
 * entry and not a change to any component or to the code that builds a tour.
 *
 * The scenes of levels 1 to 4 are the same stories the Living Bank tells (see walkthroughCopy.ts), so they are not
 * written twice.
 */

import { pick, type Localized } from '../i18n/locale';
import type { BankingCapability, Id, Outcome } from '../types/processLearning';
import { sceneOf, walkUi, type Scene, type WalkUi } from './walkthroughCopy';

export type { Scene };

/** What a desk or event says about itself when the token stops there. */
export interface StepText {
  title: string;
  /** What is happening here, in a few plain sentences. */
  what: string;
  /** The one thing to take away. */
  why: string;
  /** What can go wrong at this box. */
  fails: string[];
}

export interface LabUi extends WalkUi {
  /** The name of the tour, in the header of the opening card and the bar. */
  labTour: string;
  /** Where the diagram on screen comes from. */
  exampleSource: string;
  mineSource: string;
  /** On the opening card, when the learner's own diagram can be walked. */
  mineBlurb: string;
  /** Under the launcher, while the learner has placed nothing. */
  mineEmpty: string;
  /** Warning on the opening card of a worked example. */
  spoiler: string;
  /** Buttons that open the tour from the level brief. */
  launchTitle: string;
  launchBlurb: string;
  launchExample: string;
  launchMine: string;
  /** Shown when the learner's own diagram cannot be walked. */
  mineProblem: (why: string) => string;
  testLabel: string;
  levelOf: (label: string, title: string) => string;
  verdictTitle: string;
  /** The panel that lists the lines a payment posted to the ledger. */
  ledgerTitle: string;
  /** What kind of box a step is, shown beside its number. */
  kinds: Record<'start' | 'task' | 'gateway' | 'end', string>;
  /** Heading above the reason a diagram could not be walked to the end. */
  stuckTitle: string;
  /** Button on the closing card. */
  replayTour: string;
  /** Short name of the payment being followed, in the bar. */
  following: string;
  /** Headings above the XML message on the start and gateway cards of a bank-to-bank payment. */
  messageArrives: string;
  messageStamped: string;
  /** On the closing card: does the end the payment reached match what the test expects? */
  matchesTest: string;
  missesTest: string;
  /** Shown while the token is still travelling to the next box. */
  onItsWay: (title: string) => string;
  /** The stage and step of the level, shown on the opening card. */
  stageOf: (stage: number, title: string) => string;
}

export interface FactLabels {
  [fact: string]: string;
}

interface LabBook {
  ui: LabUi;
  scenes: Record<Id, Scene>;
  /** Fact name to the label shown on a step ("ledgerDecision" becomes "Ledger"). */
  facts: FactLabels;
  capabilities: Record<BankingCapability, StepText>;
  start: StepText;
  startA2a: StepText;
  gateway: StepText;
  end: StepText;
  /** One line of takeaway per outcome, shown on the End event. */
  outcomes: Record<Outcome, string>;
}

const EN: LabBook = {
  ui: {
    ...walkUi(),
    labTour: 'Guided tour',
    exampleSource: 'Worked example: a model answer',
    mineSource: 'Your diagram',
    mineBlurb: 'The tour follows your own diagram, run exactly as the grader would run it.',
    mineEmpty: 'Place a desk on the canvas first, or tour the worked example.',
    spoiler: 'This tour follows a complete model answer to the level. If you would rather solve it yourself first, leave now and come back when you have tried.',
    launchTitle: 'Guided tour',
    launchBlurb: 'Follow one payment through the process, desk by desk, with a question at every decision.',
    launchExample: 'Tour the worked example',
    launchMine: 'Walk through my diagram',
    mineProblem: (why) => `Your diagram cannot be walked yet: ${why}`,
    testLabel: 'Payment',
    levelOf: (label, title) => `Level ${label}: ${title}`,
    verdictTitle: 'How it ended',
    ledgerTitle: 'What the books recorded',
    kinds: { start: 'Start event', task: 'Desk', gateway: 'Decision', end: 'End event' },
    stuckTitle: 'Where it got stuck',
    replayTour: 'Replay the tour',
    following: 'Following',
    messageArrives: 'The message as it arrives (pacs.008)',
    messageStamped: 'The same message, stamped with the rail',
    matchesTest: 'This is the end the test expects.',
    missesTest: 'This is not the end the test expects.',
    onItsWay: (title) => `On its way to “${title}”…`,
    stageOf: (stage, title) => `Stage ${stage}: ${title}`,
    start: 'Start the tour',
    startHint: 'The token sets off. It stops at every desk to explain, and at every decision to ask you a question.',
  },

  scenes: {
    lvl_05_first_swipes: {
      chapter: 'The first swipe: is the money there?',
      scene:
        'Customer An taps her card on a till. The jacket costs $500.00. In a second the bank must answer one question: can An pay for it? If yes, the bank puts a hold on the money and the till says approved. If not, the till must say so clearly, and the bank must not keep a hold on money that was never spent.',
      lookFor: ['The one fact the ledger check writes for the next decision.', 'Why a decision needs a default wire, even when you can name every case.', 'What a reason code does for a customer standing at the till.'],
    },
    lvl_06_card_testing: {
      chapter: 'Midnight: bots, and a customer who just wants to renew',
      scene:
        'It is 00:12. A bot has a list of stolen card numbers and is trying each one for $1.00, over and over, to find which still work. In the same minute An is renewing a $12.00 subscription. Both arrive at the same gate. The bank must stop the bot without making An fill in a one-time code, because every extra step sends a share of honest customers away.',
      lookFor: ['The two signs that mark a burst of card-testing.', 'Why the bot is stopped before the expensive checks.', 'Which payments are small enough to skip the code.'],
    },
    lvl_07_a2a_iso20022: {
      chapter: 'The lifeblood network: moving money between banks',
      scene:
        'Not every payment is a card. Here a company pays its suppliers and its staff straight from account to account. The instruction reaches the bank as a pacs.008 message, a standard envelope with the sender’s bank, the receiver’s bank, the amount and a reference that travels with the payment. The gateway reads it, checks it, and picks a rail: instant, or RTGS for big amounts.',
      lookFor: ['The four fields every message must carry.', 'Where the line between instant and RTGS falls.', 'Why payroll jumps the queue and the reserve.'],
    },
    lvl_08_fx_breaks: {
      chapter: 'The 23:59 night run: fifteen breaks and a currency',
      scene:
        'It is a minute to midnight and fifteen foreign-currency purchases will not reconcile. Each was booked in dollars at one exchange rate and settled by the card scheme at another. The gap is real money, but it is not a mistake: it is the exchange rate. The bank must park each gap in the right FX suspense account and tell a gain from a loss.',
      lookFor: ['What makes a gap an FX difference rather than an error.', 'Which way is a gain and which way is a loss.', 'The breaks that look like FX and are not.'],
    },
    lvl_09_sanctions_storm: {
      chapter: 'Sanctions storm: the VIP who is not on the list',
      scene:
        'A VIP client of fifteen years sends a large payment. The anti-money-laundering screen lights up: his name is a close match to someone on a sanctions list. If the bank freezes him, it loses its best customer. If it waves him through and he is the man on the list, it breaks the law. The way out is the audit log: a verified date of birth and nationality settle it.',
      lookFor: ['Why a screening hit is a lead, not a verdict.', 'Which facts the investigator trusts and which it ignores.', 'What the bank does when the evidence is not enough.'],
    },
    lvl_10_chargeback_warfare: {
      chapter: 'Chargeback warfare: who pays when a customer disputes?',
      scene:
        'An says the goods never arrived and asks her bank for her money back. That starts a dispute: the bank asks the shop for the receipt, takes the money back, the shop answers, and if neither side gives in the card scheme steps in. But before any of that, two questions decide who can win at all: is the claim still in time, and did the purchase pass the 3-D Secure check?',
      lookFor: ['The four stages of a dispute, in order.', 'Why a 3-D Secure purchase can move the loss onto the bank.', 'The one thing that makes a claim dead on arrival.'],
    },
  },

  facts: {
    tokenStatus: 'Token',
    fundingSource: 'Funded by',
    fpanLast4: 'Real card ends',
    dcvvStatus: 'dCVV',
    threeDsPath: '3DS path',
    authenticated: 'Authenticated',
    liabilityShift: 'Fraud liability',
    ledgerDecision: 'Ledger',
    authHoldMinor: 'Hold placed',
    reconStatus: 'Reconciliation',
    reconVarianceMinor: 'Largest gap',
    reconCause: 'Cause of the gap',
    fxDirection: 'FX difference',
    underwritingScore: 'Score',
    downPaymentPct: 'Down payment',
    bnplDecision: 'Underwriting',
    installment1Minor: 'First instalment',
    installmentAmountMinor: 'Then 3 of',
    a2aValid: 'Message valid',
    a2aRail: 'Rail',
    a2aPriority: 'Priority',
    a2aQueue: 'Queue',
    a2aLiquidity: 'Liquidity',
    amlStatus: 'Screening result',
    amlMatchScore: 'Best name match',
    amlList: 'List',
    amlStructuring: 'Structuring',
    caseVerdict: 'Verdict',
    caseEvidenceCount: 'Evidence items',
    disputeWindow: 'Filing window',
    disputeLiability: 'Liability',
    disputeNext: 'Next stage',
  },

  capabilities: {
    TOKEN_VAULT: {
      title: 'Token Vault: the real card behind the fake number',
      what: 'A virtual card number is a stand-in. The vault looks it up and finds the real card behind it, so the shop never sees the real number and the bank still knows whose money this is.',
      why: 'A number the vault has never issued is not a card at all: stop here, before any money is looked at.',
      fails: ['The number was never issued, so the vault raises an error. If nothing catches that error the payment is stuck.', 'The virtual card was suspended by its owner, and the payment should not go on.'],
    },
    DCVV_VERIFIER: {
      title: 'dCVV Verifier: a security code that expires',
      what: 'A dynamic CVV is a three-digit code that changes every minute. The desk compares the code typed with the one the vault expects, and checks that it is still fresh.',
      why: 'An old code and a wrong code are both a decline: a thief with last hour’s code gets nothing.',
      fails: ['A slow typist is declined at the edge of the window.', 'A window that is too long gives a thief time to use a stolen code.'],
    },
    THREE_DS_EVALUATOR: {
      title: '3-D Secure: friction only where it pays',
      what: 'The bank scores how risky the payment looks. A low score goes straight through, a middle score gets a one-time code on the customer’s phone, and a high score is turned away.',
      why: 'A payment that passes 3-D Secure shifts the fraud liability to the bank that approved it, so this check decides who pays if it turns out to be fraud.',
      fails: ['Challenge too many customers and honest ones abandon their baskets.', 'Challenge too few and fraud walks through.'],
    },
    CORE_LEDGER_CHECK: {
      title: 'Core Ledger Check: is the money there?',
      what: 'The core ledger is the bank’s official record of every balance. The desk compares the amount with what the customer can spend. If it is enough, it puts a hold on the money.',
      why: 'The check only writes a fact: sufficient or not. The decision to approve or decline is made by the next gateway.',
      fails: ['Checking the wrong amount: on a Pay-in-4 plan only the first instalment is due today.', 'Running it for a payment that will be declined for another reason wastes a call to the core system.'],
    },
    RECON_DESK: {
      title: 'Reconciliation Desk: do three sets of books agree?',
      what: 'The bank’s ledger, the card scheme’s clearing file and the shop’s bank each hold their own record of the payment. The desk lines the three up and allows a small tolerance for rounding.',
      why: 'A gap is never forced to match. It is parked in a suspense account until someone finds the cause.',
      fails: ['A tolerance too wide matches a real mistake away.', 'A tolerance too tight parks rounding dust and buries the team in false breaks.'],
    },
    BNPL_UNDERWRITER: {
      title: 'Underwriter: trust, with a plan B',
      what: 'Buy Now Pay Later lets the customer pay in four parts. The underwriter checks the customer’s score and down payment against the bank’s minimums before offering a plan.',
      why: 'A “no” does not have to lose the sale: the customer can still pay the full price by card.',
      fails: ['Approve too freely and instalments go unpaid.', 'Decline with no fallback and the sale is lost.'],
    },
    A2A_GATEWAY: {
      title: 'A2A Payment Gateway: read the message, pick the rail',
      what: 'The gateway reads the pacs.008 message and checks its format: the payment reference, both banks’ BICs and the settlement amount. It then picks the rail, looks at the queue, and checks that there is enough cash to send the payment.',
      why: 'A payment is only as good as its message. A bad message is rejected here, before it can reach the other bank.',
      fails: ['The instant-rail limit is set too high and a large payment goes down a rail that cannot carry it.', 'Payroll is held in the same queue as everything else and arrives late.'],
    },
    AML_SCREENING: {
      title: 'AML Screening: names, lists and patterns',
      what: 'The desk compares the customer’s name with sanctions and politically-exposed-person lists, allowing for spelling differences, and looks through recent cash deposits for a pattern of structuring.',
      why: 'A name hit is a lead, not a verdict. Someone has to look before the bank freezes a customer or lets one go.',
      fails: ['A threshold too low floods the team with false positives.', 'A threshold too high lets a real match slip through.'],
    },
    CASE_INVESTIGATION: {
      title: 'Case Investigation: what the audit log proves',
      what: 'The investigator opens the audit log and compares the verified date of birth and nationality with the person on the list. Unverified entries are ignored.',
      why: 'The evidence has three possible answers: not him, him, or not enough to say. The last one must not be rounded up to the first.',
      fails: ['Trusting an unverified entry clears a customer on a claim anyone could have typed.', 'Sending every customer here keeps honest ones waiting for nothing.'],
    },
    CHARGEBACK_DESK: {
      title: 'Disputes Desk: where is the case, and who pays?',
      what: 'The desk works out the stage of the dispute from the merchant’s evidence, whether the claim is still in time, and who carries the loss. A fraud claim on a purchase that passed 3-D Secure is the issuer’s loss.',
      why: 'Two things end a claim before it starts: it is too old, or the liability sits with the bank.',
      fails: ['Counting the days by hand instead of asking the desk.', 'Charging back a purchase the scheme says the bank must absorb.'],
    },
  },

  start: {
    title: 'The payment arrives',
    what: 'Every payment starts here. The token that will travel through the diagram carries the facts about this payment: the amount, the card, and anything else the bank already knows.',
    why: 'Facts that arrive with the payment can be read by any decision. Facts a desk writes can only be read after that desk has run.',
    fails: ['Nothing is wired to the start event, so the payment goes nowhere.'],
  },
  startA2a: {
    title: 'A pacs.008 message arrives',
    what: 'An account-to-account instruction reaches the bank as an ISO 20022 pacs.008 message. It names the sender’s bank, the receiver’s bank, the amount, and a reference that stays with the payment until it is delivered.',
    why: 'Because every bank reads the same message the same way, payments can cross from one bank to another without anyone retyping them.',
    fails: ['A field is missing or malformed, and the gateway has to reject the whole message.'],
  },
  gateway: {
    title: 'Decision: which wire does this payment take?',
    what: 'A decision gateway reads facts the earlier desks wrote and sends the payment down exactly one wire. It tries the wires in order and takes the first whose rule is true. If none is, it takes the default.',
    why: 'Order matters, and so does the default: without a default wire a payment nobody planned for has nowhere to go.',
    fails: ['Two rules are both true and the wrong one is listed first.', 'The rule reads a fact no desk has written yet, so it can never be true.'],
  },
  end: {
    title: 'The payment ends',
    what: 'An End event is where the journey stops and the bank reports the outcome. The outcome and its reason code decide what the customer is told and what the books record.',
    why: 'Every payment must end somewhere, with an outcome that someone can act on.',
    fails: ['A decline with no reason code leaves the customer guessing.'],
  },

  outcomes: {
    APPROVED: 'Approved: the money moves, and the books record it.',
    DECLINED: 'Declined: the customer is told no. Nothing should be left holding their money.',
    ROUTED_TO_SUSPENSE: 'Parked: the payment is held until a person or a later process decides.',
    CHALLENGE_REQUIRED: 'More information is needed before the bank can decide.',
  },
};

export const LAB_COPY: Localized<LabBook> = { en: EN };

const book = (): LabBook => pick(LAB_COPY);

export const labUi = (): LabUi => book().ui;

/** Levels 1 to 4 tell the same stories as the Living Bank's four lessons. */
const SHARED_SCENE: Readonly<Record<Id, 'A' | 'B' | 'C' | 'D'>> = {
  lvl_01_virtual_card_dcvv: 'A',
  lvl_02_three_ds_routing: 'B',
  lvl_03_eod_recon_suspense: 'D',
  lvl_04_bnpl_pay_in_4: 'C',
};

export function labScene(levelId: Id): Scene {
  const shared = SHARED_SCENE[levelId];
  if (shared) return sceneOf(shared);
  const own = book().scenes[levelId];
  if (!own) throw new Error(`The guided tour has no opening scene for ${levelId}`);
  return own;
}

export const factLabel = (fact: string): string => book().facts[fact] ?? fact.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

export const capabilityText = (c: BankingCapability): StepText => book().capabilities[c];
export const startText = (a2a: boolean): StepText => (a2a ? book().startA2a : book().start);
export const gatewayText = (): StepText => book().gateway;
export const endText = (): StepText => book().end;
export const outcomeText = (o: Outcome): string => book().outcomes[o];
