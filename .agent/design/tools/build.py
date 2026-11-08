#!/usr/bin/env python3
"""Assemble artboards: tools/src/<device>/<name>.html (content + meta) -> <device>/<name>.html.

Shells live here so every artboard uses the exact same sidebar / top bar / bottom nav markup.
The generated files in desktop/ and mobile/ are the spec implementers read; edit src/ and rebuild:
    python .agent/design/tools/build.py
Meta header (first line of a src file):  <!--meta {"title": "...", "shell": "...", ...} -->
"""
import json, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'tools' / 'src'

MARK = ('<svg class="brand__mark" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" '
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15 16 6l10 9"/>'
        '<path d="M9 13v9h14v-9"/><path d="M13.5 22v-5h5v5"/><path d="M5 26h22M5 29.5h22" stroke-width="1.6"/></svg>')

def head(title, style, pseudo=False):
    return f'''<!doctype html>
<html lang="en"{' data-pseudo="en-XA"' if pseudo else ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title} — BasaManager</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="../tokens.css">
<link rel="stylesheet" href="../ui.css">
<script src="https://unpkg.com/lucide@1.70.0/dist/umd/lucide.min.js"></script>
<script src="../mock.js"></script>
<style>
  /* layout only — tokens only */
{style}
</style>
</head>
'''

def bell(n=None, outline=False):
    cls = 'icon-btn icon-btn--outline' if outline else 'icon-btn'
    if not n:
        return f'<span class="bell"><a class="{cls}" href="#notifications" aria-label="Notifications"><i data-lucide="bell"></i></a></span>'
    return (f'<span class="bell"><a class="{cls}" href="#notifications" aria-label="Notifications, {n} unread"><i data-lucide="bell"></i></a>'
            f'<span class="bell__count" aria-hidden="true">{n}</span></span>')

# ---------------------------------------------------------------- staff desktop
STAFF_NAV = {
    'landlord': [
        [('dashboard', '/l', 'layout-dashboard', 'Dashboard', None), ('buildings', '/l/buildings', 'building-2', 'Buildings', None),
         ('tenants', '/l/tenants', 'users', 'Tenants', None), ('billing', '/l/billing', 'receipt-text', 'Billing', '7'),
         ('payments', '/l/payments', 'wallet', 'Payments', '3'), ('maintenance', '/l/maintenance', 'wrench', 'Maintenance', '5'),
         ('notices', '/l/notices', 'megaphone', 'Notices', None)],
        ('Organisation', [('team', '/l/team', 'user-cog', 'Team', None), ('reports', '/l/reports', 'file-chart-column', 'Reports', None),
                          ('settings', '/l/settings', 'settings', 'Settings', None)]),
    ],
    'admin': [
        [('orgs', '/a', 'building', 'Organisations', None), ('health', '/a/health', 'activity', 'System health', None)],
        None,
    ],
}

def staff_sidebar(role, active, org, user, nocounts=False):
    main, extra = STAFF_NAV[role]
    def item(k, href, icon, label, count):
        cur = ' aria-current="page"' if k == active else ''
        c = f'<span class="nav__count" aria-label="{count} waiting">{count}</span>' if count and not nocounts else ''
        return f'      <a class="nav__item" href="#{href}"{cur}><i data-lucide="{icon}"></i><span class="nav__label">{label}</span>{c}</a>'
    items = '\n'.join(item(*x) for x in main)
    ext = ''
    if extra:
        ext = f'\n      <span class="eyebrow nav__group">{extra[0]}</span>\n' + '\n'.join(item(*x) for x in extra[1])
    org_html = ''
    if org:
        org_html = (f'''    <button class="org-switch" type="button" data-allow-wrap title="{org[0]} · {org[1]}" aria-label="Switch organisation, current {org[0]}">
      <span class="org-switch__text"><span class="org-switch__name">{org[0]}</span><span class="org-switch__role">{org[1]}</span></span><i data-lucide="chevrons-up-down" class="i-sm"></i>
    </button>\n''')
    return f'''  <aside class="sidebar" aria-label="Sidebar">
    <div class="sidebar__brand"><a class="brand" href="#/">{MARK}BasaManager</a><button class="icon-btn" type="button" aria-label="Collapse sidebar"><i data-lucide="panel-left-close"></i></button></div>
{org_html}    <nav class="nav" aria-label="Main">
{items}{ext}
    </nav>
    <div class="sidebar__foot">
      <a class="nav__item" href="#/account"><span class="avatar avatar--sm">{user[0]}</span><span class="nav__label">{user[1]}</span></a>
      <a class="nav__item" href="#shortcuts"><i data-lucide="keyboard"></i><span class="nav__label">Shortcuts</span><span class="kbd">?</span></a>
    </div>
  </aside>'''

def staff_d(m, body):
    crumbs = m.get('crumbs', [])
    cr = []
    for i, c in enumerate(crumbs):
        if i == len(crumbs) - 1:
            cr.append(f'<span aria-current="page">{c}</span>')
        else:
            cr.append(f'<a href="#">{c}</a><i data-lucide="chevron-right" class="i-sm"></i>')
    search = '' if m.get('nosearch') else '<label class="search"><i data-lucide="search" class="i-sm"></i><span class="grow">Search tenants, units, TrxID</span><span class="kbd">/</span></label>'
    role = m.get('role', 'landlord')
    org = None if role == 'admin' else tuple(m.get('org', ['Chowdhury Properties', 'Landlord']))
    user = tuple(m.get('user', ['FC', 'Farhana Chowdhury']))
    return f'''<body>
<div class="frame-d app">
{staff_sidebar(role, m.get('active'), org, user, m.get('nocounts', False))}
  <div class="main">
    <header class="topbar">
      <nav class="topbar__crumbs" aria-label="Breadcrumb">{''.join(cr)}</nav>
      <div class="topbar__actions">{search}{bell(m.get('bell', '3'))}</div>
    </header>
{body}
  </div>
{m.get('overlay', '')}</div>
</body>
</html>
'''

# ---------------------------------------------------------------- mobile shells
STAFF_TABS = [('home', 'house', 'Home'), ('billing', 'receipt-text', 'Billing'), ('payments', 'wallet', 'Payments'),
              ('requests', 'wrench', 'Requests'), ('more', 'menu', 'More')]
TENANT_TABS = [('home', 'house', 'Home'), ('bills', 'receipt-text', 'Bills'), ('requests', 'wrench', 'Requests'),
               ('notices', 'megaphone', 'Notices'), ('account', 'circle-user-round', 'Account')]

def bottom_nav(tabs, active, dots=()):
    out = []
    for k, icon, label in tabs:
        cur = ' aria-current="page"' if k == active else ''
        dot = '<span class="bottom-nav__dot"></span>' if k in dots else ''
        aria = f' aria-label="{label}, new updates"' if k in dots else ''
        out.append(f'  <a class="bottom-nav__item" href="#{k}"{cur}{aria}><span class="bottom-nav__icon"><i data-lucide="{icon}"></i>{dot}</span><span class="bottom-nav__label">{label}</span></a>')
    return '<nav class="bottom-nav" data-bottom-nav aria-label="Main">\n' + '\n'.join(out) + '\n</nav>'

def m_topbar(m):
    title = m.get('topbar', '')
    if m.get('back'):
        lead = f'<a class="icon-btn" href="#back" aria-label="Back"><i data-lucide="arrow-left"></i></a>'
        cls = 'm-topbar m-topbar--back'
    elif m.get('close'):
        lead = f'<a class="icon-btn" href="#close" aria-label="Close"><i data-lucide="x"></i></a>'
        cls = 'm-topbar m-topbar--back'
    else:
        lead = f'<a class="brand" href="#home" aria-label="BasaManager home">{MARK}</a>'
        cls = 'm-topbar'
    right = m.get('topright')
    if right is None:
        right = bell(m.get('bell', '2')) + (f'<a class="icon-btn" href="#account" aria-label="Account"><span class="avatar avatar--sm">{m.get("initials", "NJ")}</span></a>' if m.get('avatar') else '')
    return f'<header class="{cls}">{lead}<h1 class="m-topbar__title" title="{m.get("topbar_title", title)}">{title}</h1>{right}</header>'

def mobile(m, body, tabs):
    nav = ''
    main_cls = 'm-main'
    if m.get('flow'):
        main_cls = 'm-main m-main--flow'
    elif m.get('plain'):
        main_cls = 'm-main m-main--plain'
    else:
        nav = bottom_nav(tabs, m.get('active'), m.get('dots', ()))
    top = '' if m.get('notopbar') else m_topbar(m)
    return f'''<body>
<div class="frame-m">
{m.get('above', '')}{top}
<main class="{main_cls}"{' aria-busy="true"' if m.get('busy') else ''}>
{body}
</main>
{m.get('after', '')}{nav}
</div>
</body>
</html>
'''

# ---------------------------------------------------------------- tenant desktop
def tenant_d(m, body):
    links = [('home', 'Home'), ('bills', 'Bills'), ('requests', 'Requests'), ('notices', 'Notices')]
    ls = ''.join(f'<a class="t-topnav__link" href="#{k}"{" aria-current=\"page\"" if k == m.get("active") else ""}>{l}</a>' for k, l in links)
    return f'''<body>
<div class="frame-d">
<header class="t-topnav">
  <div class="t-topnav__inner">
    <a class="brand" href="#home">{MARK}BasaManager</a>
    <nav class="t-topnav__links" aria-label="Main">{ls}</nav>
    <div class="topbar__actions">{bell(m.get('bell', '2'))}<a class="account-btn" href="#account" aria-label="Account, Nusrat Jahan"><span class="avatar">NJ</span><i data-lucide="chevron-down" class="i-sm"></i></a></div>
  </div>
</header>
<main class="t-column">
{body}
</main>
{m.get('overlay', '')}</div>
</body>
</html>
'''

def plain(m, body):
    return f'''<body>
{body}
</body>
</html>
'''

def build():
    n = 0
    for f in sorted(SRC.rglob('*.html')):
        txt = f.read_text(encoding='utf8')
        mm = re.match(r'\s*<!--meta\s+(\{.*?\})\s*-->\s*', txt, re.S)
        if not mm:
            raise SystemExit(f'{f}: missing meta header')
        m = json.loads(mm.group(1))
        body = txt[mm.end():].rstrip() + '\n'
        style = ''
        sm = re.search(r'<style>(.*?)</style>\s*', body, re.S)
        if sm:
            style = sm.group(1).strip('\n')
            body = body[:sm.start()] + body[sm.end():]
        shell = m['shell']
        if shell == 'staff-d': page = staff_d(m, body)
        elif shell == 'staff-m': page = mobile(m, body, STAFF_TABS)
        elif shell == 'tenant-m': page = mobile(m, body, TENANT_TABS)
        elif shell == 'tenant-d': page = tenant_d(m, body)
        elif shell == 'plain': page = plain(m, body)
        else: raise SystemExit(f'{f}: unknown shell {shell}')
        page = page.replace('{{MARK}}', MARK)
        out = ROOT / f.parent.name / f.name
        out.parent.mkdir(exist_ok=True)
        out.write_text(head(m['title'], style, m.get('pseudo')) + page, encoding='utf8', newline='\n')
        n += 1
    print(f'built {n} artboards')

if __name__ == '__main__':
    build()
