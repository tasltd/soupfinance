import json, sys, urllib.request
B = 'http://10.115.213.183:9090'
TOK = open('/tmp/soupfin175-tok').read().strip()
def req(method, path):
    r = urllib.request.Request(B + path, method=method, headers={'X-Auth-Token': TOK, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            body = resp.read().decode() or ''
            return resp.status, body
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
def cleanup(bill):
    for c in ('billPayment', 'billItem'):
        st, body = req('GET', f'/rest/{c}/index.json?bill.id={bill}&max=100')
        for x in json.loads(body or '[]'):
            print(' ', c, req('DELETE', f'/rest/{c}/delete/{x["id"]}.json?relationChecked=true')[0])
    for _ in range(4):
        st, body = req('DELETE', f'/rest/bill/delete/{bill}.json')
        try: rel = (json.loads(body) or {}).get('relatedList') or []
        except Exception: rel = []
        if not rel:
            print('  bill delete', st, body[:150]); break
        for r in {(r['relatedToClassSimpleName'], r['relatedToId']) for r in rel}:
            print(' ', r[0], req('DELETE', f'/rest/{r[0]}/delete/{r[1]}.json?relationChecked=true')[0])
    print('  show after', req('GET', f'/rest/bill/show/{bill}.json')[0])
for b in sys.argv[1:]:
    print(b); cleanup(b)
