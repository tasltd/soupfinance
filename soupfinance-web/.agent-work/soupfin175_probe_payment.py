import json, urllib.request, urllib.parse, http.cookiejar
B='http://10.115.213.183:9090'; TOK=open('/tmp/soupfin175-tok').read().strip()
cj=http.cookiejar.CookieJar(); op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
H={'X-Auth-Token':TOK,'Accept':'application/json','Content-Type':'application/json'}
def call(m,p,data=None):
    r=urllib.request.Request(B+p,method=m,headers=H,data=json.dumps(data).encode() if data is not None else None)
    try:
        with op.open(r,timeout=90) as x: return x.status, x.read().decode()
    except urllib.error.HTTPError as e: return e.code, e.read().decode()
bill='9058ec1b417c44e88f0c21b9bed3d5f6'
st,c=call('GET','/rest/billPayment/create.json'); print(st, c[:600]); c=json.loads(c)
print('create keys', [k for k in c if 'ccount' in k.lower() or 'method' in k.lower()][:10])

pm=json.loads(call('GET','/rest/paymentMethod/index.json?max=5')[1])
la=[a for a in json.loads(call('GET','/rest/ledgerAccount/index.json?max=200')[1]) if (a.get('ledgerGroup')=='ASSET')]
print('pm', [(x['id'],x.get('name')) for x in pm[:2]]); print('asset', [(a['id'],a.get('name')) for a in la[:2]], len(la))
for label,payload in [
 ('dot', {'bill.id':bill,'amount':1,'paymentDate':'2026-10-13'}),
 ('nested-min', {'bill':{'id':bill},'amount':1,'paymentDate':'2026-10-13'}),
 ('nested-full', {'bill':{'id':bill},'amount':1,'paymentDate':'2026-10-13','paymentMethod':{'id':pm[0]['id']},'payOutAccount':{'id':la[0]['id']}}),
]:
    st,body=call('POST','/rest/billPayment/save.json',payload)
    print(label, st, body[:500]); print()
    if st==201:
        pid=json.loads(body)['id']; print('cleanup', call('DELETE',f'/rest/billPayment/delete/{pid}.json?relationChecked=true')[0])
