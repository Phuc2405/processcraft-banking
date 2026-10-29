/** The shape of the bank: which departments exist, which desks are inside them, and which wires connect the desks. */

import type { BankingCapability } from '../types/processLearning';

export const STATION_IDS = [
  'GATE_VIRTUAL',
  'GATE_POS',
  'GATE_ECOM',
  'SEC_VAULT',
  'SEC_DCVV',
  'SEC_3DS',
  'LEDGER_DEBIT',
  'LEDGER_CREDIT',
  'BNPL',
  'EOD_BATCH',
  'EOD_VISA',
  'RECON',
  'SUSPENSE',
  // Added with the A2A channel and the sidewalk ATM. Appended so the staff of the older desks keep their names.
  'GATE_A2A',
  'GATE_ATM',
  'ATM_CASH',
  // Phase 8, the extended flows: onboarding, branch cash, QR and SWIFT gateways, biometrics, fraud detection, AML and disputes.
  'GATE_EKYC',
  'GATE_QR',
  'TELLER_CASH',
  'SEC_FACEPAY',
  'SEC_FDS',
  'AML_DESK',
  'DISPUTE_DESK',
  'GATE_SWIFT',
] as const;
export type StationId = (typeof STATION_IDS)[number];

/** Places a payment can be that are not a desk with staff: the customer's phone, and the three tallies. */
export const EXTERNAL_IDS = ['CUSTOMER_OTP', 'OUT_APPROVED', 'OUT_DECLINED', 'OUT_SETTLED'] as const;
export type ExternalId = (typeof EXTERNAL_IDS)[number];

export type PlaceId = StationId | ExternalId;

export type DepartmentId = 'GATES' | 'SECURITY' | 'LEDGER' | 'BNPL' | 'EOD' | 'ATM' | 'ENTRANCE' | 'COMPLIANCE' | 'BACKOFFICE';

export interface DepartmentDef {
  id: DepartmentId;
  name: string;
  blurb: string;
  accent: string;
  stations: StationId[];
}

export const DEPARTMENTS: Record<DepartmentId, DepartmentDef> = {
  GATES: {
    id: 'GATES',
    name: 'Ingestion Gates',
    blurb: 'Where payments enter the bank: virtual cards, card terminals, online checkouts and instant account-to-account transfers.',
    accent: '#a3e635',
    stations: ['GATE_VIRTUAL', 'GATE_POS', 'GATE_ECOM', 'GATE_A2A'],
  },
  SECURITY: {
    id: 'SECURITY',
    name: 'Security & 3DS Risk Vault',
    blurb: 'Resolves virtual cards, checks dynamic CVVs and decides who has to prove who they are.',
    accent: '#a78bfa',
    stations: ['SEC_3DS', 'SEC_VAULT', 'SEC_DCVV'],
  },
  LEDGER: {
    id: 'LEDGER',
    name: 'Core Banking Ledger',
    blurb: 'Checks the money is there and places the hold: debit accounts and revolving credit lines.',
    accent: '#34d399',
    stations: ['LEDGER_DEBIT', 'LEDGER_CREDIT'],
  },
  BNPL: {
    id: 'BNPL',
    name: 'BNPL Pay-in-4 Desk',
    blurb: 'Underwrites Buy Now Pay Later applications and sets the down payment.',
    accent: '#f472b6',
    stations: ['BNPL'],
  },
  EOD: {
    id: 'EOD',
    name: 'EOD Reconciliation & Suspense Account Desk',
    blurb: 'The night cycle: batch clearing, Visa settlement, 3-way reconciliation, and the suspense account for what does not match.',
    accent: '#fbbf24',
    stations: ['EOD_BATCH', 'EOD_VISA', 'RECON', 'SUSPENSE'],
  },
  ATM: {
    id: 'ATM',
    name: 'Sidewalk ATM',
    blurb: 'Two blue ATM bays on the pavement outside the branch: the card and PIN bay, then the cash bay. If the dispenser jams after the customer was debited, the money goes straight to the suspense account.',
    accent: '#38bdf8',
    stations: ['GATE_ATM', 'ATM_CASH'],
  },
  ENTRANCE: {
    id: 'ENTRANCE',
    name: 'Entrance & Authentication',
    blurb: 'Where new customers and walk-in cash meet the bank: eKYC onboarding, the VietQR gateway, the teller counter and FacePay biometrics for high-value transfers.',
    accent: '#2dd4bf',
    stations: ['GATE_EKYC', 'GATE_QR', 'TELLER_CASH', 'SEC_FACEPAY'],
  },
  COMPLIANCE: {
    id: 'COMPLIANCE',
    name: 'Fraud Detection & AML Compliance',
    blurb: 'The FDS scores every device and pattern; the AML analysts review suspicious activity and confirm sanctions hits.',
    accent: '#f87171',
    stations: ['SEC_FDS', 'AML_DESK'],
  },
  BACKOFFICE: {
    id: 'BACKOFFICE',
    name: 'Disputes & International',
    blurb: 'Cross-border SWIFT remittances in ISO 20022, and the specialists who resolve chargebacks, pacs.004 returns and ATM mismatches.',
    accent: '#fb923c',
    stations: ['GATE_SWIFT', 'DISPUTE_DESK'],
  },
};

export const DEPARTMENT_IDS = Object.keys(DEPARTMENTS) as DepartmentId[];

export type StationKind = 'GATE' | 'DESK' | 'SYSTEM' | 'ACCOUNT' | 'ATM';

export interface StationDef {
  id: StationId;
  department: DepartmentId;
  name: string;
  /** One sentence for the inspector. */
  blurb: string;
  kind: StationKind;
  /** Which banking capability this desk performs, if one of the six. Drives the avatar and the process links. */
  capability: BankingCapability | null;
  /** Staff time one item takes, in minutes. Includes the human review and the paperwork around the system call. */
  minutesPerItem: number;
  /** Staff on duty at the start of every day. */
  staff: number;
  /** Only works while the bank is open (09:00-17:00). Everything else works whenever there is something to do. */
  openHoursOnly?: boolean;
  /** Which of the Academy chapters (A-F, in the order of the course catalog) happen at this desk. */
  processes: Array<'A' | 'B' | 'C' | 'D' | 'E' | 'F'>;
  /** A machine, not a team: it has no one to tire out and nobody to make a mistake. */
  automated?: boolean;
  /** Customers arrive as messages (from an app, a website's checkout or a shop's card terminal), not on foot. */
  digital?: boolean;
}

export const STATIONS: Record<StationId, StationDef> = {
  GATE_VIRTUAL: {
    id: 'GATE_VIRTUAL',
    department: 'GATES',
    name: 'Virtual Cards Gate',
    blurb: 'Receives checkouts paid with a virtual card number and its dynamic CVV.',
    kind: 'GATE',
    capability: 'DCVV_VERIFIER',
    minutesPerItem: 0.05,
    staff: 1,
    processes: ['A'],
    digital: true,
  },
  GATE_POS: {
    id: 'GATE_POS',
    department: 'GATES',
    name: 'POS Gate',
    blurb: 'Receives chip-and-PIN and tap swipes from card terminals in shops.',
    kind: 'GATE',
    capability: 'DCVV_VERIFIER',
    minutesPerItem: 0.05,
    staff: 1,
    processes: [],
    digital: true,
  },
  GATE_ECOM: {
    id: 'GATE_ECOM',
    department: 'GATES',
    name: 'E-Commerce Gate',
    blurb: 'Receives online card checkouts and Pay-in-4 applications from merchant websites.',
    kind: 'GATE',
    capability: 'DCVV_VERIFIER',
    minutesPerItem: 0.05,
    staff: 1,
    processes: ['B', 'C'],
    digital: true,
  },
  SEC_VAULT: {
    id: 'SEC_VAULT',
    department: 'SECURITY',
    name: 'Token Vault',
    blurb: 'Turns a virtual card number (DPAN) back into the real card and the account that funds it.',
    kind: 'DESK',
    capability: 'TOKEN_VAULT',
    minutesPerItem: 1.0,
    staff: 1,
    processes: ['A'],
  },
  SEC_DCVV: {
    id: 'SEC_DCVV',
    department: 'SECURITY',
    name: 'dCVV Verification',
    blurb: 'Checks the rotating security code matches and is still inside its validity window.',
    kind: 'DESK',
    capability: 'DCVV_VERIFIER',
    minutesPerItem: 0.8,
    staff: 1,
    processes: ['A'],
  },
  SEC_3DS: {
    id: 'SEC_3DS',
    department: 'SECURITY',
    name: '3DS Risk Desk',
    blurb: 'Scores each online payment and chooses frictionless, challenge (OTP) or reject.',
    kind: 'DESK',
    capability: 'THREE_DS_EVALUATOR',
    minutesPerItem: 1.6,
    staff: 2,
    processes: ['B', 'F'],
  },
  LEDGER_DEBIT: {
    id: 'LEDGER_DEBIT',
    department: 'LEDGER',
    name: 'Debit CASA',
    blurb: 'Checks the available balance on cheque and savings accounts and prepaid wallets, and places the hold.',
    kind: 'DESK',
    capability: 'CORE_LEDGER_CHECK',
    minutesPerItem: 1.2,
    // Three, not two: every instant (A2A) transfer is checked here as well as the card payments, and with two people the desk ran flat out all day and the same clerk ended every day exhausted.
    staff: 3,
    processes: ['A', 'B', 'C', 'E'],
  },
  LEDGER_CREDIT: {
    id: 'LEDGER_CREDIT',
    department: 'LEDGER',
    name: 'Credit Revolving Line',
    blurb: 'Checks open-to-buy against the credit limit on credit cards, and places the hold.',
    kind: 'DESK',
    capability: 'CORE_LEDGER_CHECK',
    minutesPerItem: 1.4,
    staff: 2,
    processes: ['A', 'B', 'C'],
  },
  BNPL: {
    id: 'BNPL',
    department: 'BNPL',
    name: 'Pay-in-4 Underwriting',
    blurb: 'Reads the customer’s underwriting score and decides whether a four-instalment plan can be offered.',
    kind: 'DESK',
    capability: 'BNPL_UNDERWRITER',
    minutesPerItem: 3.0,
    staff: 2,
    processes: ['C'],
  },
  EOD_BATCH: {
    id: 'EOD_BATCH',
    department: 'EOD',
    name: 'Batch Clearing',
    blurb: 'At 23:00 gathers every approved payment of the day into the clearing file.',
    kind: 'SYSTEM',
    capability: 'RECON_DESK',
    minutesPerItem: 0.03,
    staff: 1,
    processes: ['D'],
  },
  EOD_VISA: {
    id: 'EOD_VISA',
    department: 'EOD',
    name: 'Visa Settlement',
    blurb: 'Exchanges the clearing file with the card scheme and agrees the net settlement position.',
    kind: 'SYSTEM',
    capability: 'CORE_LEDGER_CHECK',
    minutesPerItem: 0.06,
    staff: 1,
    processes: ['D'],
  },
  RECON: {
    id: 'RECON',
    department: 'EOD',
    name: '3-Way Reconciliation',
    blurb: 'Matches the ledger posting, the scheme clearing file and the acquirer report, record by record.',
    kind: 'DESK',
    capability: 'RECON_DESK',
    minutesPerItem: 0.2,
    staff: 4,
    processes: ['D', 'F'],
  },
  SUSPENSE: {
    id: 'SUSPENSE',
    department: 'EOD',
    name: 'Suspense Account',
    blurb: 'Holds every record that did not match until an ops clerk works out what happened and clears it.',
    kind: 'ACCOUNT',
    capability: 'RECON_DESK',
    minutesPerItem: 15,
    staff: 2,
    openHoursOnly: true,
    processes: ['D'],
  },
  GATE_A2A: {
    id: 'GATE_A2A',
    department: 'GATES',
    name: 'A2A Transfer Gate',
    blurb: 'Receives instant account-to-account transfers (QR bill splits, rent, bank-to-bank) as pacs.008 messages and checks each message is well formed before the money is touched.',
    kind: 'GATE',
    capability: 'A2A_GATEWAY',
    minutesPerItem: 0.2,
    staff: 1,
    processes: ['E'],
  },
  GATE_ATM: {
    id: 'GATE_ATM',
    department: 'ATM',
    name: 'ATM Card & PIN',
    blurb: 'The sidewalk ATM’s card reader and PIN pad. The customer gets three tries; after the third wrong PIN the machine locks the session and keeps the card.',
    kind: 'ATM',
    capability: null,
    minutesPerItem: 0.6,
    staff: 1,
    processes: [],
    automated: true,
  },
  ATM_CASH: {
    id: 'ATM_CASH',
    department: 'ATM',
    name: 'ATM Cash Dispenser',
    blurb: 'Checks the balance, counts the notes out and debits the account. If the dispenser jams the customer is already debited, so the money is parked in the suspense account until the cash count proves what happened.',
    kind: 'ATM',
    capability: null,
    minutesPerItem: 0.5,
    staff: 1,
    processes: [],
    automated: true,
  },

  GATE_EKYC: {
    id: 'GATE_EKYC',
    department: 'ENTRANCE',
    name: 'eKYC & Identity Onboarding',
    blurb: 'Opens accounts remotely: OCR reads the CCCD, a liveness check proves a live face, and the selfie is matched against the National Citizen Database before any account exists.',
    kind: 'GATE',
    capability: null,
    minutesPerItem: 0.4,
    staff: 1,
    processes: ['F'],
    digital: true,
  },
  GATE_QR: {
    id: 'GATE_QR',
    department: 'ENTRANCE',
    name: 'Napas247 QR Gateway',
    blurb: 'Parses VietQR payloads (EMVCo TLV, static or dynamic), checks the CRC and maps the payment to the Napas247 switch message before it is screened.',
    kind: 'GATE',
    capability: 'A2A_GATEWAY',
    minutesPerItem: 0.08,
    staff: 1,
    processes: ['E'],
    digital: true,
  },
  TELLER_CASH: {
    id: 'TELLER_CASH',
    department: 'ENTRANCE',
    name: 'Teller Cash In/Out Desk',
    blurb: 'Branch tellers count notes in and out against the vault, record serial numbers of suspect notes, and file a CTR for any cash transaction over $10,000.',
    kind: 'DESK',
    capability: 'CORE_LEDGER_CHECK',
    minutesPerItem: 4,
    staff: 2,
    openHoursOnly: true,
    processes: ['F'],
  },
  SEC_FACEPAY: {
    id: 'SEC_FACEPAY',
    department: 'ENTRANCE',
    name: 'FacePay Biometric Authentication',
    blurb: 'Every transfer over $400 (10M VND) must be authorised with a face match against the biometrics enrolled at onboarding.',
    kind: 'DESK',
    capability: 'DCVV_VERIFIER',
    minutesPerItem: 0.3,
    staff: 1,
    processes: ['B'],
  },
  SEC_FDS: {
    id: 'SEC_FDS',
    department: 'COMPLIANCE',
    name: 'FDS & Device Fingerprint',
    blurb: 'The Fraud Detection System scores the device and the pattern: IP anomalies, jailbroken or rooted phones, and BIN-attack bursts. It also runs the automated AML screen.',
    kind: 'SYSTEM',
    capability: 'THREE_DS_EVALUATOR',
    minutesPerItem: 0.05,
    staff: 1,
    processes: ['F'],
  },
  AML_DESK: {
    id: 'AML_DESK',
    department: 'COMPLIANCE',
    name: 'AML & Sanctions Screening Desk',
    blurb: 'Compliance analysts review held payments: they file an STR or release it, and confirm OFAC/PEP sanctions hits before the funds are blocked.',
    kind: 'DESK',
    capability: 'AML_SCREENING',
    minutesPerItem: 12,
    staff: 2,
    processes: ['F'],
  },
  DISPUTE_DESK: {
    id: 'DISPUTE_DESK',
    department: 'BACKOFFICE',
    name: 'Disputes & Chargebacks Desk',
    blurb: 'Specialists work customer claims: card chargebacks, pacs.004 payment returns and ATM cash mismatches, inside the scheme SLA.',
    kind: 'DESK',
    capability: 'CHARGEBACK_DESK',
    minutesPerItem: 10,
    staff: 2,
    openHoursOnly: true,
    processes: ['F'],
  },
  GATE_SWIFT: {
    id: 'GATE_SWIFT',
    department: 'BACKOFFICE',
    name: 'SWIFT / ISO 20022 Gateway',
    blurb: 'Parses cross-border pacs.008 remittances (BICs, EndToEndId, settlement amount and currency) and converts the foreign-currency amount before the payment is screened.',
    kind: 'GATE',
    capability: 'A2A_GATEWAY',
    minutesPerItem: 0.3,
    staff: 1,
    processes: ['E'],
    digital: true,
  },
};

/** The order desks are served in during a beat. */
export const SERVICE_ORDER: StationId[] = [
  'GATE_VIRTUAL',
  'GATE_POS',
  'GATE_ECOM',
  'GATE_A2A',
  'GATE_ATM',
  'GATE_EKYC',
  'GATE_QR',
  'GATE_SWIFT',
  'TELLER_CASH',
  'DISPUTE_DESK',
  'SEC_VAULT',
  'SEC_DCVV',
  'SEC_3DS',
  'BNPL',
  'ATM_CASH',
  'SEC_FACEPAY',
  'SEC_FDS',
  'AML_DESK',
  'LEDGER_DEBIT',
  'LEDGER_CREDIT',
  'EOD_BATCH',
  'EOD_VISA',
  'RECON',
  'SUSPENSE',
];

export const edgeId = (from: PlaceId, to: PlaceId): string => `${from}>${to}`;

/** Every wire on the map. */
export const WIRES: ReadonlyArray<readonly [PlaceId, PlaceId, string?]> = [
  ['GATE_VIRTUAL', 'SEC_VAULT', 'tokenised card'],
  ['SEC_VAULT', 'SEC_DCVV', 'DPAN found'],
  ['SEC_VAULT', 'OUT_DECLINED', 'unknown DPAN'],
  ['SEC_DCVV', 'LEDGER_DEBIT', 'dCVV ok: debit'],
  ['SEC_DCVV', 'LEDGER_CREDIT', 'dCVV ok: credit'],
  ['SEC_DCVV', 'OUT_DECLINED', 'bad dCVV'],
  ['GATE_POS', 'LEDGER_DEBIT', 'debit card'],
  ['GATE_POS', 'LEDGER_CREDIT', 'credit card'],
  ['GATE_ECOM', 'SEC_3DS', 'SMS OTP check'],
  ['GATE_ECOM', 'BNPL', 'BNPL instalments'],
  ['GATE_A2A', 'LEDGER_DEBIT', 'pacs.008 valid'],
  ['GATE_A2A', 'OUT_DECLINED', 'invalid message'],
  ['GATE_ATM', 'ATM_CASH', 'PIN ok'],
  ['GATE_ATM', 'OUT_DECLINED', 'PIN locked'],
  ['ATM_CASH', 'OUT_APPROVED', 'cash out'],
  ['ATM_CASH', 'OUT_DECLINED', 'no funds'],
  ['ATM_CASH', 'SUSPENSE', 'jam'],
  ['SEC_3DS', 'CUSTOMER_OTP', 'OTP sent'],
  ['CUSTOMER_OTP', 'SEC_3DS', 'OTP entered'],
  ['SEC_3DS', 'LEDGER_DEBIT', 'verified: debit'],
  ['SEC_3DS', 'LEDGER_CREDIT', 'verified: credit'],
  ['SEC_3DS', 'OUT_DECLINED', 'reject'],
  ['BNPL', 'LEDGER_DEBIT', 'down payment: debit card'],
  ['BNPL', 'LEDGER_CREDIT', 'down payment: credit card'],
  ['LEDGER_DEBIT', 'OUT_APPROVED', 'funds available'],
  ['LEDGER_DEBIT', 'OUT_DECLINED', 'insufficient funds'],
  ['LEDGER_CREDIT', 'OUT_APPROVED', 'within limit'],
  ['LEDGER_CREDIT', 'OUT_DECLINED', 'over credit limit'],
  ['OUT_APPROVED', 'EOD_BATCH', 'tonight'],
  ['EOD_BATCH', 'EOD_VISA', 'settlement file'],
  ['EOD_VISA', 'RECON', 'Visa report'],
  ['RECON', 'OUT_SETTLED', 'matched overnight'],
  ['RECON', 'SUSPENSE', 'break'],
  ['SUSPENSE', 'OUT_SETTLED', 'cleared'],
  // Phase 8: the extended flows. Biometrics come before the FDS, the FDS before AML, and only clean money reaches the ledger.
  ['GATE_EKYC', 'LEDGER_DEBIT', 'account opened'],
  ['GATE_EKYC', 'AML_DESK', 'watchlist hit'],
  ['GATE_EKYC', 'OUT_DECLINED', 'liveness failed'],
  ['GATE_QR', 'SEC_FACEPAY', 'over $400'],
  ['GATE_QR', 'SEC_FDS', 'VietQR parsed'],
  ['GATE_QR', 'OUT_DECLINED', 'bad QR'],
  ['GATE_SWIFT', 'SEC_FACEPAY', 'over $400'],
  ['GATE_SWIFT', 'SEC_FDS', 'AML & sanctions check'],
  ['GATE_SWIFT', 'OUT_DECLINED', 'invalid pacs.008'],
  ['SEC_FACEPAY', 'SEC_FDS', 'face matched'],
  ['SEC_FACEPAY', 'OUT_DECLINED', 'no face match'],
  ['SEC_FDS', 'AML_DESK', 'STR flag'],
  ['SEC_FDS', 'LEDGER_DEBIT', 'clean'],
  ['SEC_FDS', 'OUT_DECLINED', 'high-risk device'],
  ['TELLER_CASH', 'AML_DESK', 'CTR / STR'],
  ['TELLER_CASH', 'LEDGER_DEBIT', 'cash posted'],
  ['TELLER_CASH', 'OUT_DECLINED', 'vault limit'],
  ['AML_DESK', 'LEDGER_DEBIT', 'released'],
  ['AML_DESK', 'OUT_DECLINED', 'blocked'],
  ['DISPUTE_DESK', 'LEDGER_DEBIT', 'refund'],
  ['DISPUTE_DESK', 'OUT_DECLINED', 'high risk: chargeback refused'],
];

const WIRE_SET = new Set(WIRES.map(([a, b]) => edgeId(a, b)));
export const hasWire = (from: PlaceId, to: PlaceId): boolean => WIRE_SET.has(edgeId(from, to));

export const isStation = (id: PlaceId): id is StationId => id in STATIONS;

export const PLACE_NAMES: Record<ExternalId, string> = {
  CUSTOMER_OTP: 'Customer’s phone (OTP)',
  OUT_APPROVED: 'Approved',
  OUT_DECLINED: 'Declined',
  OUT_SETTLED: 'Settled & cleared',
};

export const placeName = (id: PlaceId): string => (isStation(id) ? STATIONS[id].name : PLACE_NAMES[id]);
