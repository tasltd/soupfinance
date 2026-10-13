"""Deep-merge translation additions into src/i18n/locales/{lang}/{ns}.json (SOUPFIN-164)."""
import json, sys
def merge(dst, src):
    for k, v in src.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            merge(dst[k], v)
        else:
            dst[k] = v
def apply(ns, by_lang):
    for lang, add in by_lang.items():
        p = f'src/i18n/locales/{lang}/{ns}.json'
        data = json.load(open(p, encoding='utf-8'))
        merge(data, add)
        open(p, 'w', encoding='utf-8').write(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
