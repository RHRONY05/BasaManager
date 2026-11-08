# BasaManager — design brief (V2)

Designed autonomously by the designer agent (Opus 5.5) on 2026-11-08. There is no human approval gate:
every place where `design-canvas` / `ui-ux-pro-max` would ask the user, the decision and its reason are
written here (§ Decisions log). The reviewer agent reviews this instead of the user.

## Who it is for
- **Landlords**, often 40–65, on a desktop at home or a mid-range Android (360 px wide is common). They
  check money, approve things, and settle disputes with tenants. They are not "power users"; they want to
  be sure.
- **Caretakers** on a phone in the building: enter meter readings, confirm cash, update requests.
- **Tenants**, mostly on a phone: what do I owe, why, pay, get a receipt, report a leak.

## Direction
**"A calm, exact rent ledger."** The app is the landlord's khata (the account book every Bangladeshi
shop and landlord keeps) made trustworthy: warm paper, dark ink, one teal accent, and every amount laid
out like a well-kept ledger line.

**Adjectives:** trustworthy · calm · exact

**NOT list**
1. Not a SaaS dashboard: no purple/blue gradients, no glassmorphism, no glowing charts, no "AI" sparkles.
2. Not a fintech/crypto app: no neon on black, no gamified badges, no confetti about money.
3. Not a real-estate listing site: no luxury serif + gold, no stock photos of buildings or smiling families
   (that's BasaKhoj's world, and it is out of scope).

**Signature element — the double-ruled total.** Wherever money is summed, it is shown as a ledger
(`.ledger`, React `<LedgerSum>`): each line has a label, a dotted leader and a right-aligned figure, with
its explanation underneath ("1,240 → 1,395 = 155 units × ৳9.00"); the total sits under a single rule and
is underlined with the accountant's **double rule**. It appears on the tenant due card, bill detail
(landlord + tenant), the lease-new review step (first bill preview with proration), the pay summary, the
pay result receipt and the settlement preview. The brand mark repeats it once: a house outline standing on
a double rule. Nothing else in the UI uses double rules.

**Voice:** plain, short, polite Bangladeshi English. Numbers first, then the reason. Buttons say what
happens ("Pay ৳16,475", "Confirm ৳9,500 from Sharmin", "Issue 9 ready bills"). Never blame the user;
errors say what happened and what to do. No exclamation marks except in "Paid".

## Visual system (see tokens.css for values, README for the table)
- **Colour:** warm paper canvas (`--bg-app`), white surfaces, green-tinted ink. Accent **Karnaphuli teal**
  (`--accent-primary`, named after Chattogram's river) for primary actions, active nav and selection only.
  Status tones (success / warning / danger / info / neutral) are separate hues from the accent and always
  come with an icon + word. 60-30-10: paper 60, white cards 30, teal + status 10.
- **Type:** Atkinson Hyperlegible Next (UI + numbers), Atkinson Hyperlegible Mono (IDs, TrxIDs, receipt
  numbers, meter readings), Noto Sans Bengali (loaded for i18n, and supplies the ৳ glyph). Weights 400 / 600
  / 700. Body 16 px everywhere. Tabular numerals for every amount, date and count.
- **Shape:** "soft but firm" radii (6 inputs, 10 buttons, 14 cards, 20 hero card / sheets). Hairline borders
  for structure; shadows only on things that float (due card, drawer, dialog, toast).
- **Density:** staff desktop pages are moderately dense (tables, 14 px cells, 44 px rows); tenant pages breathe.
- **Icons:** Lucide (`lucide-react` 1.70 names), 16 / 20 / 24, stroke 2, `currentColor`.

## Scope — artboards
Every screen in task V2 at **1440 (desktop)** and **390 (mobile)**, light + dark, mobile also audited at 360
and 320. Stress variants (longest names, ৳1,25,00,000, `en-XA` pseudo-locale) for the five busiest mobile
screens. File list and routes: README.md.

| Group | Screens |
|---|---|
| Public & auth | Landing, Login (mobile shows the error state), Signup, Invite accept |
| Landlord | Dashboard, Dashboard first-run, Building detail (Units tab; desktop shows the unit drawer), Lease new (review step), Lease detail, Billing drafts, Billing readings, Bill detail, Payments pending claims, Maintenance board + detail drawer, Notices, Admin organisations |
| Tenant | Home (due · all paid · overdue), Bill detail, Pay result, New request, Request detail |
| Shared | Account |
| Sheets | `kit.html` (every component in every state), `states.html` (pending / refreshing / error / empty for every data region, plus offline, reconnecting, toasts, dialogs, shortcuts) |

## States designed
Populated on every artboard. Empty, pending skeleton, refreshing, error for every data region in
`states.html`. Error on mobile login. Due / all-paid / overdue for tenant home. Paid for pay result on both artboards;
checking / failed / cancelled / still processing in states.html.
First-run for the dashboard. Long/overflow content in the stress variants.

## Motion
Personality **calm**: durations ×1.25 of the design-canvas defaults, no spring/overshoot, fades and short
slides only, everything off under `prefers-reduced-motion`.

| Moment | Spec |
|---|---|
| Button press | `scale(0.98)` over `--dur-instant`; pending state in the same frame (spinner replaces icon, label kept) |
| Navigation | URL + active nav change instantly; content area shows the route skeleton; 2 px top bar after 150 ms |
| Payment confirmed (staff confirms a claim) | the row fades out `--dur-normal`; the tenant's due card crossfades to the new amount; the total's double rule draws left→right `--dur-slow --ease-out` (the one "delight" moment, tied to the signature) |
| Real-time update (socket) | changed row/comment background flashes `--highlight` and fades over 1.2 s |
| Sheet / drawer | enter translateY(16px)/translateX(24px) + opacity, `--dur-slow --ease-out`; exit `--dur-normal --ease-in` |
| Tabs | underline slides between tabs `--dur-normal --ease-in-out` |
| Toast | slide 12 px + fade in, auto-dismiss 5 s, exit fade `--dur-fast` |
| Skeleton | shimmer 1.4 s loop; static under reduced motion; appears only after 150 ms on fast responses |

## Decisions log (made by the designer instead of asking; reviewer may challenge any of them)
1. **Folder format = plan-for-agent-build design pack** (`desktop/`, `mobile/`, `ui.css`, `index.html`,
   `states.html`, `mock.js`) because 08-TASKS V2 names those files; design-canvas's `canvas.html` /
   `kit.css` are replaced by `index.html` / `ui.css`. The design-canvas critique log lives in `review.md`.
   The manifest `screens.js` uses design-canvas's `window.CANVAS` shape so `shoot.mjs` reads it unchanged.
2. **Token names keep V1's families** (`--bg-app`, `--bg-surface`, `--fg-default`, `--fg-muted`,
   `--border-default`, `--accent-primary`, `--accent-fg`, `--danger-primary`, `--size-tap`,
   `--size-bottom-nav`, `--width-content`, `--space-*`, `--text-*`, `--radius-*`, `--dur-fast`,
   `--dur-normal`, `--ease-default`) so `globals.css`'s `@theme` keeps resolving; new tokens extend the same
   families (`--fg-secondary`, `--border-strong`, `--success-*`, `--warning-*`, `--info-*`, `--neutral-*`,
   …). Changed values: `--size-bottom-nav` 56 → **64** (icon pill + label + 8 px breathing room; still ≥ 56),
   `--radius-md` 8 → 10, `--radius-lg` 12 → 14, `--dur-normal` 250 kept. No V1 token was renamed.
3. **Accent teal, not green, not blue.** Green is "paid" and must stay unambiguous; blue is "issued /
   info". A deep teal (hue ≈ 185°) is distinct from both, reads as calm and trustworthy, and has 7.9:1
   with white. Research (`ui-ux-pro-max --design-system`) suggested teal + glassmorphism for "property
   fintech"; the teal was kept, glassmorphism rejected (NOT list).
4. **Warm paper canvas** instead of cool grey: echoes the paper khata, makes white cards read as "sheets
   of the ledger" without heavy shadows. Neutrals are tinted green-grey to sit with the teal.
5. **Atkinson Hyperlegible Next** instead of the design-pack default Inter (banned as a reflex font by
   craft.md): it was designed by the Braille Institute for low-vision readers, distinguishes 1/l/I and 0/O
   (matters for TrxIDs like `9ABCD1EFGH`, receipt `BM-2026-000123` and amounts read by 60-year-olds),
   has tabular figures, and is OFL. Bangla partner **Noto Sans Bengali** (variable 400–700, OFL) — the most
   complete Bengali family on Google Fonts, similar x-height and stroke contrast; it also renders ৳ (U+09F3)
   which Atkinson lacks, so ৳ always comes from the same font. Hind Siliguri was considered and rejected:
   fewer weights and its Latin would compete with Atkinson. All three get self-hosted woff2 later.
6. **One family, no display serif.** Hierarchy comes from size and weight; the bold typographic moment is
   the hero amount. A second display face would add noise and bytes for older Android phones.
7. **Mobile staff bottom nav = Home · Billing · Payments · Requests · More** (≤ 5, one word ≤ 10 chars;
   "Maintenance" is 11 chars so the tab says "Requests"; sidebar keeps "Maintenance"). More sheet: Buildings,
   Tenants, Notices, Team, Reports, Settings, Account. Caretaker: Today · Billing · Payments · Requests ·
   Notices (exactly its 5 nav items from 06-UI).
8. **Tables become card lists below md**, except the readings grid, which is a deliberate horizontal scroll
   container with a sticky first column on mobile (mobile-layout-qa allows exactly this).
9. **Maintenance on mobile is a list with status chips**, not a board (06-UI), and the detail is a full page
   (`/l/maintenance/:id` behaviour inside the drawer route) rather than a sheet, so the comment box has room
   above the keyboard.
10. **Priority** has three levels from 03-DATABASE (`low`, `normal`, `urgent`); only urgent is loud
    (danger tone + siren icon); normal/low are quiet text tags. Age turns warning-coloured after 3 days.
11. **Controls are 44 px tall on desktop too** (not 36–40) because the landlord audience skews older; 36 px
    compact buttons exist only inside desktop table rows.
12. **Overdue is shown, never stored** (07-BILLING): the badge is derived; the tenant due card gets a red
    strip with "Overdue since 10 Nov · late fee ৳374 added on 13 Nov", so the fee is explained, not just added.
13. **Landing illustration is the product itself** (a live-rendered due card + ledger), not an image or
    stock photo; no testimonials, no user counts (we have none).
14. **Dark theme is designed, not inverted:** surfaces get lighter with elevation, accent lightened to
    `#4db5b7` with dark text on it (6.98:1), danger buttons use dark text on a light red, shadows are pure
    black at low alpha.
15. **Stress variants use the en-XA pseudo-locale via `mock.js`** (same transform as the app's
    `pseudo-locale.ts`), applied to UI strings only; user data (names, addresses) is marked `data-user` and
    kept as the stress fixture's real values.
16. **Sample content** is one consistent world: org *Chowdhury Properties* (landlord Farhana Chowdhury);
    buildings *Shanti Neer* (Nasirabad, 12 units), *Karnaphuli View* (Agrabad, 8 units), *Hill Crest*
    (Khulshi, 6 units); caretaker Jamal Uddin; tenant Nusrat Jahan in Shanti Neer 4A. Every amount adds up
    (see README "Sample numbers"). It is not seed data.
17. **Gallery = `index.html`** with a light/dark/system switch, auto-measured iframe heights, served with
    `python -m http.server`; screenshots and audit output go to the designer's scratch folder, never the repo.
18. **Billed vs collected is one column per month, not two bars.** The column (outlined track) is what was
    billed, the teal fill is what was collected, the collection rate is printed on top. The dataviz
    palette validator failed a two-hue teal pair (chroma/lightness band), and the real question a landlord
    asks is "how much of what I billed came in", so one measure shown as part-of-whole needs no categorical
    palette and reads in greyscale. Y axis in lakh (৳1 lakh … ৳5 lakh), which is how BD landlords count.
19. **Admin on mobile has no bottom nav** (it has only two destinations); System health is a link on the
    Organisations page. Admin is a desktop task; the mobile artboard proves it still works.
20. **Artboards are generated from sources** (`tools/src` + `tools/build.py`) so the sidebar, top bar and
    bottom nav are byte-identical on every screen; stress variants come from `tools/stress.py`, the states
    sheet from `tools/states.py`. The generated HTML in `desktop/` and `mobile/` is the spec.
21. **Google sign-in mark keeps Google's colours** as four `--google-*` tokens (Google's branding rules
    require the coloured G); they are used nowhere else.
22. **Mobile building/unit rows show this month's bill status** (Overdue, Claim, Part paid, Paid), the
    desktop units table shows lease status plus dues. On a phone the money question comes first.
23. **Desktop tables keep 36 px compact buttons** (`btn--sm`) because the desktop touch rule is 24 px and
    rows stay scannable; mobile never uses them.
24. **Pages in 06-UI without an artboard** reuse named patterns (README, "Screens"), so implementers never
    invent layouts: e.g. `/t/pay` = ledger + MoneyInput + "Continue to SSLCommerz".
