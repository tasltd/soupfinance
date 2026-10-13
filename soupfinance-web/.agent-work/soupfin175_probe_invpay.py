import json, urllib.request
B='http://10.115.213.183:9090'; TOK=open('/tmp/soupfin175-tok').read().strip()
H={'X-Auth-Token':TOK,'Accept':'application/json','Content-Type':'application/json'}
def call(m,p,data=None):
    r=urllib.request.Request(B+p,method=m,headers=H,data=json.dumps(data).encode() if data is not None else None)
    try:
        with urllib.request.urlopen(r,timeout=90) as x: return x.status, x.read().decode()
    except urllib.error.HTTPError as e: return e.code, e.read().decode()
inv=json.loads(call('GET','/rest/invoice/index.json?max=1')[1])[0]['id']
st,body=call('POST','/rest/invoicePayment/save.json',{'invoice.id':inv,'amount':0.01,'paymentDate':'2026-10-13'})
print('invoice dot', st, body[:300])
bill='9058ec1b417c44e88f0c21b9bed3d5f6'
st,body=call('POST','/rest/billPayment/save.json',{'bill.id':bill,'amount':1,'paymentDate':'2026-10-13'})
print('bill dot', st, body[:200])
acct=[r for r in json.load(open('/tmp/soupfin175-la-0.json')) if 'ASSET' in (r.get('ledgerAccountCategory') or {}).get('serialised','')][0]['id']
st,body=call('POST','/rest/billPayment/save.json',{'bill':{'id':bill},'amount':1,'paymentDate':'2026-10-13','payOutAccount':{'id':acct}})
print('bill nested', st, body[:300])
if st==201: print('cleanup', call('DELETE',f"/rest/billPayment/delete/{json.loads(body)['id']}.json?relationChecked=true")[0])
