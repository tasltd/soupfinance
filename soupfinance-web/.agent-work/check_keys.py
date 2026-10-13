import json, re, glob
def flat(d, p=''):
    out = {}
    for k, v in d.items():
        kk = f'{p}{k}'
        if isinstance(v, dict): out.update(flat(v, kk + '.'))
        else: out[kk] = v
    return out
norm = lambda k: re.sub(r'_(one|other|zero|two|few|many|plural)$', '', k)
bad = 0
for ns in ['common', 'ledger', 'accounting']:
    en = flat(json.load(open(f'src/i18n/locales/en/{ns}.json')))
    en_n = {norm(k) for k in en}
    for lang in ['de', 'fr', 'nl']:
        other = {norm(k) for k in flat(json.load(open(f'src/i18n/locales/{lang}/{ns}.json')))}
        missing = en_n - other
        if missing: bad += 1; print(ns, lang, 'MISSING', sorted(missing)[:20])
        # interpolation placeholders must match
        o = flat(json.load(open(f'src/i18n/locales/{lang}/{ns}.json')))
        for k, v in en.items():
            ph = set(re.findall(r'{{(\w+)}}', v))
            cands = [x for x in o if norm(x) == norm(k)]
            for c in cands:
                if set(re.findall(r'{{(\w+)}}', o[c])) - {'count'} != ph - {'count'}:
                    print(ns, lang, 'PLACEHOLDER', c, ph, o[c]); bad += 1
# literal keys used in code
files = ['src/features/ledger/ChartOfAccountsPage.tsx','src/features/ledger/LedgerTransactionsPage.tsx','src/features/accounting/JournalEntryPage.tsx','src/features/accounting/VoucherFormPage.tsx','src/features/accounting/TransactionRegisterPage.tsx','src/components/feedback/ConfirmDialog.tsx','src/components/feedback/ApiErrorState.tsx','src/components/help/HelpLink.tsx']
nsmap = {'ledger':'ledger','accounting':'accounting'}
for f in files:
    src = open(f).read()
    m = re.search(r"useTranslation\('(\w+)'\)", src); dns = m.group(1) if m else 'common'
    for key in re.findall(r"""\bt\(\s*['"]([\w:.]+)['"]""", src) + re.findall(r'i18nKey="([\w:.]+)"', src):
        ns, k = (key.split(':') if ':' in key else (dns, key))
        keys = {norm(x) for x in flat(json.load(open(f'src/i18n/locales/en/{ns}.json')))}
        if k not in keys: print('UNDEFINED', f, key); bad += 1
print('problems:', bad)
