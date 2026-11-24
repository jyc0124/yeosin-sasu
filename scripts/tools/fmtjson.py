# 2단계(최상위·두 번째 키)까지만 줄바꿈하고 항목은 한 줄로 쓰는 저장소 관례 형식
import json,sys
p=sys.argv[1]; d=json.load(open(p))
d1=lambda v: json.dumps(v,ensure_ascii=False,separators=(', ',': ')).replace('{"','{ "').replace('"}','" }').replace('], "','], "').replace('}', ' }').replace('  }',' }') if isinstance(v,dict) else json.dumps(v,ensure_ascii=False)
out=['{']
keys=list(d.keys())
for i,k in enumerate(keys):
    v=d[k]; comma=',' if i<len(keys)-1 else ''
    if isinstance(v,dict) and v and all(isinstance(x,dict) for x in v.values()):
        out.append(f' "{k}": {{')
        ks=list(v.keys())
        for j,kk in enumerate(ks):
            out.append(f'  "{kk}": {d1(v[kk])}'+(',' if j<len(ks)-1 else ''))
        out.append(' }'+comma)
    else:
        out.append(f' "{k}": {json.dumps(v,ensure_ascii=False)}'+comma)
out.append('}')
open(p,'w').write('\n'.join(out)+'\n')
