# 출제 원본 → 개발용/검증용 고정(카테고리별 층화, 고정 시드, sha256 기록)
# 사용: python3 -I freeze.py <raw.json> <out_prefix> <dev_per_cat_ratio> <source 설명>
import json,sys,hashlib,random,collections
raw,prefix,ratio,src=sys.argv[1],sys.argv[2],float(sys.argv[3]),sys.argv[4]
data=open(raw,'rb').read(); sha=hashlib.sha256(data).hexdigest()
qs=json.loads(data)['questions']; by=collections.defaultdict(list)
for q in qs: by[q['category']].append(q)
rnd=random.Random(sha); dev=[]; test=[]
for c in sorted(by):
    L=sorted(by[c],key=lambda q:q['id']); rnd.shuffle(L); n=round(len(L)*ratio)
    dev+=L[:n]; test+=L[n:]
for name,cs,rule in [("dev",dev,"개발용 — 실패를 보고 고쳐도 됨(과대평가 가능)"),("test",test,"검증 전용 — 결과를 보고 고치지 않는다")]:
    json.dump({"source":src,"sha256_raw":sha,"rule":rule,"asOf":"2026-11-21","split":name,"cases":sorted(cs,key=lambda q:q['id'])},open(f"{prefix}_{name}.json","w"),ensure_ascii=False,indent=1)
    print(name,len(cs),collections.Counter(q['category'] for q in cs))
print('sha256',sha)
