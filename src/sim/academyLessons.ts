/** The body of every Academy lesson, in four sections. */

export interface FlowStepLine {
  /** Who acts: the customer, the terminal and switch, the core banking engine, and so on. */
  actor: string;
  action: string;
}

export interface EdgeCase {
  /** An ISO 8583 response code ("51", "N7"), or null for a failure that has no code of its own. */
  code: string | null;
  title: string;
  detail: string;
}

export interface LessonContent {
  realWorldScenario: string;
  stepByStepFlow: readonly FlowStepLine[];
  whyItMatters: string;
  edgeCasesAndErrors: readonly EdgeCase[];
}

const CUSTOMER = 'Customer Action';
const TERMINAL = 'Terminal & Switch';
const CORE = 'Core Banking Engine';
const SCHEME = 'Card Scheme';
const RISK = 'Fraud & Risk';
const VAULT = 'Token Vault';
const LEDGER = 'General Ledger';
const OPS = 'Operations';
const MERCHANT = 'Merchant';
const RAIL = 'Payments Gateway';
const CDM = 'Cash Deposit Machine';
const CREDIT = 'Credit & Underwriting';

const TIMEOUT: EdgeCase = { code: '68', title: 'Network timeout', detail: 'The answer did not come back in time. The terminal asks again or reverses, so the customer is never charged twice.' };
const FROZEN: EdgeCase = { code: '62', title: 'Frozen card', detail: 'The customer froze the card in their app. The bank declines before it even looks at the balance.' };
const NSF: EdgeCase = { code: '51', title: 'Insufficient funds', detail: 'The available balance (balance minus existing holds) is below the amount.' };

export const LESSON_CONTENT: Readonly<Record<string, LessonContent>> = {
  // ── Chapter 1 · First Swipes ───────────────────────────────────────────────
  '1.1': {
    realWorldScenario: 'Buying a $5 flat white at a Brisbane café by tapping a contactless Visa Debit card on the counter terminal.',
    stepByStepFlow: [
      { actor: CUSTOMER, action: 'Taps the phone or card on the POS terminal.' },
      { actor: TERMINAL, action: 'The terminal reads the card chip, builds an ISO 8583 Authorisation Request (0100) and sends it to the acquirer.' },
      { actor: SCHEME, action: 'The acquirer passes the 0100 through the Visa network to the bank that issued the card.' },
      { actor: CORE, action: 'The issuing bank receives the request. No money has moved yet: the café is only asking.' },
    ],
    whyItMatters: 'Separating the question ("can this card pay $5?") from the money movement lets millions of taps get a yes or no in under a second, while the slower work of moving money waits for the night.',
    edgeCasesAndErrors: [
      { code: null, title: 'Card read failure', detail: 'A bent card or a weak tap means the terminal never sends a request. The customer just taps again.' },
      { code: '14', title: 'Invalid card number', detail: 'The number does not belong to any card the bank issued.' },
      TIMEOUT,
    ],
  },
  '1.2': {
    realWorldScenario: 'The café’s $5 request reaches the bank. The customer has $50 in their everyday account.',
    stepByStepFlow: [
      { actor: CORE, action: 'Checks the card is active and not frozen, then verifies the PIN or the contactless cryptogram.' },
      { actor: CORE, action: 'Works out the available balance: the account balance minus any holds already placed.' },
      { actor: CORE, action: 'Places an Authorisation Hold of $5 on the CASA account so the money cannot be spent twice.' },
      { actor: LEDGER, action: 'Posts the hold: DR 1110 / CR 2110. The customer’s balance still says $50; their available balance says $45.' },
    ],
    whyItMatters: 'Holding funds guarantees the merchant gets paid without requiring instant settlement, which saves network bandwidth and keeps the switch fast during peak hours.',
    edgeCasesAndErrors: [NSF, FROZEN, { code: '75', title: 'Too many PIN tries', detail: 'Three wrong PINs lock the card until the customer resets it.' }],
  },
  '1.3': {
    realWorldScenario: 'There is enough money, so the terminal beeps green and the barista hands over the coffee.',
    stepByStepFlow: [
      { actor: CORE, action: 'Builds the Authorisation Response (0110) with response code 00 (Approved) and an approval code.' },
      { actor: SCHEME, action: 'The response travels back through Visa and the acquirer to the café’s terminal.' },
      { actor: TERMINAL, action: 'Shows Approved and prints the receipt. The café adds the sale to today’s batch.' },
    ],
    whyItMatters: 'The approval is a promise, not a payment. The café can safely hand over the goods because the bank has already set the money aside.',
    edgeCasesAndErrors: [
      { code: '68', title: 'Approval lost on the way back', detail: 'The bank approved but the terminal never heard. The terminal sends a reversal (0400) so the hold is released.' },
      { code: null, title: 'Duplicate tap', detail: 'The same card tapped twice in seconds is caught by the duplicate check, so only one hold is placed.' },
    ],
  },
  '1.4': {
    realWorldScenario: 'The same customer tries a $60 lunch but only $45 is available after the coffee hold.',
    stepByStepFlow: [
      { actor: CORE, action: 'Finds the available balance ($45) is below the amount ($60).' },
      { actor: CORE, action: 'Returns an 0110 with RC 51 (Insufficient Funds). No hold is placed and nothing posts to the ledger.' },
      { actor: TERMINAL, action: 'Shows Declined. The customer can try another card or a smaller amount.' },
    ],
    whyItMatters: 'Declining cleanly protects both sides: the customer does not fall into an unplanned overdraft, and the bank does not lend money it never agreed to lend.',
    edgeCasesAndErrors: [NSF, FROZEN, { code: '61', title: 'Daily limit reached', detail: 'The money is there, but the card’s daily spending limit is used up.' }],
  },

  // ── Chapter 2 · Virtual Card & 3DS Routing ───────────────────────────────────
  '2.1': {
    realWorldScenario: 'Ordering $89 of sneakers online with a virtual card saved in a shopping app.',
    stepByStepFlow: [
      { actor: CUSTOMER, action: 'Presses Pay on the checkout page. There is no physical card and no PIN.' },
      { actor: MERCHANT, action: 'The online store sends the card token, the dynamic CVV and device data to its payment gateway.' },
      { actor: TERMINAL, action: 'The gateway turns this into an 0100 marked as card-not-present (e-commerce) and sends it to the bank.' },
    ],
    whyItMatters: 'Card-not-present payments carry most of the fraud, because whoever holds the numbers can try them. Marking the channel lets the bank apply stronger checks only where they are needed.',
    edgeCasesAndErrors: [
      { code: null, title: 'Abandoned checkout', detail: 'The customer closes the tab before the request is sent. Nothing reaches the bank.' },
      TIMEOUT,
    ],
  },
  '2.2': {
    realWorldScenario: 'The sneaker store never sees the real card number, only a stand-in token.',
    stepByStepFlow: [
      { actor: VAULT, action: 'Looks up the token (DPAN) and swaps it for the real card number (FPAN).' },
      { actor: VAULT, action: 'Checks the dynamic CVV, which changes every few minutes, against the expected value.' },
      { actor: CORE, action: 'Carries on with the real card number, exactly as for a card in hand.' },
    ],
    whyItMatters: 'If the store is hacked, the thieves only get tokens that work nowhere else. The bank keeps the one place where real numbers live small and heavily guarded.',
    edgeCasesAndErrors: [
      { code: '14', title: 'Unknown token', detail: 'The token does not map to any card in the vault.' },
      { code: 'N7', title: 'Dynamic CVV expired or wrong', detail: 'The code was copied from an old screenshot or typed wrongly.' },
    ],
  },
  '2.3': {
    realWorldScenario: 'The $89 order comes from a new phone in another state at 2 am, so the bank looks harder.',
    stepByStepFlow: [
      { actor: RISK, action: 'Scores the payment from the device, location, amount and the customer’s history.' },
      { actor: RISK, action: 'Low risk: passes straight through (frictionless 3DS).' },
      { actor: RISK, action: 'Medium risk: asks the customer to prove it is them (3DS challenge).' },
      { actor: RISK, action: 'High risk: rejects without asking.' },
    ],
    whyItMatters: 'Asking everyone for proof would lose sales; asking no one would invite fraud. Routing by risk keeps most checkouts smooth and puts friction only where the danger is.',
    edgeCasesAndErrors: [
      { code: '59', title: 'Suspected fraud', detail: 'The score is high enough to reject outright.' },
      { code: null, title: 'False positive', detail: 'A genuine customer travelling overseas is challenged or blocked. Good rules keep this rare.' },
    ],
  },
  '2.4': {
    realWorldScenario: 'The customer gets a 6-digit SMS code and types it into the checkout pop-up.',
    stepByStepFlow: [
      { actor: RISK, action: 'Sends a one-time password (OTP) to the phone number on file.' },
      { actor: CUSTOMER, action: 'Types the code into the 3DS screen within the time limit.' },
      { actor: CORE, action: 'Code correct: the payment is authorised and a hold is placed, as in chapter 1.' },
    ],
    whyItMatters: 'A completed challenge proves the cardholder was there, so if the payment later turns out to be fraud the liability moves away from the merchant. Merchants accept a little friction in exchange for that protection.',
    edgeCasesAndErrors: [
      { code: '05', title: 'Challenge not completed', detail: 'The customer closed the pop-up or the code expired. The bank answers Do Not Honour.' },
      { code: null, title: 'SIM swap', detail: 'A fraudster who has taken over the phone number receives the code. Banks add device checks for this reason.' },
    ],
  },

  // ── Chapter 3 · Card-Testing & Fraud Detection ───────────────────────────────
  '3.1': {
    realWorldScenario: 'A bot tries 40 payments of $1 in two minutes on a charity donation page, each with a different stolen card.',
    stepByStepFlow: [
      { actor: MERCHANT, action: 'The donation page receives a burst of tiny payments from the same device.' },
      { actor: RISK, action: 'A velocity rule counts attempts per card, per device and per merchant inside a short window.' },
      { actor: RISK, action: 'Once the count crosses the limit, the pattern is flagged as card-testing.' },
    ],
    whyItMatters: 'Card-testers use tiny payments to find which stolen cards still work, then spend big elsewhere. Stopping the probe stops the bigger fraud that follows.',
    edgeCasesAndErrors: [
      { code: '59', title: 'Velocity breach', detail: 'Too many attempts in the window; later attempts are rejected as suspected fraud.' },
      { code: null, title: 'Alert fatigue', detail: 'Too many alerts and analysts start approving without looking. Rules must be tuned, not just added.' },
    ],
  },
  '3.2': {
    realWorldScenario: 'One of the $1 donations comes from a known device; another from a fresh emulator with no history.',
    stepByStepFlow: [
      { actor: RISK, action: 'Gives each attempt a risk score from device, speed, amount and past behaviour.' },
      { actor: RISK, action: 'Compares the score against the pass, challenge and reject thresholds.' },
      { actor: CORE, action: 'Acts on the decision: authorise, send a 3DS challenge, or decline.' },
    ],
    whyItMatters: 'A single score lets one policy cover thousands of signals. The bank tunes the thresholds to balance fraud losses against lost genuine sales.',
    edgeCasesAndErrors: [
      { code: '59', title: 'Score above reject threshold', detail: 'Declined as suspected fraud.' },
      { code: '05', title: 'Challenge failed', detail: 'The attempt was challenged and the bot could not answer.' },
    ],
  },
  '3.3': {
    realWorldScenario: 'The bot’s next attempt is turned away and the stolen card is flagged before it can be used for a $900 laptop.',
    stepByStepFlow: [
      { actor: CORE, action: 'Returns a decline to the merchant. No hold is placed on the account.' },
      { actor: RISK, action: 'Records the device and card in the pattern store so the next rule fires sooner.' },
      { actor: OPS, action: 'The real cardholder is contacted and the card is replaced if it is confirmed stolen.' },
    ],
    whyItMatters: 'Each blocked attempt teaches the system. Feeding the pattern back is what turns a single catch into lasting protection.',
    edgeCasesAndErrors: [
      FROZEN,
      { code: null, title: 'Fraud that got through', detail: 'An approved fraudulent payment is later charged back; the loss lands in 5010.' },
    ],
  },

  // ── Chapter 4 · BNPL & Installment Approvals ─────────────────────────────────
  '4.1': {
    realWorldScenario: 'Buying a $400 pair of headphones and choosing Pay-in-4 at checkout instead of paying all at once.',
    stepByStepFlow: [
      { actor: CUSTOMER, action: 'Picks Pay-in-4 on the checkout page.' },
      { actor: MERCHANT, action: 'The store sends a plan request (amount, customer, merchant) to the bank’s BNPL desk.' },
      { actor: CREDIT, action: 'The request is queued for underwriting. It does not go through the card network.' },
    ],
    whyItMatters: 'BNPL is a small loan. The bank must decide whether to lend, so the request goes to credit, not to a simple balance check.',
    edgeCasesAndErrors: [{ code: null, title: 'Merchant not enrolled', detail: 'The store does not offer BNPL, so the option never appears.' }, TIMEOUT],
  },
  '4.2': {
    realWorldScenario: 'The BNPL desk looks at the headphone buyer’s repayment history before saying yes.',
    stepByStepFlow: [
      { actor: CREDIT, action: 'Reads the customer’s underwriting score and current BNPL balances.' },
      { actor: CREDIT, action: 'Decides whether four instalments of $100 can be offered.' },
      { actor: CREDIT, action: 'Sets the down payment: usually the first instalment, taken today.' },
    ],
    whyItMatters: 'Responsible lending rules require the bank to check the customer can repay. A good score also keeps the bank’s bad-debt losses low.',
    edgeCasesAndErrors: [
      { code: null, title: 'Underwriting decline', detail: 'The score is too low; the customer is offered the card instead.' },
      { code: null, title: 'Too many open plans', detail: 'Existing BNPL debt is already at the limit.' },
    ],
  },
  '4.3': {
    realWorldScenario: 'The first $100 instalment is taken today; three more follow every two weeks.',
    stepByStepFlow: [
      { actor: CORE, action: 'Takes the first instalment from the everyday account or the credit line.' },
      { actor: LEDGER, action: 'Books the remaining $300 as money the customer owes: 1310.' },
      { actor: MERCHANT, action: 'The store is paid in full; the bank carries the rest of the risk.' },
    ],
    whyItMatters: 'The merchant gets its money now and pays a fee for the higher sale; the bank earns that fee and takes on the repayment risk.',
    edgeCasesAndErrors: [
      { ...NSF, detail: 'The down payment cannot be taken; the plan falls back to paying by card.' },
      { code: null, title: 'Missed instalment', detail: 'A later payment fails, a late fee is charged and collections begin.' },
    ],
  },

  // ── Chapter 5 · Account-to-Account & ISO 20022 ───────────────────────────────
  '5.1': {
    realWorldScenario: 'A friend sends $120 for concert tickets by PayID, and it lands in seconds.',
    stepByStepFlow: [
      { actor: RAIL, action: 'Receives a pacs.008 credit transfer message on the instant-payments rail.' },
      { actor: RAIL, action: 'Validates the XML: required fields, valid account, amount and currency.' },
      { actor: CORE, action: 'Credits the account and answers with a pacs.002 status (accepted).' },
    ],
    whyItMatters: 'ISO 20022 messages carry rich, structured data (who, why, invoice refs), so payments can be checked and reconciled automatically instead of by hand.',
    edgeCasesAndErrors: [
      { code: null, title: 'RJCT: invalid message', detail: 'A malformed pacs.008 is rejected (FF01) before any money moves.' },
      { code: null, title: 'Account closed', detail: 'The destination account no longer exists; the payment is returned to the sender.' },
    ],
  },
  '5.2': {
    realWorldScenario: 'A small business owner deposits $500 of weekend takings at a sidewalk cash deposit machine.',
    stepByStepFlow: [
      { actor: CUSTOMER, action: 'Inserts the card and enters the PIN at the CDM.' },
      { actor: CDM, action: 'Sends an authorisation to confirm the card and account.' },
      { actor: CUSTOMER, action: 'Feeds the notes into the machine’s slot.' },
    ],
    whyItMatters: 'Deposit machines let the bank take cash 24/7 without a teller, which cuts branch costs and keeps cash flowing back into the bank.',
    edgeCasesAndErrors: [
      { code: '75', title: 'PIN tries exceeded', detail: 'The card is retained or locked after too many wrong PINs.' },
      { code: '91', title: 'Machine offline', detail: 'The CDM cannot reach the bank and refuses the deposit.' },
    ],
  },
  '5.3': {
    realWorldScenario: 'The machine counts the $500 and finds one torn note.',
    stepByStepFlow: [
      { actor: CDM, action: 'Counts and checks each note for authenticity.' },
      { actor: CDM, action: 'Returns rejected notes and shows the accepted total for confirmation.' },
      { actor: LEDGER, action: 'The accepted cash joins the machine’s cassette, held in 1015.' },
    ],
    whyItMatters: 'Cash in machines is bank money that cannot be lent out. Tracking it tightly helps the treasury team plan liquidity and cash-in-transit runs.',
    edgeCasesAndErrors: [
      { code: '96', title: 'Dispenser or acceptor jam', detail: 'The machine jams mid-count; the deposit is held for manual review.' },
      { code: null, title: 'Counterfeit note', detail: 'The note is retained and reported, not credited.' },
    ],
  },
  '5.4': {
    realWorldScenario: 'The business owner’s app shows +$500 before they have walked back to the car.',
    stepByStepFlow: [
      { actor: CORE, action: 'Credits the customer’s account immediately.' },
      { actor: LEDGER, action: 'One posting moves the value from cash in the machine to the customer: DR 1015 / CR 2010.' },
      { actor: OPS, action: 'The cassette is emptied and counted later; any difference is investigated.' },
    ],
    whyItMatters: 'Instant credit builds trust and keeps customers using cheap self-service channels instead of a teller.',
    edgeCasesAndErrors: [
      { code: null, title: 'Count mismatch at cassette reconciliation', detail: 'The physical count differs from the machine log; the gap goes to 1910 until resolved.' },
    ],
  },

  // ── Chapter 6 · Overnight EOD Clearing & Settlement ──────────────────────────
  '6.1': {
    realWorldScenario: 'By 11 pm the café has 380 approved taps for the day, all still only promises.',
    stepByStepFlow: [
      { actor: CORE, action: 'Every approval during the day left a hold on a customer account.' },
      { actor: MERCHANT, action: 'Each terminal closes its batch and sends it to the acquirer.' },
      { actor: OPS, action: 'The night run is scheduled to pick them all up together.' },
    ],
    whyItMatters: 'Moving money once per day in bulk is far cheaper than moving it per tap, and it gives every party one clean daily number to agree on.',
    edgeCasesAndErrors: [
      { code: null, title: 'Hold expiry', detail: 'A hold that is never cleared drops off after a few days and the money becomes available again.' },
    ],
  },
  '6.2': {
    realWorldScenario: 'At 23:00 the bank packs the day’s card payments into one clearing file.',
    stepByStepFlow: [
      { actor: OPS, action: 'The batch processor collects all cleared presentments from the scheme.' },
      { actor: SCHEME, action: 'Visa exchanges clearing files between issuers and acquirers.' },
      { actor: CORE, action: 'Each presentment is matched to its earlier authorisation hold.' },
    ],
    whyItMatters: 'Clearing confirms the final amount of each sale (tips and partial shipments can change it) before any money actually moves.',
    edgeCasesAndErrors: [
      { code: null, title: 'Presentment without authorisation', detail: 'A sale arrives that the bank never approved; it is a chargeback candidate.' },
      { code: null, title: 'Amount differs from hold', detail: 'A tip changed the total; the hold is adjusted to the cleared amount.' },
    ],
  },
  '6.3': {
    realWorldScenario: 'Visa works out that the bank owes $1.2 million net across all its customers’ purchases today.',
    stepByStepFlow: [
      { actor: SCHEME, action: 'Nets every bank’s payables and receivables into one amount each.' },
      { actor: LEDGER, action: 'Turns each hold into a real posting: DR 2010 / CR 1110 for the customer.' },
      { actor: LEDGER, action: 'Pays the scheme: DR 2110 / CR 1210 for the net amount.' },
    ],
    whyItMatters: 'Netting means one transfer per bank instead of millions, which slashes liquidity needs and settlement risk across the network.',
    edgeCasesAndErrors: [
      { code: null, title: 'Late settlement file', detail: 'The scheme file arrives late; postings wait and the morning balances are provisional.' },
      { code: null, title: 'Insufficient settlement funds', detail: 'The bank’s nostro is short; treasury must top it up before the deadline.' },
    ],
  },
  '6.4': {
    realWorldScenario: 'Next morning an ops analyst sees two payments that do not match between the ledger and the switch.',
    stepByStepFlow: [
      { actor: OPS, action: 'Compares three records: the ledger, the clearing file and the switch log.' },
      { actor: OPS, action: 'Matching items are marked settled.' },
      { actor: LEDGER, action: 'Breaks are parked in 1910 until a person finds the cause and clears them.' },
    ],
    whyItMatters: 'Reconciliation is how the bank proves its books are right. Unexplained breaks are how errors and fraud hide, so regulators expect them cleared quickly.',
    edgeCasesAndErrors: [
      { code: '68', title: 'Timeout leaves a ghost', detail: 'A timed-out payment was approved at the bank but never reached the terminal; reconciliation finds and reverses it.' },
      { code: null, title: 'Duplicate clearing record', detail: 'The same sale cleared twice; one is reversed.' },
    ],
  },
};

/** The content of a level, or throws: every level must have one. */
export function lessonContentFor(id: string): LessonContent {
  const content = LESSON_CONTENT[id];
  if (!content) throw new Error(`Academy level ${id} has no lesson content`);
  return content;
}
