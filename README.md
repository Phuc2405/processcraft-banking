# ProcessCraft Banking

A banking-operations academy you can play. Two halves that share one engine:

* **Build Lab**: ten levels in six stages. You draw a payment process as a BPMN-style diagram on a canvas, and an automated
  simulator grades it against a test suite (visible and hidden). Every level has a **guided walkthrough**: one payment, one
  token, walked box by box at quarter speed, with a "What is happening?" card at each stop and a quiz at every decision.
* **Living Bank** (opens first): a day-by-day operations simulator. A pre-wired map of the whole bank runs by itself, with
  payments flowing through its departments, people at their desks, queues forming and clearing. Click anything to see what is
  happening there; open the Learning Hub to turn a rule dial and see what it does to tomorrow's numbers.

The Living Bank routes its payments through the same `ProcessRunner` and the same reference diagrams that grade the Build Lab.
Every payment that finishes in either half is also written to a **double-entry general ledger** that you can open and audit.

## Run it

You need Node 20 or newer.

```bash
npm install        # run this again after unpacking an update: the 3D office needs three, @react-three/fiber and drei
npm run dev        # opens the app at http://localhost:5173
npm test           # 1121 tests across 37 files
npm run typecheck  # tsc, strict
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build at http://localhost:4173 (SPA fallback on, like Vercel)
```

Everything runs in the browser. There is no server and no database yet.

## Deploy (GitHub + Vercel)

The project is a static Vite single-page app: `npm run build` writes everything to `dist/`, and there is no server.
`vercel.json` tells Vercel to install with `npm ci`, build with `npm run build`, serve `dist/`, send every unknown path to
`index.html` (SPA routing), and cache the hashed files in `dist/assets/` for a year. Node 20.19 or newer is required
(`engines` in `package.json`); Vercel's default Node version satisfies it.

1. Push this folder to a new GitHub repository.
2. In Vercel: **Add New... > Project**, import the repository, keep the detected settings (Framework: Vite), **Deploy**.
3. Every push to `main` redeploys; every pull request gets its own preview URL.

### Security notes

* **No source maps** in production (`build.sourcemap: false`): DevTools shows only the minified bundle.
* **No secrets, no environment variables.** Nothing in `src/` reads `import.meta.env`, calls the network or holds a key or
  token (the "tokens" in the code are the simulation's payment tokens; the card numbers are made-up teaching data).
  `.env.example` documents how to add variables later. Remember that any `VITE_` variable ends up in the public bundle, so
  real secrets belong on a server, never in this app. `.env`, `.env.local` and `.env.*.local` are git-ignored.

## What is in the header

| Control | Where | What it does |
| --- | --- | --- |
| **Living Bank / Build Lab** | both | The two halves |
| **Fintech Expert / Concept Explorer** | both | Switches every name, tooltip, inspector panel, ledger memo and tour card between the professional term ("pacs.008", "authorisation hold") and plain English ("bank-to-bank payment message", the wallet with a locked pocket) |
| **2D Blueprint Flow / 3D Isometric Office** | Living Bank | The flat map of departments and wires, or the same bank as a bright low-poly isometric office with desks, staff and customers (WebGL; without it the switch says so and stays on 2D) |
| **🎓 Academy** | Living Bank | Opens the Course Catalog of six chapters. The badge shows the chapter you are in ("Ch 3") while a walkthrough runs, and the chapter count otherwise |
| **Ledger** | Living Bank clock bar | The live double-entry mini ledger (below) |

Concept Explorer, the view, the 3D label mode and the inspector width are remembered in this browser. (Concept Explorer is stored
under its old id, `beginner`, so saved preferences from earlier versions still work.)

## The Academy (Build Lab)

Six stages, ten levels. The level bar groups them; each level keeps its own diagram, saved to this browser as you work.

| Stage | Level | What it teaches |
| --- | --- | --- |
| 1. The First Swipes | 1.1 **First Swipes** (L5) | A balance check and a graceful decline: $500 against $200 |
| | 1.2 **Virtual Card** (L1) | Sequencing, decisions (XOR), fork/join (AND); never checking funds for a request you already know is bad |
| 2. Fraud Detective | 2.1 **3DS Routing** (L2) | Routing on a risk score, a challenge that can be abandoned, fraud you cannot see directly |
| | 2.2 **Card-Testing** (L6) | Velocity rules, low-value exemptions, not blocking a genuine big ticket |
| 3. Fintech & Instalments | 3.1 **BNPL Pay-in-4** (L4) | Underwrite first; approved plans take a 25% down payment; a declined plan falls back to a normal card |
| 4. The Lifeblood Network | 4.1 **A2A Rails** (L7) | Account-to-account payments as ISO 20022 `pacs.008`: validate, instant rail vs RTGS, liquidity, queue, payroll priority |
| 5. The 23:59 Night Run | 5.1 **EOD Recon** (L3) | Three records that must agree, tolerances, parking breaks in suspense |
| | 5.2 **FX Breaks** (L8) | Rate differences are gains or losses in their own accounts, not unexplained suspense |
| 6. Operational Storms | 6.1 **Sanctions Storm** (L9) | Fuzzy-name AML screening, structuring, and a false-positive VIP that must be investigated rather than blocked |
| | 6.2 **Chargebacks** (L10) | The dispute state machine and the liability shift to the issuer on 3DS-authenticated fraud |

The tab for level N is always the one numbered N in the data, whichever stage it sits in. Hover a tab for the full title.

### New building blocks

* **A2A Inflow Channel** (start node beside the Card Payment Request) and **A2A Payment Gateway**: the inspector shows the
  `pacs.008` message the selected test sends, as real XML (`EndToEndId`, `DbtrAgt`, `CdtrAgt`, `IntrBkSttlmAmt`).
* **AML Screening** (OFAC and PEP fuzzy name match, structuring over a rolling window), **Case Investigation**, and the
  **Chargeback Desk**, which is the state machine `RETRIEVAL_REQUEST -> FIRST_CHARGEBACK -> REPRESENTMENT -> PRE_ARBITRATION`.
  When a fraud claim is on a 3DS-authenticated purchase, liability shifts to the issuer and the desk does not charge back.

### The guided walkthrough

Open it from the **Guided tour** box at the top of any level brief: **Walk through my diagram** or **Tour the worked example**.

1. A story card sets the scene and picks the payment to follow (you can change it).
2. The canvas dims every box that the payment does not touch (opacity 0.15 plus blur) and lights the path it takes.
3. Speed is locked to **0.25x** with a single token. The token pauses at each box and a card says **What is happening?** and
   gives one **Key takeaway**, in the words the Expert / Concept Explorer switch has chosen.
4. At every decision (XOR) the tour stops with a short question ("Risk score is 15. Does the customer need to enter an OTP?").
   You cannot go on until you answer; answers survive Previous.
5. The bottom bar: **Previous step**, **Play / Pause**, **Next step**, **Exit tutorial**. Keys: left / right, Space, Esc.
6. At the end a verdict says how the payment ended and whether that matches what the test expects. For your own diagram, a
   path that cannot be walked (a dead end, a wire with nothing on it) is explained instead of crashing.

The tour runs on a private copy of the canvas. Your diagram, selection and saved work are never touched.

### The ledger in the Build Lab

The **Ledger** tab of the results drawer lists the journal lines a payment posts, grouped by payment, with a trial balance
that must always balance. Source: **This replay** or **Every graded test**. An authorisation hold, for instance, debits
*Customer CASA Hold* and credits *Card Settlement Clearing Payable* for the same amount.

## The Living Bank

### The map

Five departments, wired up in advance:

| Department | Desks |
| --- | --- |
| Ingestion Gates | Virtual Cards Gate, POS Gate, **A2A Transfer Gate**, E-Commerce Gate |
| Security & 3DS Risk Vault | Token Vault, dCVV Verification, 3DS Risk Desk |
| Core Banking Ledger | Debit CASA, Credit Revolving Line |
| BNPL Pay-in-4 Desk | Pay-in-4 Underwriting |
| EOD Reconciliation & Suspense Account Desk | Batch Clearing, Visa Settlement, 3-Way Reconciliation, Suspense Account |
| Sidewalk ATM (outside, on the pavement) | ATM Card & PIN, ATM Cash Dispenser |

**A2A inflow.** Instant account-to-account transfers (QR bill splits, rent, bank-to-bank) arrive at the A2A Transfer Gate as
ISO 20022 `pacs.008` messages, sit in the gate column beside POS and E-Commerce, and run on a wire of their own straight into
the Debit CASA ledger. A malformed message is declined at the gate before any money is touched. Transfers settle on their own
rail, so they do not go through the Visa night cycle.

**Sidewalk ATM.** Two kiosks on the pavement in front of the bank. The Card & PIN bay verifies the PIN (three tries, then the
card is kept); the Cash bay checks the balance, counts $50 and $20 notes and debits the account. If the dispenser jams, the
customer has already been debited, so the money goes straight into the Suspense Account and is refunded when the cash count
clears it. ATM cash is counted at the machine, not in the Visa night cycle.

**Merchant stories.** Every payment carries a real-world story, shown on its packet badge, in the inspector's queue and live
activity, and as the title of its entry in the ledger drawer: ☕ Corner Cafe Tap ($4.50), 🛒 Supermarket Groceries ($62.80),
🚇 Subway Transit Gate ($2.75), 👗 Online Fashion Boutique ($120.00), 🎮 Digital Game Pass ($14.99), 🔒 1-Time Masked Card for
Trial ($1.00), ⚡ QR Bill Split ($18.50), 🏠 Apartment Rent Transfer ($850.00), 🏧 Sidewalk ATM Cash Out ($100.00), plus a few
extra ones per channel (marked `extra` in `src/sim/scenarios.ts`) so a day is not the same nine payments over and over.

Payments appear as small packets and slide along the wires from desk to desk. Which wire a payment takes is decided by running
it through the real process diagram. At night the day desks go dim and the end-of-day department lights up.

The map comes in two views, switched in the header. Both read the same store, so a desk, a queue or a payment is the same
thing in each, and clicking one opens the same inspector.

### The 3D Isometric Office

The same bank as a daylight diorama, built from low-poly pieces with one warm palette:

* **Look:** a rounded wood-plank floor slab with a coloured rug under each department, a back and a right wall with windows, a
  low kerb along the left side with a doorway for every gate, potted plants. A directional sun casts soft shadows, with hemisphere and ambient fill, and
  contact shadows under the slab.
* **Furniture:** every desk is an L-shaped workstation with dual glowing monitors, a keyboard, a PC tower and an ergonomic chair.
  The gates are rounded podium counters with a display facing the customer. Each station has its own prop (gold bars and a
  padlock at the Token Vault, a globe and parcels at E-Commerce, a ledger book at Debit CASA, a fan of cards at the Credit
  Revolving Line, ...).
* **Glass rooms:** the 3DS Security Risk Vault is a glass room with a round vault door, and the core servers sit in a glass
  server room with blinking racks. Doorways are cut wherever a payment lane crosses a wall.
* **Gates:** brass stanchions with red ropes line up the queues at the Virtual Cards, POS and E-Commerce gates. Instant transfers
  queue as phones at the A2A gate.
* **Outside:** the two blue ATM kiosks stand in an entrance alcove on a tiled pavement in front of the building, with a kerb, the
  road and street lamps that come on as the bank's day turns to evening. They are live stations: customers queue at them,
  clicking one opens the inspector, and the lamp on top flashes red when the dispenser jams (amber when a card is kept).
* **People:** staff are miniature figures. They type with their arms and nod when idle, type faster while their desk is in
  a surge, and slump (head down, arms limp) when fatigue goes over 80%. Customers stand in line at the counter, and the ones
  who arrive walk in from the door. The faces in the queue change as people are served, so the line seems to move up.
* **Payments:** a card payment is a glowing chip card, a Pay-in-4 is a stack of coin tokens and a settlement is a file folder.
  They fly the wire's lane with its corners rounded by Bezier curves and hop gently, with the same timing as the 2D tokens.
* **Pins:** every desk has a floating badge with its name, a status dot and how many people are waiting. Click it, the
  counter or a person to open the inspector. **Labels: Always Show / Hover Only** (top left of the view) hides the badges until
  the pointer is over a workstation, to keep the diorama clean.

Camera: the view is a fixed isometric (orthographic) one. **Drag** pans, **scroll** zooms, **right-drag** turns the office a
little either way (the tilt is locked so the isometric look cannot be lost), all with damping. **Reset view** (top left of the
view) glides back to the whole office. The scene is drawn with merged, vertex-coloured geometry and a handful of shared
materials, so a busy day is a few hundred draw calls, not thousands.

### Staff, stamina and the night rota

Everyone at a desk has a name, a pace and a fatigue level. Being busy wears people down, idle moments let them recover, and
a tired person works more slowly and, past 60%, starts fumbling items. A night's sleep takes away about two thirds of the day's
tiredness.

* **Night rota.** The three night desks (Batch Clearing, Visa Settlement, 3-Way Reconciliation) need six people. The night team
  has nine, and the rota turns three places every day: everyone works two nights in three and has the third off, and the
  one-person desks change hands every night. The rota is a pure function of the day number, so reloading the page, Reset
  day and the what-if runs all see the same crew.
* **Night stamina follows the load.** Working through the night tires faster than by day, scaled by how busy the person
  actually was: from 1.2x when keeping up with a light night to 3.6x when flat out on a heavy one.
* **The day report** has a *Tonight's night shift* panel: who was on, at which desk, how many records each worked, their stamina
  when the shift ended (Fine, Tired, Worn out, Exhausted), whether the shift finished (and when) or how many records were left,
  and who had the night off.
* The Debit CASA desk has three clerks: it checks every instant transfer as well as the card payments.

### The End-of-Day report

When the day closes the report opens on **Overview**, an executive view; **Detailed Audit** (top right) switches to the full
breakdown, and **📥 Export Day Report (.CSV)** downloads the whole day as a spreadsheet file, made in the browser.

* **Overview:** four cards (*Capital & P&L*: today's net result and the bank's reserves before and after it; *Settlement &
  volume*: approval rate and settled volume; *Customer base & churn*: active customers, new signups and customers lost to
  friction or false declines; *Top revenue drain*: the single biggest loss line), a *Revenue vs losses* bar, a stacked *Decline
  breakdown* bar (not enough money, OTP abandoned, risk and security blocks, ATM hardware, queues), and a one-line *Takeaway*
  that links to the chapter that explains it.
* **Detailed Audit:** every P&L line, the day in numbers, tonight's night shift, every decline reason and the coaching tips.
* **CSV:** five columns (Section, Item, Value, Unit, Note): the books, every P&L line (money in dollars, losses negative), the
  operational stats, every decline reason and group, the night crew and the takeaway. UTF-8 with a byte-order mark and CRLF
  line ends, so Excel opens it cleanly.
* **📥 Export Transactions (.CSV):** the day's raw payment stream, one row per customer payment (about 900 on an ordinary
  day), oldest first: `Timestamp, Transaction_ID, Channel_Type (CARD_PAYMENT, PAY_IN_4, INSTANT_A2A, ATM_WITHDRAWAL),
  Amount_AUD, Fee_Earned_AUD, Status (APPROVED, DECLINED, JAMMED), Decline_Reason, Is_Fraud, Overnight_Reconciled (YES, NO,
  SUSPENDED, or N/A for declines and for transfers and ATM cash, which settle on their own rails)`, then four columns to trace a
  row back to the screen (channel, card type, merchant story, the payment id the ledger drawer shows). The simulation records
  one small entry as each payment finishes and builds the file only on the click. The log is kept for the day just played:
  starting the next day or reloading the page clears it, and the button then says so. Arrivals are simulated to the minute;
  the seconds in the timestamp are drawn from the seed.
* **The books** (`src/sim/bankBook.ts`): reserves start at $100,000.00 and move by each day's result. Customers start at 5,400;
  churn is the day's "good customers lost" count, and one approved payment in twenty is a new signup. Each report stores where
  the books ended, so they carry over reloads and beyond the saved history.

### The day report's glossary

Every line of the End-of-Day report's Profit & Loss, every tile of *The day in numbers* and every reason under *Why payments
were declined* has a small (?) beside it. Hover, focus or tap it for a one-line explanation in plain English (the texts are in
`src/data/reportGlossary.ts`). The tips are drawn above the modal, follow the report as it scrolls, and are kept inside the
window on a phone; the report itself stacks into one column on small screens.

### HUD alerts

While the clock runs, small pills float at the top right of the map (2D or 3D) when a payment fails in a way worth noticing:
**SMS OTP Abandonment** and **dCVV Timeout** (amber) and **NSF Block** (red, not enough money). At most three at a time, each
gone after 3.5 s, with "×N" when several happen in one beat. They are read from the day's decline counters (no extra work per
payment), stay quiet during skips and guided tours, and the layer has `pointer-events: none`, so clicks and 3D camera drags
go straight through.

### The clock

Days run **Day 1, Day 2, ...** and carry what they leave behind: the suspense account and any records the night team did not finish.

| Time | Phase | What happens |
| --- | --- | --- |
| 08:00-09:00 | Briefing | Staff arrive; read the briefing, look around, or change a rule |
| 09:00-17:00 | Working hours | Live traffic |
| 17:00-23:00 | After hours | The day shift goes home; the bank is quiet |
| 23:00-24:00 | Night cycle | Batch clearing, Visa settlement, 3-way reconciliation, suspense |

**The time bar is a scrubber.** Click anywhere on the 08:00-24:00 bar, or drag its thumb, to put the bank at that time: the
clock, the queues, the KPIs and the ledger jump there at once. Forward runs the day on; backward replays today from 08:00 with the
same customers up to the time chosen. With the bar focused, the arrow keys move a quarter of an hour, Page Up and Page Down an
hour, Home and End to the ends of the day.

Six speeds: **0.25x Slow-mo, 0.5x, 1x Relaxed (one tick every 1.5 s), 2x, 5x, 10x**. Skip buttons jump to open, close, night, or
the end of the day, and **Jump to EOD (23:00)** drops you into the night cycle and keeps playing. The sim moves in "beats"
(133 per day) rather than every second. Traffic is a pure function of the seed and the day number; nothing uses `Math.random`.

**Reset day N** (clock bar) replays the current day from the 08:00 briefing: the same seed, the same carried-over suspense
and records, the rules you have now, today's own report dropped and earlier reports kept. Because the same customers arrive,
changing a rule dial and resetting is a fair way to ask what that rule does to this very day. **Start over** is different: it
asks twice and takes the whole bank back to day 1.

### Click to inspect

Click a department, a desk or a person. The drawer on the right shows the desk's team, queue, live activity stream, alerts
and counters, with a button to call in temporary cover. Every desk has **Explore** buttons for the processes that run through it.

The drawer scrolls on its own (`overflow-y: auto`, `overscroll-behavior: contain`, a styled scrollbar track), and wheel and
pointer events that start in it never reach the map or the 3D camera underneath. Drag its left edge (`col-resize`) to make it
anywhere from 360 to 600 pixels wide; the width is remembered, and the ledger drawer moves over to make room.

The drawer floats over the map (`absolute right-0 top-0 bottom-0 z-40`, a solid `bg-slate-900/95` with `will-change:
transform`, no backdrop blur). The map keeps its full width underneath, so opening and closing it does not resize the 2D
canvas or the 3D canvas and nothing is laid out again. Both map containers are `React.memo`, and every part of the inspector
and the 3D scene reads the store through one-value selectors, so only what changed re-renders.

### The Live Double-Entry Mini Ledger

Press **Ledger** in the clock bar (the dot is green while the day's books agree). Every payment that finishes posts balanced lines:

* a card approval holds the money (*Customer CASA / Credit Line / Prepaid Wallet Hold* against *Card Settlement Clearing Payable*);
* a decline releases it; Pay-in-4 books the receivable;
* the night run settles each approved payment with the scheme, parks a break in *Reconciliation Suspense*, and a clerk's
  clearing pays it back out.

The drawer shows the latest payments, newest first, each with its debit and credit and a *Balanced* badge, and the **trial
balance for the whole day**. Each day keeps its own book; yesterday's suspense is carried, not re-posted.

### The Academy (Learn & explore)

**🎓 Academy** in the header opens the **Course Catalog**: one card per chapter with its title, a difficulty tag, the estimated
number of steps (counted from the real tour plans, as the fewest and most any example takes) and one line in plain English.

| Chapter | Title | Difficulty | Where it happens |
| --- | --- | --- | --- |
| 1 | Virtual Card Tokenization & dCVV Masking | Beginner | Virtual Cards Gate, Token Vault, dCVV Verification, ledger |
| 2 | 3-D Secure 2.x Risk Engine (Frictionless vs Challenge OTP) | Intermediate | E-Commerce Gate, 3DS Risk Desk, the customer's phone, ledger |
| 3 | BNPL Pay-in-4 Underwriting & Card Fallback | Intermediate | E-Commerce Gate, Pay-in-4 Underwriting, ledger |
| 4 | EOD 3-Way Reconciliation & Suspense Accounting | Advanced | Batch Clearing, Visa Settlement, 3-Way Reconciliation, Suspense Account |
| 5 | Instant Account-to-Account Transfers (A2A & pacs.008) | Intermediate | A2A Transfer Gate, Debit CASA |
| 6 | AML Screening & Chargeback Dispute Resolution | Advanced | 3DS Risk Desk (screening and case work), 3-Way Reconciliation (disputes) |

Chapter 6 has two stories, each walked on its own real diagram (the Build Lab's level 9 and level 10 reference diagrams):
pick an example starting "AML:" or "Dispute:". Its desks are the existing 3DS Risk Desk and 3-Way Reconciliation desk, so
the bank has no extra stations for it.

**Start Chapter** closes the catalog and begins the walkthrough in whichever view you are in: everything the chapter does not
use dims, the speed locks to 0.25x, and the **Walkthrough Dock** opens along the bottom (previous, auto-play, next, a dot per
step, the quiz score, the example picker, exit). You pick an example payment and step through it; a card at each desk says
what it does, why it matters, and what happened to this payment, and every decision is gated by a question.

* **2D:** a spotlight glow on the desks and wires in play, the rest of the map dimmed, and a token riding the wires.
* **3D:** the daylight dims, every desk of the chapter gets a soft ring of light on the floor (the current one pulses, real
  pools of light fall on the nearest), a glowing token travels the floor lanes, and the orthographic camera dollies over the
  desks in play and orbits a little towards them at each step. Reset view returns to the current step; exiting glides home.

You can switch between 2D and 3D mid-walkthrough; it carries on at the same step. While a walkthrough runs, clicking a desk
moves the token there instead of opening the inspector.

The **Learning Hub** adds the rule dials (dCVV validity window, frictionless line, reject line, Pay-in-4 minimum score, minimum
down payment, reconciliation tolerance) and **What happens to tomorrow?**, which plays the next day twice, once with the bank's
rules and once with yours, and lines up the numbers. **Apply to the bank** adopts the rules.

### Saving

The bank is saved in this browser at the start of each day. Keys: `processcraft:v1:bank`, `processcraft:v1:prefs` (Expert or
Concept Explorer, 2D/3D), `processcraft:v1:ui` (3D label mode, inspector width) and `processcraft:v1:view` (which half you were on). **Start over** in the clock bar asks twice. A damaged or outdated
save is validated and ignored, never trusted.

## Build Lab reference

### Saving your work

The canvas saves to `localStorage`, one slot per level (`processcraft:v1:diagram:<levelId>`, `processcraft:v1:active-level`), about
0.4 s after you stop editing. **Reset to Starter Graph** clears this level's saved copy (it asks twice). Corrupt or outdated saves are
rebuilt against the current node catalog and the level's locked starter nodes; what no longer fits is dropped and you are told.

### Watching a replay

Pick a visible test, press **Play** (or **Step**) and choose a speed. Tokens glide along the wires; desks react: a working desk
pulses, a congested one shakes, a deadlocked join freezes over, approved fraud flashes crimson, and a dead end shreds the token.
Operating-system "reduce motion" is respected.

### Using the canvas

| Do this | To get this |
| --- | --- |
| Drag a card from the palette, or press **+** on it | A new node (the palette shows what the level allows and how many are left) |
| Drag from a node's right handle to another node's left handle | A wire. Illegal wires are refused with a reason |
| Click a wire or its pill | The condition editor (wires leaving a *Decision (XOR)*) |
| Click a node | Its name, settings and (for A2A nodes) the `pacs.008` message |
| **Play** / **Step** | Watch one visible test travel through your diagram |
| **Submit** | Grade against every test, including hidden ones (never replayed) |

## How the pieces connect

```
 React Flow nodes + edges  ──getProcessGraph()──▶  ProcessGraph  ──▶  evaluateChallenge()
        (src/store)                                 (pure JSON)          (src/engine)
        │                                                  ▲
        └── autosave ──▶ localStorage ──decodeDiagram()────┘   (rebuilt against the catalog, never trusted)

 ProcessRunner.step() ──▶ liveSimulation.ts ──▶ node + edge components      (replay)
 ProcessRunner.step() ──▶ labTour.ts ──▶ labTourStore ──▶ LabWalkthrough     (guided tour, private canvas)
 ProcessRunner result ──▶ engine/postings.ts ──▶ GLEntry[] ──▶ ledger views  (Build Lab tab, Living Bank drawer)
 ProcessRunner plans  ──▶ sim/processes.ts ──▶ BankSimulation ──▶ BankView   (Living Bank)
```

* Money is integer cents everywhere; the screen formats it as `$` (AUD in the data).
* A ledger line is `{ id: GL-<txId>-NN, txId, debitAccount, creditAccount, amount, kind, memo }`. Every line is a debit and a
  credit of the same amount, so legal lines always balance; `isBalanced`, `trialBalance` and `everyTransactionBalances`
  check it, and `post()` refuses an illegal line.
* The tour never writes to the learner's store: it builds its own canvas store, steps that copy's runner, and publishes the
  dimming and the glowing path as `spotlight` on it.

## Layout

```
src/
  types/processLearning.ts      metamodel (graph, tests, GLEntry, dispute, AML types)
  data/
    seedChallenges.ts           node catalog, ten levels, reference solutions, CURRICULUM (six stages)
    academyLevels.ts            levels 5 to 10 and their payloads
    mentalModels.ts             the Concept Explorer analogies
    labTourCopy.ts walkthroughCopy.ts ledgerCopy.ts curriculumCopy.ts   every learner-facing sentence, as Localized tables
  i18n/locale.ts                Localized<T>, pick(): one entry per language
  engine/                       ProcessRunner, evaluator, expressions, money
    ledger.ts postings.ts       chart of accounts, trial balance; what each payment posts
    iso20022.ts                 pacs.008 build, validate, XML, rail choice
    aml.ts dispute.ts           fuzzy screening, structuring; the chargeback state machine and liability
    atm.ts                      the sidewalk ATM: PIN tries, note counting, jams
  sim/                          the Living Bank and the tours, with no React in it
    bankSimulation.ts           desks, staff, queues, night team, carry-over, KPIs, today's ledger
    processes.ts                plans each payment's route by running the real diagrams
    labTour.ts                  builds a Build Lab tour (steps, quizzes, spotlight) from a graph and a test
    spotlightPlan.ts walkQuiz.ts terms.ts   Living Bank tours, their quizzes, and the Concept Explorer glossary
    learning.ts learningAcademy.ts   the six chapters' lessons (chapters 5 and 6 in learningAcademy.ts)
    chapters.ts                 the Course Catalog: difficulty, estimated steps, one-line explanation
    scenarios.ts                the merchant stories every payment carries
    clock.ts rules.ts topology.ts traffic.ts whatIf.ts kpis.ts roster.ts narration.ts
  store/
    workflowStore.ts            Build Lab store: editing, playback, grading, autosave
    labTourStore.ts             the guided tour's own state (phase, step, answers, private canvas)
    bankStore.ts                Living Bank store: clock and scrubber, selection, Academy, hub, ledger drawer, tours
    persistence.ts bankPersistence.ts graphConversion.ts graphAnalysis.ts liveSimulation.ts
  components/
    bank/                       LivingBank, BankMap, ClockBar, LedgerDrawer, ViewControls, Inspector (the floating drawer),
                                LearningHub (Rule Lab), CourseCatalog (Academy button and modal), Spotlight, ProcessDiagram,
                                DayReportModal, timeline.ts (scrubber maths), useSpotlight.ts (tour state and timing, both views)
      office/                   the 3D diorama, loaded on demand
        Office3D.tsx            canvas, fallback if WebGL is missing, Reset view
        OfficeScene.tsx         camera rig, floor, rugs, lanes, lights, test hooks
        Desk3D.tsx desks.ts     a desk's furniture, staff, queue and pin; the L-desk and podium geometry
        Avatars.tsx             seated staff, standing and walking customers, chairs
        Dressing.tsx            walls, glass rooms, servers, plants, stanchions, kiosks
        Street.tsx AtmKiosk.tsx the pavement, kerb, road and street lamps; the two live ATM kiosks
        TourStage.tsx TourLayer3D.tsx   the 3D walkthrough: camera focus, light rings and pools, token; its cards
        tour3d.ts tourBridge.ts tourHooks.ts   the walkthrough's numbers (no React); desk positions on screen; click and badge rules
        Traffic.tsx             payments in flight (card, coins, folder) and customers walking in
        props.ts kit.ts         per-station props; the low-poly geometry kit (boxes, rounded shapes, ropes, merging)
        layout3d.ts             where everything stands, lane smoothing, partitions, camera limits (no React)
        materials.ts palette.ts shared materials and colours
        webgl.ts                is WebGL available? (the 3D switch checks it before loading three)
    canvas/                     ProcessCanvas, flowTypes, nodes/, edges/ (PathTraveller moves tokens on the compositor), tokens/
    education/                  GuidedWalkthrough (Living Bank bar), LabWalkthrough + LabCards (Build Lab tour), MentalModelCard
    ledger/                     LedgerView (journal + trial balance, shared by both halves)
    sidebar/ inspector/ evaluation/
  App.tsx  main.tsx  index.css
```

## Tests

`npm test` runs 37 files with 1121 tests.

| Area | Files (tests) | Covers |
| --- | --- | --- |
| Engine | `processRunner` (56), `evaluator` (52), `ledger` (18), `iso20022` (23), `aml` (21), `dispute` (24), `academy` (61), `atm` (9) | The runner and every capability; grading; double entry; pacs.008; screening; the dispute machine; levels 5-10 with a flawed diagram for each trap; ATM PIN tries, note counting and jams |
| Build Lab | `workflowStore` (70), `persistence` (44), `liveSimulation` (36), `graphAnalysis` (6), `labTour` (33), `labTourStore` (31) | Canvas store, saving, replay looks, and the guided tour (steps, quizzes, spotlight, private canvas) |
| Living Bank | `bankSimulation` (64), `bankLedger` (11), `processes` (29), `support` (35), `learning` (86), `spotlightPlan` (144), `chapters` (6), `scenarios` (9), `nightRota` (9), `terms` (13), `termsLabels` (11), `bankStore` (83) | The day, its ledger (balanced at every beat, unique ids), routing incl. A2A and the ATM, merchant labels on moves, queues, logs and ledger entries; the six chapters and the catalog; tours and quizzes in both diagrams of chapter 6; Concept Explorer and the no-stutter check over every label; the Academy, the scrubber, label mode and inspector width in the store |
| Screens | `layout` (8), `dayReport` (5), `placeCallout` (6), `timeline` (6), `layout3d` (46), `tour3d` (13), `kit` (10) | Map and office coordinates (incl. the A2A wire into Debit CASA), report tips, callouts, the scrubber's maths; the 3D office's lanes, street and ATM alcove, doorways, surge, typing and slump rules, camera limits; the 3D walkthrough's camera framing, light pools and token path; the geometry kit |

## Adding Vietnamese (or any language) later

The screens are English-only today, on purpose. Every table of learner-facing words is typed `Localized<...>`
(`Record<Locale, T>`), so a second language is a data change:

1. In `src/i18n/locale.ts`, change `LOCALES` to `['en', 'vi'] as const`.
2. Run `npm run typecheck`. The compiler lists every `Localized` table that still lacks a `vi` entry.
3. Fill them in. Components read their words through `pick()`, so nothing else changes.

Until a table has a `vi` entry, `pick()` falls back to English, so the app never shows a hole.

## Known limits

* Saved work lives in one browser on one device (no accounts, no sync).
* `REFERENCE_SOLUTIONS` is bundled into the browser build, and the Living Bank runs on those same diagrams, so the answers
  are readable in the developer tools. Move them server-side before real learners use this.
* Instant transfers and ATM cash do not go through the Visa night cycle (they settle on their own rails), so the night
  reconciliation only ever sees card payments.
* The 3D office draws about 65,000 triangles. A laptop with integrated graphics is fine; software WebGL (a VM with no GPU) is
  slow, and the pixel ratio is capped at 1.5 to protect weak GPUs.
* Money is shown in `$` (AUD in the data). The brief used đ; changing the symbol is `engine/money.ts` and the copy tables.
* The bank is a teaching model, not a calibrated one: prices, fees, fraud rates and staffing are plausible round numbers.
* Animations and screens are checked by unit tests of the state they draw from, and by hand in a browser. There are no
  automated visual tests.
