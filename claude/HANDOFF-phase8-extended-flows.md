# Phase 8 Step 1 handoff: extended flows, checkpoint interceptor, compliance desks (2026-10-24)

Branch `phase8-extended-flows`, based on `phase7c-i18n-sdk` at `434a1f2` (already merged to `main` as PR #10).

Verification:
- `npm run build` clean (tsc + Vite), 0 .map files.
- `npm test`: 67 files, 1350 tests (was 66 / 1324; +24 in `sim/__tests__/amlEngine.test.ts`, +2 elsewhere).
- Playwright on `vite preview` at 1440×900, 0 console errors: Advanced 2D and 3D render the new wing; flow 07 preset `Pay $780 by VietQR` routes QR → FacePay → FDS → Debit CASA → Approved with `Dr 2010 / Cr 1410`; AML desk inspector shows the new metrics and tips in EN and VI.

## File names in the brief vs the repo
| Brief | Repo |
|---|---|
| `src/sim/mapLayout.ts` | `components/bank/layout.ts` (2D), `office/officePlan.ts` (3D), `sim/topology.ts` (stations, wires) |
| `Office3D.tsx` | `office/OfficeScene.tsx` (unchanged), placement in `officePlan.ts` / `layout3d.ts` |
| `src/sim/amlEngine.ts` | **new**, the interceptor. `sim/amlMonitor.ts` (the AML panel's alert scan) is untouched and now also sees large teller and SWIFT payments |

## 1. Stations (`sim/topology.ts`, `sim/nodeKind.ts`)
- 8 stations appended (older staff keep their names), 3 departments, 21 wires.
  - **ENTRANCE**: `GATE_EKYC`, `GATE_QR`, `TELLER_CASH`, `SEC_FACEPAY`
  - **COMPLIANCE**: `SEC_FDS`, `AML_DESK`
  - **BACKOFFICE**: `GATE_SWIFT`, `DISPUTE_DESK`
- Automated (16): + eKYC, QR, FacePay, FDS, SWIFT. Human (8): + Teller, AML, Disputes. Same presentation-only rule as 7C.
- New families `ekyc qr teller biometric fds aml dispute swift`. eKYC, FacePay and FDS workers are AI engines (`eKYC Identity Bot #01`, …), QR and SWIFT run gateway clusters.
- `StationDef.digital` marks app-only gates (no door, queue of phones in 3D).
- Academy links: AML, Disputes, FDS, eKYC, Teller → chapter F; QR, SWIFT → E; FacePay → B (was the A/B fallback).

## 2. Interceptor (`sim/amlEngine.ts`)
- New kinds `ONBOARD | QR | TELLER | SWIFT | DISPUTE` route through `planExtended` (from `planCheckout`). Card, A2A and ATM flows are unchanged.
- Order: eKYC / FacePay (> $400 = 10M VND) → FDS (device score, runs the automated AML screen) → AML desk only when flagged → Debit CASA.
- Reason codes: `EKYC_LIVENESS_FAILED`, `BIOMETRIC_AUTH_REQUIRED`, `FDS_HIGH_RISK_DEVICE`, `AML_SANCTION_MATCH`, `AML_STR_BLOCKED`, plus `QR_PAYLOAD_INVALID`, `SWIFT_INVALID`, `TELLER_VAULT_LIMIT`, `TELLER_SUSPECT_NOTE`, `DISPUTE_REJECTED`. `STR_PENDING` is the screen verdict of a held payment.
- Real formats: VietQR is built and parsed as EMVCo TLV with CRC-16/CCITT-FALSE and mapped to an ISO 8583 0200; SWIFT checks pacs.008 fields with the existing `BIC_PATTERN`; sanctions use `engine/aml` name similarity (match at 85, so `Victor Volkanoff` hits).
- Postings: 2 accounts (`1012 Teller Vault Cash`, `1430 Correspondent Nostro`) and 6 posting kinds. A frozen payment goes to `2510 AML Restrained Funds`.
- Traffic: a third random stream (`arrivals-phase8`), ids in free blocks 2001–4999, so every existing customer of every seeded day is unchanged. Day events scale the new channels (fraud ring, payday, flash sale).
- KPIs: `kpis.ext`, 10 decline reasons in the report (new group "Identity & compliance"), CSV channel types.

## 3. Map, 3D and flows
- 2D: a two-row band under the bank (stage 1320×900 → 1320×1264). Ledger-bound wires share one trunk at x 884 into Debit CASA; declines climb a gutter at x 1305 into Declined.
- 3D: the same band is a wing inside the front of the building (building 810 → 1180 deep, ATM moved down with the pavement). Hand-placed props are shifted by `LEGACY_Z`.
- Guided flows **05 eKYC Onboarding, 06 Teller Cash & CTR, 07 VietQR & FacePay, 08 SWIFT & Disputes**, each with presets (9 new). The flow bar is now two rows of four.

## 4. Inspector
- Per-desk metric rows with their own tips (`StationStats.lines[].tip` → `inspectorTips.messages.ts` `line_<tip>`), e.g. OCR matching, liveness pass rate, fake-ID rate, vault cash balance, suspect serials, CTR filed, STR flagged, suspicious ratio, review latency, sanctions matches, chargeback SLA, pacs.008.
- All copy in bundles or `viDictionary`; no new inline `tr()` pairs. `noLeak` and `enDataPurity` pass with the new channels.

## Judgment calls to review
- **Advanced whole-map fit drops from about 71% to about 51%** at 1440×900 because the stage is taller. The Phase 1A landscape test now checks the core grid above the band.
- Flows 05–08 cannot zoom in much: Debit CASA is at the top of the map and the band is at the bottom.
- Teller CTR is automatic and does not hold the cash; only STR reasons (PEP, structuring, cross-border ≥ $10,000) go to the AML desk.
- A mule account that gets through onboarding books a $500 expected loss (`MULE_ACCOUNT_LOSS_CENTS`), so "fraud approved" always costs something.
- `taskPlace` still seats the Academy's AML and dispute diagram nodes at the 3DS and Recon desks.

## Next
- Consider a band-local CASA posting desk so flows 05–08 can zoom.
- 3D props for the new desks reuse existing ones (strongbox for the till, network for FDS/SWIFT).
