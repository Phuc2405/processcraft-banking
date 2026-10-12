/**
 * What can go wrong at each box of each process: the "fail cases" that Spotlight and the guided walkthrough show next to
 * the explanation of the step. They are short on purpose. Each one names a thing that really happens in a bank and says
 * what it costs.
 *
 * Keyed by process, then by the same box ids the lessons use (nodes of the process graph, and the synthetic boxes).
 */

import { pick, type Localized } from '../i18n/locale';
import type { ProcessId } from './learning';

type FailBook = Record<ProcessId, Record<string, string[]>>;

const EN: FailBook = {
  A: {
    n_start: [
      'The checkout sends a malformed message (no timestamp, or a negative amount). Nothing downstream can be trusted, so the payment has to be refused here.',
      'The same request arrives twice because the shopper double-clicked. Without a duplicate check, two payments are made.',
    ],
    n_vault: [
      'The virtual number is not in the vault (a guessed number, or a card that was cancelled). The payment is declined here and nothing else is troubled.',
      'The vault is slow or down. Every virtual-card checkout in the bank queues behind it.',
      'A token was leaked in a data breach. If it is still active, the thief can try it until the dCVV stops them.',
    ],
    n_dcvv: [
      'The code is right but old (a slow typist, or a replay of a captured code). The window is a trade-off between the two.',
      'The code is wrong (a typo, or a guess). Repeated wrong codes on one card are the signature of a guessing attack.',
      'The bank’s clock and the shop’s clock drift apart, so good codes look stale.',
    ],
    n_xor_dcvv: [
      'The rule is written wrongly and a bad code slips through to the ledger: a hold is placed on a payment nobody should have trusted.',
      'The “everything else” wire is missing, so an unexpected code status leaves the payment stuck with nowhere to go.',
    ],
    n_ledger: [
      'The customer has less than the amount. The payment is declined for funds, which is not the bank’s fault and not a fraud signal.',
      'Two payments arrive at the same moment for one balance. Without a hold, both could be approved and the account goes negative.',
      'The ledger is slow at month end, and checkouts time out.',
    ],
    n_xor_ledger: [
      'Treating “not enough funds” as fraud. Honest customers get flagged, and the fraud numbers look worse than they are.',
    ],
    n_end_approved: [
      'The payment was approved but was fraud. The bank now repays it: this is the cost the earlier checks exist to prevent.',
      'The approval is never sent into tonight’s batch, so the money never moves.',
    ],
    n_end_declined: [
      'A good customer was turned away by a rule (an expired code). That is a lost sale and an unhappy customer.',
      'The decline reason is lost, so the team cannot tell fraud declines from funds declines.',
    ],
  },
  B: {
    n_start: [
      'The risk score is missing or out of range. A rule that reads it cannot decide, and the payment has no valid path.',
      'The checkout does not send the data 3DS needs (device, address). The bank has to guess, and it guesses cautiously.',
    ],
    n_3ds: [
      'The frictionless line is set too high. Fraud walks in without being asked for anything.',
      'The frictionless line is set too low. Everybody is challenged, and honest customers give up at the code screen.',
      'The reject line is too low. Good customers are refused outright, with no chance to prove who they are.',
    ],
    n_xor_3ds: [
      'The three ranges overlap or leave a gap. A score that matches nothing has no wire to take.',
      'The default wire is missing, so an unusual score is a stuck payment.',
    ],
    n_end_challenge: [
      'The code is sent to a phone number that is out of date. The real customer never gets it.',
      'SMS arrives late. By the time it is typed, the shopper has left.',
    ],
    syn_phone: [
      'The customer abandons the code screen. That is a lost sale that nobody declined.',
      'A fraudster who has stolen the phone, or SIM-swapped it, types the code. A one-time code only proves possession of the phone.',
      'The customer is travelling and the SMS cannot reach them.',
    ],
    n_ledger: [
      'Passing 3DS makes the payment trusted, not funded. The customer may still have too little money.',
    ],
    n_xor_ledger: [
      'A challenged payment that completed is wrongly sent back to the beginning and challenged a second time.',
    ],
    n_end_approved: [
      'A fraudulent payment that was authenticated: when 3DS passed, the fraud liability shifts to the card issuer. The bank pays.',
      'A fraudulent payment that skipped 3DS: the liability stays with the merchant.',
    ],
    n_end_declined: [
      'A genuine customer was rejected on risk. They may never come back.',
      'Declines caused by the risk score are counted with funds declines, so the team cannot see which dial to turn.',
    ],
  },
  C: {
    n_start: [
      'The basket and the plan do not agree (the down payment is more than the price). The application is rejected before anyone looks at the score.',
      'Applications are submitted again and again until one is approved (a “shopping around” attack on the score line).',
    ],
    n_bnpl: [
      'The minimum score is set too low. The bank approves people who will not pay the last three instalments.',
      'The minimum score is too high. Good customers are pushed out of the plan, and the shop loses its higher basket sizes.',
      'The score is stale. The customer’s circumstances changed since it was calculated.',
    ],
    n_xor_plan: [
      'The failed-approval wire is missing. A customer who is turned down for the plan simply drops out of the checkout and the sale is lost.',
      'The wire sends rejected applicants to a decline when the card could have covered the full price.',
    ],
    n_ledger_dp: [
      'The customer cannot cover even the down payment. The plan was approved but nothing can be collected, and no plan exists.',
      'The down payment is taken but the later instalments fail because the card has expired or the account is empty.',
    ],
    n_ledger_card: [
      'The card cannot cover the full price either. The sale is lost twice: once to the score, once to the funds.',
    ],
    n_xor_funds: [
      'Declines for funds are mixed with declines for credit risk, so nobody can tell whether the problem is the score or the customer’s money.',
    ],
    n_end_bnpl: [
      'The bank carries the risk of three unpaid instalments. A wave of missed payments is a loss the shop’s fee may not cover.',
    ],
    n_end_card: [
      'A fallback customer who is nudged back to full-price payment may still abandon the cart at the card screen.',
    ],
    n_end_dp_declined: [
      'The customer sees “declined” on a plan they were just told they qualified for. The experience is confusing.',
    ],
    n_end_card_declined: [
      'The sale is lost. This is the one outcome where nothing could have been saved by a rule.',
    ],
  },
  D: {
    syn_batch: [
      'The batch runs while some payments are still being processed. Items are missing from tonight’s file and show up as breaks.',
      'The batch fails halfway and nobody notices. Tomorrow morning thousands of approved payments have not been sent.',
    ],
    syn_visa: [
      'The scheme file arrives late, or corrupt. The bank cannot match anything until it is fixed.',
      'The scheme presents the same payment twice. Without a duplicate check, the merchant is paid twice.',
    ],
    n_start: [
      'A record arrives with a leg missing. There is nothing to compare, so the whole payment becomes a break.',
    ],
    n_recon: [
      'The tolerance is too tight. Rounding dust floods the suspense account and buries the real errors.',
      'The tolerance is too loose. A real mistake is matched away, and nobody ever looks at it.',
      'Two currencies are compared without conversion. Every foreign payment looks like a break.',
    ],
    n_xor_recon: [
      'Different kinds of break are sent down one wire, so the clerk does not know where to start looking.',
      'A break is forced to match to keep the dashboard green. The error is still there; it is just hidden.',
    ],
    n_end_settled: [
      'A real error inside the tolerance is settled by mistake. It will not be noticed until a customer or an auditor finds it.',
    ],
    n_end_amount: [
      'The variance is parked, but nobody owns it. It ages in the suspense account.',
    ],
    n_end_missing: [
      'The missing record never arrives. The payment stays parked until someone chases the scheme.',
    ],
    n_end_dup: [
      'The duplicate is paid out before the reversal. Money has left the bank.',
    ],
    syn_suspense: [
      'The suspense balance keeps growing. The night’s rules do not fit the data, or the day team is overloaded.',
      'An item is parked without a reason code, so the investigator starts from nothing.',
    ],
    syn_cleared: [
      'The correction is posted to the wrong account. The break is cleared, but the books are now wrong in a new place.',
    ],
  },
  E: {
    n_start: [
      'The app sends the message twice because the customer tapped twice. Without a duplicate check the money goes twice, and an instant transfer cannot be recalled.',
      'The message arrives in an old format. The gateway cannot read it, and the transfer is refused before any rule runs.',
    ],
    n_gateway: [
      'The EndToEndId is missing. The payment cannot be traced between the two banks, so it must be refused.',
      'A bank code is cut off. The receiving bank cannot be found, and a transfer sent anyway would go nowhere or to the wrong place.',
      'The settled amount and the instructed amount disagree. One of them is wrong, and either way one side of the books would not balance.',
    ],
    n_xor_valid: [
      'The rule is written the wrong way round and flawed messages go on to the ledger: a debit is made for a payment the receiving bank will bounce.',
      'The “everything else” wire is missing, so a message with an unexpected flaw is stuck with nowhere to go.',
    ],
    n_ledger: [
      'Two transfers arrive at the same moment for one balance. Without the money set aside at once, both could go through.',
      'The ledger is slow when everyone is paid at once, and instant transfers queue behind it. Instant stops feeling instant.',
    ],
    n_xor_funds: ['Counting “not enough money” as a bad message. The app’s developers are blamed for a customer’s empty account.'],
    n_end_approved: [
      'The transfer was authorised by a fraudster using a stolen login. Instant means final: the money is already gone and the customer expects the bank to explain.',
      'A released transfer is never reported to the receiving bank, and the money leaves with no one to receive it.',
    ],
    n_end_invalid: ['The rejection reason is vague. The developer cannot tell which field was wrong and keeps resubmitting the same bad message.'],
    n_end_declined: ['The customer is told “failed” without being told why, and tries again, and again.'],
  },
  F: {
    n_start: [
      'The customer’s profile is out of date: the date of birth or nationality on file is wrong, so a good customer looks like someone else and a bad one looks clean.',
      'The watchlists are a week old. A newly sanctioned person passes straight through.',
    ],
    n_aml: [
      'The match threshold is too low. Every customer with a common name is a hit, and the analysts drown in false positives.',
      'The threshold is too high. A sanctioned person with a spelling variant slips through.',
      'Deposits are split across several accounts. Looking at one account at a time hides the pattern.',
    ],
    n_xor_hit: [
      'A clean customer is sent to Case Investigation. An analyst’s time is wasted and a good customer waits.',
      'Structuring is checked before name hits, and a sanctioned person who also splits deposits is reported but never investigated.',
    ],
    n_case: [
      'The verdict rests on the name alone. Two different people with the same name are treated as one.',
      'The audit log has no identity check, so nothing can be proved either way. The honest answer is inconclusive, not a guess.',
      'The analyst trusts a document the customer supplied rather than one the bank verified.',
    ],
    n_xor_verdict: [
      'A false positive is blocked. A long-standing VIP is frozen, and the bank’s relationship with them is damaged.',
      'A true sanctions match is released because the rule treated every true match the same as a politically exposed person.',
    ],
    n_end_released: ['The payment was released even though the customer’s profile had not been refreshed. The screening was right, but of old information.'],
    n_end_cleared: ['The reason for clearing is not written down. At the next audit nobody can say why a name that looks like a sanctioned one was let through.'],
    n_end_sar: ['The report is filed late, or the customer is told they are being reported. Both are offences in their own right.'],
    n_end_sanctions: ['The payment is blocked but the account is not frozen, so the customer tries again by another route.'],
    n_end_edd: ['The source-of-funds request sits unanswered. The customer is left waiting with no deadline.'],
    n_end_escalate: ['The escalation has no owner. The payment waits in a queue nobody works.'],
    n_3ds: [
      'The evaluator does not run before the dispute desk. The desk cannot see the authentication, so a purchase that shifted liability to the issuer is wrongly charged back to the merchant.',
      'The risk score was recorded when the purchase was made, but the challenge result was lost. An authenticated purchase looks unauthenticated.',
    ],
    n_desk: [
      'The filing window is counted from the wrong date. A claim that is in time is refused, or one that is out of time goes through.',
      'The reason is mis-recorded as fraud when it was a duplicate charge, and the liability shift is applied to the wrong kind of claim.',
    ],
    n_xor_gate: [
      'The liability is checked before the window. A claim that is out of time is argued about for weeks before anyone notices it is dead.',
      'An authenticated purchase is charged back to the merchant anyway, and the merchant, rightly, disputes it.',
    ],
    n_xor_stage: ['A stage is skipped. The first chargeback is filed without asking the merchant for the receipt, and a legitimate sale is reversed.'],
    n_xor_result: ['The result is booked to the wrong party, so the loss lands on a customer or a merchant who did nothing wrong.'],
    n_end_retrieval: ['The request goes to the wrong contact at the merchant, and the days pass.'],
    n_end_filed: ['The chargeback is filed with the wrong reason code and the scheme rejects it.'],
    n_end_represent: ['The merchant’s evidence is accepted without being read, because the queue is long.'],
    n_end_prearb: ['The case is escalated past the deadline. The right to escalate is lost.'],
    n_end_refunded: ['The cardholder is refunded twice: once provisionally and once at the end.'],
    n_end_absorbed: ['The bank absorbs a loss it could have recovered, because the authentication was not recorded properly.'],
    n_end_merchant: ['The provisional credit is taken back from the cardholder without telling them, and they dispute the bank’s statement.'],
    n_end_barred: ['A customer who was in time is told they were too late, because the clock started on the wrong day.'],
  },

};

export const FAIL_CASES: Localized<FailBook> = { en: EN };

/** What can go wrong at one box of one process. An empty list when the box has nothing to say. */
export function failCasesFor(process: ProcessId, nodeId: string): string[] {
  return pick(FAIL_CASES)[process][nodeId] ?? [];
}
