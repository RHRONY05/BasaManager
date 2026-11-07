# 01 — Product

## The problem
In Bangladesh most landlords run their buildings from a notebook, a calculator and WhatsApp. Rent,
gas, water and metered electricity are worked out by hand every month. Partial payments and dues are
forgotten or disputed, tenants get no receipt, and maintenance requests get lost in phone calls.
Tenants never know exactly what they owe or why.

## The product in one paragraph
**BasaManager** is a multi-tenant web app (installable PWA) for running rental buildings. A
**landlord** signs up, adds buildings and units, and invites **caretakers** (staff) and **tenants**.
Every month the app builds each unit's bill (rent + fixed charges + metered electricity, prorated
for mid-month move-ins), sends it to the tenant, reminds them before and after the due date, and
adds a late fee once it's overdue. Tenants pay online through **SSLCommerz** (sandbox) or pay cash/bKash
outside the app and submit a payment claim that staff confirm. Every payment gets a PDF receipt.
Tenants raise **maintenance requests** with photos and follow them live. Landlords post **notices**
to a building, keep **tenant documents** (NID, agreement) in private storage, and see a monthly
report of what was billed, collected and is still due. A platform **admin** manages landlord accounts.

## Roles
| Role | Who | Scope |
|---|---|---|
| **Admin** | The platform operator (Rony) | All organisations' metadata. Can suspend a landlord. **Cannot** read tenant documents or financial details (privacy boundary). |
| **Landlord** | Owner of one organisation | Everything inside their own organisation. |
| **Caretaker** | Staff invited by a landlord | Only the buildings they're assigned to. Can record payments, enter meter readings, handle maintenance, post notices. Cannot change rent/charges, delete anything, see tenant documents, or invite people. |
| **Tenant** | Person living in a unit | Only their own lease(s): bills, payments, receipts, their maintenance requests, their building's notices, their own documents. |

One login (email) can be a tenant in one organisation and a landlord of another. Membership + role
is per organisation.

## User stories

### A — Accounts & auth
| ID | As a… I want to… | Notes |
|---|---|---|
| A1 | landlord, sign up with email + password and verify my email | Creates my organisation. Unverified accounts can't create buildings. |
| A2 | anyone, sign in with Google | Links to an existing account with the same verified email instead of creating a duplicate. |
| A3 | caretaker/tenant, join only through an invite link | Link is single-use, expires in 7 days, is bound to the invited email and role. No public sign-up for these roles. |
| A4 | anyone, reset a forgotten password by email | Link single-use, 30 min expiry. Resetting signs out every other device. |
| A5 | anyone, stay signed in for 30 days on my device and sign out of all devices | Short-lived access token + rotating refresh token. Reusing an old refresh token kills that whole session family. |
| A6 | anyone, be protected from password guessing | Rate limit + temporary lockout. Error messages never reveal whether an email exists. |
| A7 | anyone, switch between organisations I belong to | Org switcher; the active org is part of every request. |
| A8 | anyone, delete my account | Personal data is anonymised. Financial records (bills, payments, receipts) are kept for the landlord, with my name replaced by "Former tenant #id". |

### O — Organisation, buildings, units, staff
| ID | As a… I want to… | Notes |
|---|---|---|
| O1 | landlord, add buildings with address and map location | Map pin shown to tenants. |
| O2 | landlord, add units (label, floor, type, rent, fixed charges, electricity mode) | Types: family flat, bachelor flat, room, shop. Electricity: `none` / `prepaid` (tenant pays the utility) / `submeter` (we bill per reading). |
| O3 | landlord, set billing settings per building | Bill day (default 1), due day (default 10), late fee (flat ৳ or % of the overdue amount, once per bill), grace days. |
| O4 | landlord, invite caretakers and assign them to buildings | Re-assigning takes effect immediately, including for open sockets. |
| O5 | landlord, see occupancy at a glance | Vacant / occupied / notice-given per unit. |

### T — Tenants & leases
| ID | As a… I want to… | Notes |
|---|---|---|
| T1 | landlord, invite a tenant to a unit and start a lease | Lease: start date, monthly rent (copied from the unit, editable), advance/security deposit, household size. |
| T2 | landlord, record the deposit received | Kept as deposit, not as rent. |
| T3 | landlord, end a lease (move-out) with a settlement | Prorated last month, outstanding dues deducted from the deposit, refund or amount owed shown. Settlement PDF. |
| T4 | tenant, see my lease, deposit and move-in details | |
| T5 | landlord, see a tenant's full history (bills, payments, requests) | History stays after move-out. |

### B — Billing
| ID | As a… I want to… | Notes |
|---|---|---|
| B1 | landlord, have bills drafted automatically on the building's bill day | One bill per active lease per month. Running the job twice never creates duplicates. |
| B2 | caretaker/landlord, enter electricity meter readings for submeter units | A reading lower than last month's is rejected (unless marked "meter replaced"). |
| B3 | landlord, review drafts and issue them (one by one or all ready) | Issuing locks the line items and notifies the tenant. |
| B4 | tenant, see my current bill with every line explained | e.g. "Electricity: 1,240 → 1,395 = 155 units × ৳9.00". |
| B5 | tenant, be reminded before and after the due date | 3 days before, on the due day, 1 and 7 days overdue. In-app + email + push, per my preferences. |
| B6 | landlord, have the late fee applied automatically | Once per bill, after due day + grace, only on the unpaid amount. Landlord can waive it with a reason. |
| B7 | landlord, add a one-off charge or discount to a bill before it's paid | Requires a reason. |
| B8 | tenant, see my total dues across months | Unpaid amounts carry forward as dues, oldest first. |

### P — Payments & receipts
| ID | As a… I want to… | Notes |
|---|---|---|
| P1 | tenant, pay online with SSLCommerz (sandbox) | Full due or a custom amount (min ৳100). The bill is marked paid **only** after the server validates the payment with SSLCommerz, never because the browser came back to a success page. |
| P2 | tenant, submit a claim for a cash/bKash payment (amount, method, TrxID, optional photo) | Shows as "pending confirmation". |
| P3 | caretaker/landlord, confirm or reject a payment claim, or record a payment directly | Rejecting needs a reason the tenant sees. |
| P4 | anyone involved, get a PDF receipt for every confirmed payment | Receipt numbers are sequential per organisation with no gaps or duplicates (`BM-2026-000123`). |
| P5 | landlord, void a wrongly recorded payment | Needs a reason. Never hard-deleted. The receipt is marked VOID and dues are recalculated. |
| P6 | tenant, pay more than I owe | The extra becomes credit and is used on the next bill automatically. |

### M — Maintenance
| ID | As a… I want to… | Notes |
|---|---|---|
| M1 | tenant, raise a request with category, description, priority and up to 3 photos | Categories: plumbing, electrical, gas, lift, cleaning, security, other. |
| M2 | landlord/caretaker, assign, comment and move a request through its statuses | `open → assigned → in_progress → resolved → closed`. Tenant can reopen within 7 days of resolve; auto-closes after 7 days. |
| M3 | tenant, see status changes and comments live without refreshing | WebSocket. |
| M4 | landlord, see open requests by building, priority and age | |

### N — Notifications & notices
| ID | As a… I want to… | Notes |
|---|---|---|
| N1 | anyone, get in-app notifications live with an unread counter | Bell, mark read / mark all read. |
| N2 | anyone, get web push notifications even when the app is closed | Standard Web Push (VAPID). Opt-in per device. On iPhone only after the PWA is installed to the home screen. |
| N3 | anyone, get emails for important events | Bill issued, reminder, payment confirmed/rejected, request update, invite, password reset. |
| N4 | anyone, choose which channels I get for which events | Security emails (reset, invite) can't be turned off. |
| N5 | landlord/caretaker, post a notice to a building (optionally pinned, with expiry) | Tenants of that building get it on every channel they enabled. |

### D — Tenant documents
| ID | As a… I want to… | Notes |
|---|---|---|
| D1 | landlord or tenant, upload NID (front/back) and the rental agreement for a lease | PDF/JPG/PNG, ≤ 5 MB, type checked by content, not by file name. |
| D2 | landlord or that tenant, view or download a document | Private storage. Short-lived signed URLs only, never a public link. Caretakers and admin cannot. |
| D3 | landlord, delete a document | Removed from storage too, not just from the database. |

### R — Reports & dashboards
| ID | As a… I want to… | Notes |
|---|---|---|
| R1 | landlord, see a dashboard: billed vs collected this month, total outstanding, occupancy, open requests | |
| R2 | landlord, get a monthly PDF statement per building, and per lease on request | Emailed to the landlord on the 1st for the previous month. |
| R3 | caretaker, see today's work: readings to enter, claims to confirm, requests assigned to me | |
| R4 | tenant, see my home screen: amount due, due date, Pay button, latest notice, open requests | |

### X — Platform admin
| ID | As an… I want to… | Notes |
|---|---|---|
| X1 | admin, list organisations with plan-free usage numbers (buildings, units, active leases) | |
| X2 | admin, suspend or reactivate an organisation | Suspended org members can sign in but only see a "suspended" screen. Cron jobs skip that org. |
| X3 | admin, see system health: job runs, failed emails/pushes, payment webhook errors | |

## Out of scope (do NOT build)
Bangla translation (strings go through i18n, but only English ships), SMS / phone-OTP login, native
mobile apps, expense tracking / profit & loss, a full audit-log screen (tables keep `created_by` /
`voided_by` + reasons only), lease e-signing, chat between landlord and tenant (maintenance comments
only), SaaS subscription billing for landlords, rental listings/search (that's BasaKhoj), bank or
bKash API reconciliation, multi-currency, live (non-sandbox) payments, tax/VAT calculation, analytics
or tracking scripts.
