# Critique log (design-canvas `references/critique.md`)

Every artboard went through: build → `tools/check.mjs` (shoot.mjs checks light + dark, `auditLayout()` at
390 / 360 / 320 light + dark for mobile, 1440 for desktop) → look at the PNG (contact sheets) → score →
fix. Pass = no criterion below 3, average ≥ 4.0, zero automated errors. Scores are per screen (desktop +
mobile judged together; where they differ the lower one is logged). Order of criteria:
direction · hierarchy · spacing · type · colour · consistency · states · device · content · anti-slop · motion.

Status: all screens **review** (passed self-critique). Only the reviewer agent can approve.

## Kit-wide fixes found by the loop (apply everywhere)
- Ledger leader started after the explanation width → explanation moved to the row's last child spanning the row (`width:0; min-width:100%` so it adds no intrinsic width).
- Headings inherited browser sizes (push card title was 24 px) → headings sized by class only.
- Bell count inside the button pushed the icon off-centre (`label-not-centred`) → count is a sibling.
- Tab / nav counts in 12 px next to 14 px labels counted as a wrapped label → counts use the label size.
- `.btn--link` "All" was 30 px wide → every `.btn` has `min-width: 44px`.
- `.sr-only` table header text reported as clipped → `aria-label` on the `th`.
- Desktop breadcrumb link "2B" 16 px wide → crumbs are 24 px min targets.
- `plus-minus` icon exists in lucide-react only as an alias, not in the UMD build, so it rendered empty → replaced with `diff`; the check now fails on any unrendered icon.
- Chart columns rendered 0 px tall (percent height in a grid item) and did not match the y axis → flex column, 5-lakh axis, rate label positioned above the column; redesigned as billed track + collected fill (dataviz validator, brief decision 18).
- Stress runs found: avatar initials and image placeholders were pseudo-localised (overflowed) → treated as user data; bottom-nav labels truncated without full text → `title`; building summary tiles overflowed at 360 with ৳1,25,00,000 → dues tile spans the row.

## Scores
| Screen | Rounds | Scores | Avg | Result | Notes / remaining nits |
|---|---|---|---|---|---|
| K01 Component kit | 3 | 4·4·4·4·5·5·4·4·4·4·4 | 4.2 | pass | ledger leader fix (round 2), state forcing classes only in the sheet |
| K02 States sheet | 1 | 4·4·4·4·4·5·5·4·4·4·4 | 4.2 | pass | refreshing samples are abbreviated by design |
| 01 Landing | 2 | 4·4·4·4·4·4·3·4·5·4·4 | 4.0 | pass | round 2 fixed hero/section side padding; hero illustration is the real due card (no stock) |
| 02 Login (+ error) | 1 | 4·5·4·4·4·5·4·4·4·4·4 | 4.2 | pass | error banner names the lockout rule without revealing whether the email exists |
| 03 Signup | 1 | 4·4·4·4·4·5·4·4·4·4·4 | 4.1 | pass | — |
| 04 Invite accept | 1 | 4·4·4·4·4·5·4·4·5·4·4 | 4.2 | pass | email locked to the invite |
| 05 Landlord dashboard | 3 | 5·4·4·4·4·4·4·4·5·4·4 | 4.2 | pass | chart rebuilt twice; desktop leaves some air under the chart, acceptable |
| 05 stress | 1 | — | — | audit 0 | ৳1,25,00,000 KPIs fit at 320; names wrap inside rows |
| 06 Dashboard first run | 2 | 4·5·4·4·4·4·4·4·4·4·4 | 4.1 | pass | nav counts hidden on first run (round 2) |
| 07 Building units + drawer | 2 | 4·4·4·4·4·4·4·4·5·4·4 | 4.1 | pass | badge stretched in drawer header (fixed); stress: very long names break inside a narrow column at 320 (contained, no overflow) |
| 08 Lease new — review | 1 | 5·4·4·4·4·4·4·4·5·4·4 | 4.2 | pass | proration explained line by line; water ৳216.67 rounding shown |
| 09 Lease detail | 1 | 4·4·4·4·4·4·4·4·5·4·4 | 4.1 | pass | — |
| 10 Billing drafts | 1 | 4·5·4·4·4·4·4·4·5·4·4 | 4.2 | pass | needs-reading rows marked by badge + a 3 px inset rule (not a card border) |
| 11 Readings grid | 1 | 4·4·4·4·4·4·5·4·5·3·4 | 4.1 | pass | mobile is a deliberate scroll container with sticky unit column; anti-slop 3: plain grid, intentionally |
| 12 Bill detail (landlord) | 2 | 5·4·4·4·4·4·4·4·5·4·4 | 4.2 | pass | missing `plus-minus` icon fixed (round 2) |
| 13 Pending claims | 1 | 4·4·4·4·4·4·5·4·5·4·4 | 4.2 | pass | reject needs a reason (desktop shows the open form); three primary buttons on mobile are one per claim card |
| 13 stress | 2 | — | — | audit 0 | 40-char TrxID wraps anywhere inside the dl |
| 14 Maintenance board + drawer, mobile list + detail | 1 | 4·4·4·4·4·4·4·4·5·4·4 | 4.1 | pass | board columns are narrow while the drawer is open (by design, drawer overlays) |
| 15 Tenant home — due | 2 | 5·4·4·4·4·5·4·5·5·4·4 | 4.4 | pass | round 2: push card moved below requests, heading size fixed |
| 15 stress | 1 | — | — | audit 0 | — |
| 16 Tenant home — all paid | 1 | 5·4·4·4·4·5·4·5·5·4·4 | 4.4 | pass | — |
| 17 Tenant home — overdue | 1 | 5·5·4·4·4·5·4·5·5·4·4 | 4.5 | pass | late fee explained in the strip and the ledger |
| 18 Tenant bill detail | 2 | 5·4·4·4·4·5·4·4·5·4·4 | 4.3 | pass | round 2: desktop payments table overflowed the card (receipt column) → shorter action |
| 18 stress | 1 | — | — | audit 0 | — |
| 19 Pay result — paid | 1 | 5·5·4·4·4·5·4·4·5·4·4 | 4.4 | pass | "confirmed by our server, so it is final" copy |
| 20 New request | 2 | 4·4·4·4·4·4·4·5·5·4·4 | 4.2 | pass | round 2: dropzone label centred |
| 21 Request detail (tenant) | 2 | 4·4·4·4·4·5·5·4·5·4·4 | 4.3 | pass | round 2: desktop actions moved out of the banner |
| 22 Notices | 2 | 4·4·4·4·4·4·4·4·5·4·4 | 4.1 | pass | round 2: switch accessible name, icon-btn shrink, date shown as `14 Nov 2026` |
| 23 Account | 2 | 4·4·4·4·4·4·4·4·4·4·4 | 4.0 | pass | round 2: two-line account rows inside nav marked `data-allow-wrap` |
| 24 Admin organisations | 1 | 4·4·4·4·4·4·4·4·4·4·4 | 4.0 | pass | privacy line: counts only |

## Automated results (final run)
See the designer's final report for the numbers; reproduce with
`node --experimental-strip-types .agent/design/tools/check.mjs --out <dir>` (shoot.mjs report in
`<dir>/shots/report.md`, audit report in `<dir>/audit/report.md`).
