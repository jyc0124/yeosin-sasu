# 블라인드 비교 채점 입력: 두 실행 결과(eval-field OUT json) → answers.json(A/B 무작위) + 키 파일
# 사용: python3 -I export_paired.py <before.json> <after.json> <answers.json> <key.json> [seed]
import json,sys,random
b,a,out,key=sys.argv[1:5]; seed=int(sys.argv[5]) if len(sys.argv)>5 else 20261122
def conv(r): return {"verdict":r.get("got"),"conclusion":r.get("headline"),"confirmedBasis":r.get("basis",[]),"conditions":r.get("conditions",[]),"askCustomer":r.get("questions",[]),"openIssues":r.get("gaps",[]),"inScopeParts":r.get("related",[]),"documents":r.get("documents",[])}
B={r["id"]:r for r in json.load(open(b))}; A={r["id"]:r for r in json.load(open(a))}
rnd=random.Random(seed); ans=[]; k={}
for i in B:
    x,y=(B[i],A[i]) if rnd.random()<0.5 else (A[i],B[i])
    k[i]={"A":"before" if x is B[i] else "after","B":"before" if y is B[i] else "after"}
    ans.append({"id":i,"question":B[i]["q"],"followUps":B[i].get("f") or [],"answerA":conv(x),"answerB":conv(y)})
json.dump(ans,open(out,"w"),ensure_ascii=False,indent=1); json.dump(k,open(key,"w"))
print(len(ans))
