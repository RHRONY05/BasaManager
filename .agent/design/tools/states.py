#!/usr/bin/env python3
"""Generate states.html: the four states (pending skeleton / refreshing / error / empty) of every data region,
plus flow and global states. Region content lives in REGIONS below. Run: python .agent/design/tools/states.py
The page is responsive (4 columns ≥ 1024 px, 1 column on phones) so it is audited at 390/360/320 too."""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

def sk_lines(n, cls='sk--text'):
    widths = ['92%', '78%', '85%', '64%', '88%', '72%']
    return ''.join(f'<span class="sk {cls}" style="width:{widths[i % len(widths)]}"></span>' for i in range(n))

SKELETON = {
    'kpis': '<div class="st-kpis">' + ''.join('<div class="kpi"><span class="sk sk--sm" style="width:50%"></span><span class="sk sk--amount" style="width:80%"></span><span class="sk sk--sm" style="width:65%"></span></div>' for _ in range(2)) + '</div>',
    'chart': '<div class="card card--tight"><span class="sk sk--sm" style="width:55%"></span><div class="st-bars">' + ''.join(f'<span class="sk" style="height:{h}%"></span>' for h in (70, 72, 74, 74, 77, 77)) + '</div></div>',
    'list': '<div class="list">' + ''.join('<div class="list-row"><span class="sk sk--circle"></span><span class="list-row__main"><span class="sk sk--text" style="width:70%"></span><span class="sk sk--sm" style="width:50%"></span></span><span class="sk sk--badge"></span></div>' for _ in range(3)) + '</div>',
    'table': '<div class="table-wrap"><div class="st-thead"><span class="sk sk--sm" style="width:40%"></span></div>' + ''.join('<div class="st-trow"><span class="sk sk--sm" style="width:18%"></span><span class="sk sk--sm" style="width:38%"></span><span class="sk sk--sm" style="width:20%"></span></div>' for _ in range(4)) + '</div>',
    'cards': '<div class="st-cards">' + ''.join('<div class="card card--tight"><span class="sk sk--text" style="width:60%"></span><span class="sk sk--sm" style="width:85%"></span><span class="sk sk--sm" style="width:40%"></span></div>' for _ in range(2)) + '</div>',
    'ledger': '<div class="card card--tight">' + ''.join('<div class="row-between"><span class="sk sk--sm" style="width:40%"></span><span class="sk sk--sm" style="width:20%"></span></div>' for _ in range(4)) + '<hr class="divider"><div class="row-between"><span class="sk sk--sm" style="width:25%"></span><span class="sk sk--title" style="width:35%"></span></div></div>',
    'due': '<div class="due-card"><div class="row-between"><span class="sk sk--text" style="width:45%"></span><span class="sk sk--badge"></span></div><span class="sk sk--amount" style="width:60%"></span><span class="sk sk--btn"></span><span class="sk sk--btn"></span></div>',
    'timeline': '<div class="card card--tight">' + ''.join('<div class="row"><span class="sk sk--circle"></span><span class="grow stack-sm"><span class="sk sk--sm" style="width:70%"></span><span class="sk sk--sm" style="width:40%"></span></span></div>' for _ in range(3)) + '</div>',
    'board': '<div class="st-board">' + ''.join('<div class="board__col"><span class="sk sk--sm" style="width:50%"></span><div class="req-card"><span class="sk sk--sm"></span><span class="sk sk--sm" style="width:60%"></span></div></div>' for _ in range(2)) + '</div>',
    'grid': '<div class="readings-m"><div class="st-trow"><span class="sk sk--sm" style="width:12%"></span><span class="sk sk--sm" style="width:20%"></span><span class="sk sk--btn" style="width:35%"></span></div><div class="st-trow"><span class="sk sk--sm" style="width:12%"></span><span class="sk sk--sm" style="width:20%"></span><span class="sk sk--btn" style="width:35%"></span></div></div>',
}

# name, route, skeleton kind, refreshing sample (html), error text, empty (icon, title, text, action)
REGIONS = [
    ('Dashboard · KPIs', '/l', 'kpis', '<div class="st-kpis"><div class="kpi"><span class="kpi__label">Billed</span><span class="kpi__value">৳3,84,500</span></div><div class="kpi"><span class="kpi__label">Collected</span><span class="kpi__value">৳2,61,200</span></div></div>',
     'Couldn\'t load this month\'s numbers.', ('receipt-text', 'No bills for November yet', 'Bills are created on each building\'s bill day. You can also set up billing now.', 'Billing settings')),
    ('Dashboard · 6-month chart', '/l', 'chart', '<div class="card card--tight"><span class="t-sm t-strong">Billed and collected</span><span class="t-sm muted">Jun 98% · Jul 96% · Aug 98% …</span></div>',
     'Couldn\'t load the chart. The numbers above are still correct.', ('chart-column', 'Not enough history yet', 'The chart fills in after your first full month of bills.', None)),
    ('Dashboard · Needs you', '/l', 'list', '<div class="list"><a class="list-row" href="#"><span class="list-row__main"><span class="list-row__title">7 draft bills</span><span class="list-row__meta">Karnaphuli View</span></span></a></div>',
     'Couldn\'t load what needs your attention.', ('circle-check', 'Nothing needs you right now', 'Drafts, payment claims and urgent requests show up here.', None)),
    ('Buildings list', '/l/buildings', 'cards', '<div class="st-cards"><div class="card card--tight"><span class="t-strong">Shanti Neer</span><span class="t-sm muted">12 units · 83% occupied</span></div></div>',
     'Couldn\'t load your buildings.', ('building-2', 'Add your first building', 'Name, address and a map pin. Units come next.', 'Add building')),
    ('Building · units table', '/l/buildings/:id', 'table', '<div class="list"><div class="list-row"><span class="list-row__main"><span class="list-row__title">4A · Nusrat Jahan</span><span class="list-row__meta">৳12,000 · Active</span></span></div></div>',
     'Couldn\'t load the units of Shanti Neer.', ('door-open', 'No units yet', 'Add flats, rooms or shops with their rent and charges.', 'Add unit')),
    ('Tenants (leases)', '/l/tenants', 'table', '<div class="list"><div class="list-row"><span class="list-row__main"><span class="list-row__title">Imran Hossain</span><span class="list-row__meta">Shanti Neer 3B · Active</span></span></div></div>',
     'Couldn\'t load leases.', ('users', 'No tenants yet', 'Start a lease from a vacant unit and the tenant gets an invite.', 'Add tenant')),
    ('Billing · drafts', '/l/billing', 'table', '<div class="list"><div class="list-row"><span class="list-row__main"><span class="list-row__title">1A · Sharmin Akter</span><span class="list-row__meta">৳19,228 · ready</span></span></div></div>',
     'Couldn\'t load drafts for Karnaphuli View.', ('file-check', 'No drafts waiting', 'All November bills for this building are issued. Next drafts on 5 Dec.', None)),
    ('Billing · readings grid', '/l/billing?tab=readings', 'grid', '<div class="list"><div class="list-row"><span class="list-row__main"><span class="list-row__title">1A · 3,412 → 3,584</span><span class="list-row__meta">172 units · ৳1,548</span></span></div></div>',
     'Couldn\'t load meter readings. Nothing you typed is lost.', ('gauge', 'No sub-metered units', 'Units on prepaid meters or without electricity don\'t need readings.', None)),
    ('Bill detail · lines', '/l/bills/:id', 'ledger', '<div class="card card--tight"><div class="ledger ledger--sm"><div class="ledger__row"><span class="ledger__label">Rent</span><span class="ledger__leader"></span><span class="ledger__amount">৳12,000</span></div><div class="ledger__total"><span class="ledger__total-label">Total</span><span class="ledger__total-amount">৳15,664</span></div></div></div>',
     'Couldn\'t load this bill.', None),
    ('Payments · pending claims', '/l/payments', 'list', '<div class="list"><div class="list-row"><span class="list-row__main"><span class="list-row__title">Md. Rezaul Karim</span><span class="list-row__meta">bKash · ৳14,200</span></span></div></div>',
     'Couldn\'t load pending claims.', ('inbox', 'No pending claims', 'When a tenant says they paid by cash, bKash or Nagad, it shows here for you to confirm.', 'Record a payment')),
    ('Payments · all payments', '/l/payments?tab=all', 'table', '<div class="list"><div class="list-row"><span class="list-row__main"><span class="list-row__title">BM-2026-000214</span><span class="list-row__meta">Nusrat Jahan · ৳7,475 · online</span></span></div></div>',
     'Couldn\'t load payments.', ('wallet', 'No payments this month', 'Confirmed payments and their receipts appear here.', 'Record a payment')),
    ('Maintenance board', '/l/maintenance', 'board', '<div class="list"><div class="list-row"><span class="list-row__main"><span class="list-row__title">Lift stops between 3rd and 4th floor</span><span class="list-row__meta">Open · urgent · 6 h</span></span></div></div>',
     'Couldn\'t load requests.', ('wrench', 'No open requests', 'Tenants raise requests from their phone; they show up here live.', None)),
    ('Request timeline (live)', '/t/requests/:id', 'timeline', '<div class="card card--tight"><div class="row"><span class="tl-dot"><i data-lucide="message-square"></i></span><span class="t-sm">Jamal Uddin: Plumber Shafiq will come…</span></div></div>',
     'Couldn\'t load updates. New ones will appear when you\'re back online.', ('message-square', 'No updates yet', 'You\'ll see each step here as soon as staff act on it.', None)),
    ('Notices', '/l/notices · /t/notices', 'cards', '<div class="st-cards"><div class="card card--tight"><span class="t-strong">Water supply off on Sunday</span><span class="t-sm muted">Shanti Neer · pinned</span></div></div>',
     'Couldn\'t load notices.', ('megaphone', 'No notices yet', 'Post one to tell every tenant of a building at once.', 'New notice')),
    ('Team (caretakers)', '/l/team', 'list', '<div class="list"><div class="list-row"><span class="list-row__main"><span class="list-row__title">Jamal Uddin</span><span class="list-row__meta">Shanti Neer, Karnaphuli View</span></span></div></div>',
     'Couldn\'t load your team.', ('user-cog', 'No caretakers yet', 'Invite staff who record payments, readings and repairs for chosen buildings.', 'Invite caretaker')),
    ('Reports', '/l/reports', 'list', '<div class="list"><div class="list-row"><span class="list-row__main"><span class="list-row__title">October 2026 · Shanti Neer</span><span class="list-row__meta">PDF ready</span></span></div></div>',
     'Couldn\'t load statements.', ('file-chart-column', 'No statements yet', 'The first monthly statement is made on 1 Dec for November.', 'Generate now')),
    ('Tenant home · due card', '/t', 'due', '<div class="due-card"><span class="t-sm t-strong secondary">Left to pay</span><span class="amount amount--xl">৳7,475</span></div>',
     'Couldn\'t load your bill. Your payments are safe.', ('circle-check', 'All paid', 'Nothing due. Your next bill comes on 1 Dec.', None)),
    ('Tenant bills list', '/t/bills', 'list', '<div class="list"><div class="list-row"><span class="list-row__main"><span class="list-row__title">November 2026</span><span class="list-row__meta">৳16,475 · part paid</span></span></div></div>',
     'Couldn\'t load your bills.', ('receipt-text', 'No bills yet', 'Your first bill appears on the day your lease starts.', None)),
    ('Notifications', '/notifications', 'list', '<div class="list"><div class="list-row list-row--unread"><span class="list-row__main"><span class="list-row__title">Payment confirmed · ৳9,000</span><span class="list-row__meta">5 Nov</span></span></div></div>',
     'Couldn\'t load notifications.', ('bell', 'You\'re all caught up', 'Bills, payments and request updates appear here.', None)),
    ('Account · devices', '/account', 'list', '<div class="list"><div class="list-row"><span class="list-row__main"><span class="list-row__title">Chrome on Windows</span><span class="list-row__meta">This device</span></span></div></div>',
     'Couldn\'t load your devices.', None),
    ('Admin · organisations', '/a', 'table', '<div class="list"><div class="list-row"><span class="list-row__main"><span class="list-row__title">Chowdhury Properties</span><span class="list-row__meta">26 units · active</span></span></div></div>',
     'Couldn\'t load organisations.', ('building', 'No organisations match', 'Try another name, or clear the status filter.', 'Clear filters')),
    ('Admin · system health', '/a/health', 'table', '<div class="list"><div class="list-row"><span class="list-row__main"><span class="list-row__title">generate-bills · ok</span><span class="list-row__meta">8 Nov, 12:05 AM · 2.1 s</span></span></div></div>',
     'Couldn\'t load job runs.', ('activity', 'No failures in the last 7 days', 'Failed emails, pushes and stuck payments would show here.', None)),
]

def cell(label, inner, busy=False):
    a = ' data-skeleton aria-busy="true"' if busy else ''
    return f'<div class="st-cell"><span class="st-cap">{label}</span><div class="st-box"{a}>{inner}</div></div>'

rows = []
for name, route, kind, sample, err, empty in REGIONS:
    pend = cell('Pending', SKELETON[kind], True)
    refr = cell('Refreshing', f'<div class="st-refresh"><span class="st-updating"><span class="spinner" aria-hidden="true"></span>Updating…</span><div class="is-refreshing" aria-busy="true">{sample}</div></div>')
    erro = cell('Error', f'<div class="card card--tight"><div class="error-state st-small" role="alert"><span class="error-state__icon"><i data-lucide="cloud-off"></i></span><span class="error-state__title">{err}</span><button class="btn btn--secondary" type="button"><i data-lucide="rotate-cw"></i>Retry</button></div></div>')
    if empty:
        icon, t, tx, act = empty
        btn = f'<button class="btn btn--primary" type="button">{act}</button>' if act else ''
        emp = cell('Empty', f'<div class="card card--tight"><div class="empty st-small"><span class="empty__icon"><i data-lucide="{icon}"></i></span><span class="empty__title">{t}</span><p class="empty__text">{tx}</p>{btn}</div></div>')
    else:
        emp = cell('Empty', '<p class="t-sm muted st-na">Never empty: the page only opens for an existing record (404 otherwise).</p>')
    rows.append(f'<section class="st-row" aria-label="{name}"><div class="st-name"><h3 class="t-strong">{name}</h3><span class="mono t-xs muted">{route}</span></div>{pend}{refr}{erro}{emp}</section>')

FLOWS = '''
<section class="st-flow" aria-labelledby="pay-h">
  <h2 class="t-section" id="pay-h">Pay result <span class="mono t-sm muted">/pay/result?tran=</span></h2>
  <p class="t-sm secondary">The browser return never changes money. The page polls the payment intent every 2 s for up to 60 s.</p>
  <div class="st-four">
    <div class="card card--tight st-res" role="status" aria-busy="true"><span class="st-res__icon"><span class="spinner" aria-hidden="true"></span></span><span class="t-strong">Checking your payment…</span><span class="t-sm secondary">Waiting for SSLCommerz to confirm ৳7,475. Please don't close this page.</span></div>
    <div class="card card--tight st-res"><span class="st-res__icon st-res__icon--ok"><i data-lucide="circle-check"></i></span><span class="t-strong">Paid · ৳7,475</span><span class="t-sm secondary">Receipt BM-2026-000214 is ready.</span><a class="btn btn--primary" href="#">Download receipt</a></div>
    <div class="card card--tight st-res" role="alert"><span class="st-res__icon st-res__icon--err"><i data-lucide="circle-x"></i></span><span class="t-strong">Payment failed</span><span class="t-sm secondary">The bank declined it. No money was taken. You can try again or pay another way.</span><a class="btn btn--primary" href="#">Try again</a></div>
    <div class="card card--tight st-res"><span class="st-res__icon"><i data-lucide="hourglass"></i></span><span class="t-strong">Still processing</span><span class="t-sm secondary">SSLCommerz hasn't confirmed yet. We'll notify you as soon as it does; don't pay twice.</span><a class="btn btn--secondary" href="#">Back to home</a></div>
  </div>
  <p class="t-xs muted">Cancelled uses the failed layout with “You cancelled the payment. Nothing was charged.” and the same buttons.</p>
</section>

<section class="st-flow" aria-labelledby="auth-h">
  <h2 class="t-section" id="auth-h">Auth and account states</h2>
  <div class="st-four">
    <div class="card card--tight st-res"><span class="st-res__icon"><i data-lucide="mail"></i></span><span class="t-strong">Check your email</span><span class="t-sm secondary">We sent a link to farhana.chowdhury@gmail.com. It works for 24 hours.</span><button class="btn btn--secondary" type="button" disabled>Resend in 0:42</button></div>
    <div class="card card--tight st-res" role="alert"><span class="st-res__icon st-res__icon--err"><i data-lucide="lock"></i></span><span class="t-strong">Sign-in paused</span><span class="t-sm secondary">Too many tries. Try again in 14 minutes, or reset your password.</span><a class="btn btn--secondary" href="#">Reset password</a></div>
    <div class="card card--tight st-res"><span class="st-res__icon"><i data-lucide="mail-check"></i></span><span class="t-strong">If an account exists, we sent a link</span><span class="t-sm secondary">Check your inbox for a reset link. It works for 30 minutes, once.</span></div>
    <div class="card card--tight st-res" role="alert"><span class="st-res__icon st-res__icon--warn"><i data-lucide="user-x"></i></span><span class="t-strong">This invite is for another email</span><span class="t-sm secondary">You're signed in as tanvir@gmail.com, but the invite is for sadia.islam@gmail.com.</span><button class="btn btn--secondary" type="button">Sign out and continue</button></div>
    <div class="card card--tight st-res"><span class="st-res__icon"><span class="spinner" aria-hidden="true"></span></span><span class="t-strong">Verifying your email…</span></div>
    <div class="card card--tight st-res" role="alert"><span class="st-res__icon st-res__icon--err"><i data-lucide="link-2-off"></i></span><span class="t-strong">This link has expired or was used</span><span class="t-sm secondary">Links work once. Ask for a new one.</span><button class="btn btn--secondary" type="button">Send a new link</button></div>
    <div class="card card--tight st-res" role="alert"><span class="st-res__icon st-res__icon--err"><i data-lucide="circle-pause"></i></span><span class="t-strong">This account is suspended</span><span class="t-sm secondary">Chowdhury Properties is paused by the platform admin. Reason: “Under review”.</span><div class="btn-row"><button class="btn btn--secondary" type="button">Switch organisation</button><button class="btn btn--ghost" type="button">Sign out</button></div></div>
    <div class="card card--tight st-res"><span class="st-res__icon"><i data-lucide="map-pinned"></i></span><span class="t-strong">Page not found</span><span class="t-sm secondary">The link may be old, or this item belongs to another account.</span><a class="btn btn--primary" href="#">Go home</a></div>
  </div>
</section>

<section class="st-flow" aria-labelledby="g-h">
  <h2 class="t-section" id="g-h">Navigation, mutations and connection</h2>
  <div class="st-four">
    <div class="card card--tight"><span class="st-cap">Route change (shell stays, skeleton within 100 ms, 2 px bar after 150 ms)</span><div class="st-shell"><span class="progress-top"></span><div class="st-shell__side"><span class="sk sk--sm"></span><span class="sk sk--sm"></span><span class="sk sk--sm"></span></div><div class="st-shell__main" data-skeleton aria-busy="true"><span class="sk sk--title"></span><span class="sk sk--text"></span><span class="sk sk--text" style="width:80%"></span></div></div></div>
    <div class="card card--tight"><span class="st-cap">Mutation pending → success → error</span><button class="btn btn--primary" type="button" aria-busy="true" disabled><span class="spinner" aria-hidden="true"></span>Confirm ৳14,200</button><div class="toast" role="status"><i data-lucide="circle-check" class="toast__icon--ok"></i><span class="toast__body">Confirmed · receipt BM-2026-000215</span></div><div class="toast" role="alert"><i data-lucide="circle-x" class="toast__icon--err"></i><span class="toast__body">Couldn't confirm: this TrxID was already used.</span></div></div>
    <div class="card card--tight"><span class="st-cap">Offline and reconnecting</span><div class="offline-bar" role="status"><i data-lucide="wifi-off" class="i-sm"></i>You're offline. Changes are paused.</div><span class="pill-live" role="status"><span class="spinner" aria-hidden="true"></span>Reconnecting…</span><button class="btn btn--primary" type="button" disabled>Pay ৳7,475 now</button><span class="t-xs muted">Buttons that change data are disabled offline, with the banner explaining why.</span></div>
    <div class="card card--tight"><span class="st-cap">Live update highlight (socket event)</span><div class="list"><div class="list-row is-changed"><span class="list-row__main"><span class="list-row__title">Imran Hossain · ৳8,000</span><span class="list-row__meta">Confirmed just now by Jamal Uddin</span></span><span class="badge badge--success"><i data-lucide="circle-check"></i>Confirmed</span></div></div><span class="t-xs muted">--highlight fades over 1.2 s; no layout shift.</span></div>
  </div>
</section>
'''

STYLE = '''
  .st-page { max-width: 1376px; margin: 0 auto; padding: var(--space-8) var(--space-6) var(--space-16); display: grid; gap: var(--space-8); }
  .st-row { display: grid; grid-template-columns: 180px repeat(4, minmax(0, 1fr)); gap: var(--space-4); padding-bottom: var(--space-6); border-bottom: 1px solid var(--border-default); align-items: start; }
  .st-name { display: grid; gap: var(--space-1); min-width: 0; }
  .st-cell { display: grid; gap: var(--space-2); min-width: 0; }
  .st-cap { font-size: var(--text-xs); line-height: var(--leading-xs); font-weight: var(--weight-bold); letter-spacing: var(--tracking-wide); text-transform: uppercase; color: var(--fg-muted); }
  .st-box { display: grid; gap: var(--space-2); min-width: 0; }
  .st-box .card, .st-box .list, .st-box .table-wrap, .st-box .due-card { min-width: 0; }
  .st-kpis, .st-cards, .st-board { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
  .st-kpis .kpi { padding: var(--space-3); }
  .st-kpis .kpi__value { font-size: var(--text-xl); line-height: var(--leading-xl); }
  .st-bars { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--space-2); align-items: end; height: 96px; }
  .st-thead { padding: var(--space-3); background: var(--bg-muted); }
  .st-trow { display: flex; gap: var(--space-3); padding: var(--space-3); border-top: 1px solid var(--border-muted); }
  .st-refresh { position: relative; display: grid; gap: var(--space-2); }
  .st-updating { display: inline-flex; align-items: center; gap: var(--space-2); justify-self: end; font-size: var(--text-xs); color: var(--fg-muted); font-weight: var(--weight-semibold); }
  .st-small { padding: var(--space-4) var(--space-2); }
  .st-small .empty__title, .st-small .error-state__title { font-size: var(--text-base); line-height: var(--leading-base); }
  .st-na { padding: var(--space-3); border: 1px dashed var(--border-default); border-radius: var(--radius-md); }
  .st-flow { display: grid; gap: var(--space-4); }
  .st-four { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-4); align-items: start; }
  .st-res { justify-items: start; }
  .st-res__icon { display: grid; place-items: center; width: var(--size-tap); height: var(--size-tap); border-radius: var(--radius-full); background: var(--bg-muted); color: var(--fg-secondary); }
  .st-res__icon--ok { background: var(--success-soft); color: var(--success-text); }
  .st-res__icon--err { background: var(--danger-soft); color: var(--danger-text); }
  .st-res__icon--warn { background: var(--warning-soft); color: var(--warning-text); }
  .st-shell { position: relative; display: grid; grid-template-columns: 30% minmax(0, 1fr); gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-md); overflow: hidden; }
  .st-shell .progress-top { position: absolute; }
  .st-shell__side, .st-shell__main { display: grid; gap: var(--space-2); align-content: start; }
  @media (max-width: 1023px) {
    .st-row { grid-template-columns: minmax(0, 1fr); }
    .st-four { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 767px) {
    .st-page { padding: var(--space-4) var(--space-4) var(--space-12); }
    .st-four { grid-template-columns: minmax(0, 1fr); }
  }
'''

html = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>K02 · Data-region states — BasaManager</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="ui.css">
<script src="https://unpkg.com/lucide@1.70.0/dist/umd/lucide.min.js"></script>
<script src="mock.js"></script>
<style>
  /* layout only — tokens only. Generated by tools/states.py */{STYLE}</style>
</head>
<body>
<main class="st-page">
  <header class="stack-sm">
    <h1 class="t-title">Data-region states</h1>
    <p class="secondary">Every data region has four designed states (ui-states skill): <b>pending</b> = layout-matched skeleton (data-skeleton, aria-busy, shown after 150 ms); <b>refreshing</b> = content stays, dimmed to 60% with a small “Updating…” (filters, month pickers, refetch); <b>error</b> = inline card with the API message and Retry when there is no data yet (with data on screen: keep it and show an error toast); <b>empty</b> = one primary action. Success fades in ≤ 150 ms.</p>
  </header>
  <section class="stack-lg" aria-labelledby="regions-h">
    <h2 class="t-section" id="regions-h">Data regions</h2>
    {"".join(rows)}
  </section>
  {FLOWS}
</main>
</body>
</html>
'''
(ROOT / 'states.html').write_text(html, encoding='utf8', newline='\n')
print(f'states.html: {len(REGIONS)} regions')
