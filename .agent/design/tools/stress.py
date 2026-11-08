#!/usr/bin/env python3
"""Generate stress-content variants of the busiest artboards (tools/src/<dev>/<name>--stress.html).

Stress content comes from tests/fixtures/stress.ts (longest names, ৳1,25,00,000, −৳12,500, ৳0, 99+,
an unbroken 40-char ID, the long Al-Madina Tower address) and every UI string is shown in the en-XA
pseudo-locale (mock.js, same transform as apps/web/src/lib/pseudo-locale.ts). User data is wrapped in
data-user so it stays readable. Run before build.py:  python .agent/design/tools/stress.py
"""
import json, pathlib, re

SRC = pathlib.Path(__file__).resolve().parent / 'src'
NAME_EN = 'Mohammad Abdur Rahman Chowdhury'
NAME_BN = 'মোহাম্মদ আব্দুর রহমান চৌধুরী'
NAME_F = 'Nusrat Jahan Binte Kamal'
BUILDING = 'Al-Madina Tower, House 12/B, Road 5, Block C, Nasirabad Housing Society'
BIG = '৳1,25,00,000'
ID40 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCD'

def user(text):
    return f'<span data-user>{text}</span>'

def names(s, mapping):
    for old, new in mapping:
        s = s.replace(f'>{old}<', f'>{user(new)}<').replace(old, new)
    return s

def variant(dev, name, title, edits, meta_extra=None):
    p = SRC / dev / f'{name}.html'
    s = p.read_text(encoding='utf8')
    m = re.match(r'\s*<!--meta\s+(\{.*?\})\s*-->', s, re.S)
    meta = json.loads(m.group(1))
    meta['title'] = title
    meta['pseudo'] = 'en-XA'
    meta.update(meta_extra or {})
    body = s[m.end():]
    for kind, a, b in edits:
        if kind == 'names':
            body = names(body, a)
        else:
            body = body.replace(a, b)
    out = SRC / dev / f'{name}--stress.html'
    out.write_text('<!--meta ' + json.dumps(meta, ensure_ascii=False) + ' -->' + body, encoding='utf8', newline='\n')

variant('mobile', '05-dashboard', 'S05 · Dashboard — stress (en-XA)', [
    ('r', '৳3,84,500', BIG), ('r', '৳2,61,200', '৳1,12,45,750'), ('r', '৳1,48,300', '৳12,54,250'), ('r', '26 bills · 7 still drafts', '1,234 units · 99+ drafts'),
    ('r', '৳40,700 in total', '৳1,25,00,000 in total'), ('r', 'Draft bills at Karnaphuli View', f'Draft bills at {BUILDING}'),
    ('names', [('Md. Rezaul Karim', NAME_EN), ('Imran Hossain', NAME_BN)], None), ('r', '৳14,200', BIG), ('r', '৳8,000', '−৳12,500'),
], {'bell': '99+'})
variant('desktop', '05-dashboard', 'S05d · Dashboard — stress (en-XA)', [
    ('r', '৳3,84,500', BIG), ('r', '৳2,61,200', '৳1,12,45,750'), ('r', '৳1,48,300', '৳12,54,250'),
    ('r', '7 draft bills at Karnaphuli View', f'99+ draft bills at {BUILDING}'),
    ('names', [('Md. Rezaul Karim', NAME_EN), ('Imran Hossain', NAME_BN), ('Tahmina Begum', NAME_F)], None), ('r', '৳14,200', BIG),
], {'bell': '99+'})
variant('mobile', '07-building-units', 'S07 · Building units — stress (en-XA)', [
    ('r', 'House 14, Road 3, Nasirabad Housing Society, Chattogram', BUILDING + ', Chattogram'), ('r', '৳40,339', BIG),
    ('names', [('Rumana Akter', NAME_EN), ('Md. Rezaul Karim', NAME_BN), ('Sabrina Haque', NAME_F), ('Rahman Pharmacy', 'Rahman Pharmacy and Diagnostic Centre Ltd.')], None),
    ('r', '৳3,000', BIG), ('r', '৳14,200', '−৳12,500'), ('r', '>G1<', '>G1-B<'),
], {'bell': '99+'})
variant('mobile', '13-payments-claims', 'S13 · Pending claims — stress (en-XA)', [
    ('names', [('Md. Rezaul Karim', NAME_EN), ('Imran Hossain', NAME_BN), ('Tahmina Begum', NAME_F)], None),
    ('r', '৳14,200', BIG), ('r', 'AK7P3M9QZT', ID40), ('r', 'Karnaphuli View 3B', BUILDING + ' 3B'), ('r', '৳18,500', '৳0'),
], {'bell': '99+'})
variant('mobile', '15-tenant-home-due', 'S15 · Tenant home — stress (en-XA)', [
    ('r', 'Shanti Neer · Flat 4A', BUILDING + ' · Flat 12/B'), ('r', '<span data-user>Nusrat</span>', user(NAME_F)),
    ('r', '৳16,475', BIG), ('r', '−৳9,000', '−৳12,500'), ('r', '৳7,475', '৳1,24,87,500'), ('r', 'BM-2026-000203', 'BM-2026-000123'),
], {'bell': '99+'})
variant('mobile', '18-tenant-bill', 'S18 · Tenant bill — stress (en-XA)', [
    ('r', '৳7,475', '৳1,24,87,500'), ('r', '৳16,475', BIG), ('r', '৳12,000', '৳1,20,00,000'), ('r', '−৳9,000', '−৳12,500'),
    ('r', '9ABCD1EFGH', ID40), ('r', 'BM-2026-000203', 'BM-2026-000123'),
    ('r', 'Shanti Neer, House 14, Road 3, Nasirabad, Chattogram', BUILDING + ', Chattogram'),
], {'bell': '99+', 'topbar': 'November 2026 bill · Flat 12/B'})
print('stress variants written')
