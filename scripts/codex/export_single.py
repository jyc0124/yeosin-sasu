# 단일 채점 입력: eval-field OUT json → answers.json (최종 측정용, 비교 대상 없음)
# 사용: python3 -I export_single.py <run.json> <answers.json>
import json,sys
r,out=sys.argv[1:3]
def conv(r): return {"verdict":r.get("got"),"conclusion":r.get("headline"),"confirmedBasis":r.get("basis",[]),"conditions":r.get("conditions",[]),"askCustomer":r.get("questions",[]),"branches":r.get("branches"),"openIssues":r.get("gaps",[]),"inScopeParts":r.get("related",[]),"documents":r.get("documents",[])}
rows=json.load(open(r))
json.dump([{"id":x["id"],"question":x["q"],"followUps":x.get("f") or [],"answer":conv(x)} for x in rows],open(out,"w"),ensure_ascii=False,indent=1)
print(len(rows))
