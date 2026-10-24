# Phase 7C handoff: language leak fix, i18n SDK, terminology polish, Welcome modal switcher (2026-10-24)

Branch `phase7c-i18n-sdk`, based on `main` at `587acaf` (PR #7 / `phase7b-nav-search` is already merged, so 7A, 7B and 6 are all in the base).

Verification:
- `npm run build` is clean (tsc and Vite).
- `npm test` passes: 59 files, 1288 tests (was 55 / 1263; +25 tests).
- **Not run this session:** a Playwright or browser pass. The modal is covered by a server-render test in both languages, not by a real click-through.

## 1. Vietnamese leaks in English mode

**Root cause (one mechanism, many symptoms).** Simulation code called translators while *writing* state. `scenarioLabel()` read the active locale, and `bankSimulation.ts` baked the result into log lines, move labels, queue rows and the ledger title map. The English templates then wrapped a Vietnamese name, so a language switch showed `Debiting ⚡ Chia hóa đơn qua QR ($18.50) from the account…`. The same call fed `audit.ts`, `transactionsCsv` and the AML alerts, so the CSVs and the SAR narrative were also locale-dependent. `liveSimulation.detectAlarms` did it with `tr()`.

**Rule now.** The simulation, stores and exports write canonical English only. Screens translate at display.
- `sim/scenarios.ts`:
  - New `scenarioLabelEn`, `scenarioShortEn` and `scenarioTitleEn`. These are the only scenario names sim and export code may use.
  - New `localizeScenarioText(text, locale)`. It works both ways (EN to VI, and VI back to EN for any stale text), longest name first.
  - `scenarioLabel`, `scenarioShort` and `scenarioTitle` remain as display helpers.
- **Second bug found along the way:** the old `feedVi.scenarios()` replaced names in insertion order, so `Practice Swipe, Big Basket` came out as `Quẹt thẻ luyện tập, Big Basket`. Fixed by the longest-first single pattern.
- Write sites moved to English: `bankSimulation.ts` (4), `narration.ts`, `audit.ts`, `amlMonitor.ts` (2), `reportSummary.ts`, `liveSimulation.ts` (3 alarms).
- Display sites now localize: `Inspector` (queue rows), `BankMap` and `office/Traffic.tsx` (packet badges), `LedgerDrawer` (titles), `AmlPanel` (table, SAR narrative in each language), `feedText` (also puts a Vietnamese name back to English when the app is in English), `NodeReactions` and `workflowStore` via the new `notesVi.alarmText`.
- **Checked and already fine:** HUD toasts (they store a `kind` and translate at render), canvas edge labels (English graph data plus an overlay), `plainLanguage.ts` (every Vietnamese table is behind a locale check), no `t()` / `tr()` / `pick()` evaluated at import time.
- **The brief named `mockData.ts`. It does not exist in this repo.**

**Guards (all fail if the bug returns):**
- `i18n/__tests__/noLeak.test.ts` plays days 1, 2 and 3 in Vietnamese and asserts the raw sim output (moves, queues, feeds, alerts, worker activity, ledger titles, CSVs, audit, AML) has no Vietnamese. Also asserts English display of baked text and Vietnamese display with no English name left. I confirmed it fails when one write site is reverted.
- `i18n/__tests__/enDataPurity.test.ts` walks every exported table in `data/`, `sim/`, `engine/` and `types/` (about 12.5k strings) and fails on Vietnamese outside an `{ en, vi }` pair or a `*VI` / `*Vi` export.
- `hasVietnamese()` ignores French-style accents on purpose, so `café` passes.

## 2. i18n SDK: `src/utils/i18nHelper.ts`

One import for a feature. The file header has the decision table.
- `defineMessages(id, { key: { en, vi } })` plus `useMessages(bundle)`. Both languages are required by the compiler, `{name}` placeholders, bundles are registered.
- `format`, `formatNodes` (React nodes inside one translatable sentence, for example `Press {key} to skip`), `tf` (dictionary label with values), `plural` (Vietnamese has no plural), `useI18n`, `LOCALE_META`, `LOCALE_OPTIONS`, `hasVietnamese`. It re-exports `t`, `tr`, `pick`, `useLocale` and `setActiveLocale`.
- Tests: `utils/__tests__/i18nHelper.test.ts`. A registry test checks every shipped bundle: nothing empty, same placeholders in both languages, no Vietnamese that is just the English copied.
- `dictionary.test.ts` now scans `tf('…')` as well as `t('…')`.
- `inlineBudget.test.ts` plus `inlineBudget.json`: **330 inline `tr({en,vi})` pairs in components are budgeted, and a file can only go down.** New copy fails CI unless it goes in a `*.messages.ts` bundle. I migrated only the files I touched (`WelcomeModal`, `LanguageToggle`). The rest of the 330 is not migrated; lower or delete a file's entry when you do.
- `useLocale` now reads the live snapshot for the server render too (zustand returned the initial state there). No effect in the browser; it is what makes server-render tests honest.

## 3. Terminology (your five phrases, used exactly)

| Where | New text |
|---|---|
| `academyVi` 5.1 | Giao dịch nhận tiền chuyển khoản nhanh (Incoming Transfer) |
| `academyVi` 5.2 | Nộp tiền mặt tự động (ATM/CDM Deposit) |
| `academyVi` chapter 5 | Chuyển tiền nhanh tài khoản (Account-to-Account / A2A) & ISO 20022 |
| `learningVi` 3DS lesson | Bộ máy rủi ro 3-D Secure 2.x: Xác thực liền mạch (Frictionless 3DS) vs Thử thách OTP (Challenge Flow) |
| `learningVi` tokenisation lesson | Mã hóa thẻ ảo (Tokenization) & Mã CVV động |

- Your brief said `Thử thách mã SMS`; the code said `Thử thách OTP`, so the change is on the OTP wording.
- Scenario titles: `i18n/dayScenarios.ts` holds the two names, read by `ChaosPanel` and by the Ops feed announcements. Vietnamese is exactly as you gave it. **English titles are unchanged** (`Day 2: Flash Sale Traffic Spike`, `Day 3: Botnet CVV Brute-Force & Staff Fatigue`). The Vietnamese titles carry no "Ngày N" prefix; the panel subtitle still shows the day.

**Judgment calls to review:**
- **`không ma sát` became `xác thực liền mạch` everywhere it names the flow (38 places: lessons, challenge test names, catalog labels, feed, quiz).** It follows your wording but goes beyond the five listed strings. `viDictionary` `"Frictionless"` is now "Xác thực liền mạch".
- `Cổng chuyển khoản A2A` (desk name and lesson subtitle) became `Cổng chuyển tiền nhanh (A2A)`. I kept it short for a desk label.
- Generic "ma sát" meaning friction (lost sales) is left alone.

**English pass.** Spelling is now en-AU in learner text, in 45 string literals found through the TypeScript AST (strings with spaces and no Vietnamese only, so ids and enums were untouched): tokenisation, authorisation, instalment. Five loose lines were reworded (the balance-check tip, the one-time-code tip, the settled-money tip, one mental-model line, one chapter blurb), mainly `really` to `actually` / `finally` and `a lot of` to `many`. The rest of the English corpus scanned clean for repeated words, filler and spacing; I did not rewrite it for taste.

## 4. Welcome modal switcher

- `LanguageToggle` takes `variant="globe"` and `testId`. The modal shows `[🌐 EN | VI]` top-right, test ids `welcome-language`, `welcome-language-en` and `welcome-language-vi`. The header toggle keeps `language-toggle`.
- All modal copy is in `components/bank/welcomeModal.messages.ts` (badge, title, intro, three cards, Recommended / Current pills, the Esc hint as one sentence with a `<kbd>` placeholder, Skip). Clicking the toggle does not close the modal.
- Tested by server render in both languages: every element present in each, none of the other language.
- The intro and the Sandbox and Academy card descriptions are reworded slightly (semicolons and colons removed). The intro was tightened in Vietnamese too; the card titles are unchanged.

## How to add text now
- Component copy: a `*.messages.ts` bundle and `useMessages`.
- Fixed label: `t('English')` plus a `viDictionary` entry. With values: `tf('Day {n}', { n })`.
- Simulation, store or export text: English only. A new log template needs a rule in `feedVi.ts`; a new engine note needs one in `notesVi.ts`.
- A new scenario needs a title in `SCENARIO_TITLE_VI`; names are translated at display.

## Notes
- Existing saves hold numbers only, so no stale Vietnamese text can come out of storage.
- 3D and 2D smart-zoom behaviour from 7A and 7B is untouched.
- Open: migrate the remaining inline pairs in components (largest: `AmlPanel` 53, `DayReportModal` 33, `LessonView` 25, `AcademyStudy` 23, `ChaosPanel` 22).
