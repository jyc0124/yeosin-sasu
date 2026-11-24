"""factsheet.md / testset_v0.md → JSON 변환 (python3 -I scripts/md2json.py)"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "data"

def rows(md: str):
    for line in md.splitlines():
        if line.startswith("| ") and not line.startswith("|---") and not line.startswith("| ID") and not line.startswith("| 약칭"):
            yield [c.strip() for c in line.strip().strip("|").split("|")]

def clean(s: str) -> str:
    return re.sub(r"\*\*|~~", "", s).strip()

# ---------- facts ----------
fs = (D / "factsheet.md").read_text()
part = None
facts, gaps = [], []
for line in fs.splitlines():
    if line.startswith("## Part"):
        part = line[3:].strip()
    if not line.startswith("| **") and not line.startswith("| ~~"):
        continue
    c = [x.strip() for x in line.strip().strip("|").split("|")]
    fid = clean(c[0])
    if fid.startswith("F"):
        policy = fid.split("-")[0][1:]  # 813 / 401 / 828 / 020(10.20 고시)
        facts.append({
            "id": fid,
            "policy": {"813": "2026-08-13", "401": "2026-04-01", "828": "2026-08-28", "020": "2026-10-20"}[policy],
            "part": part,
            "text": clean(c[1]),
            "source": clean(c[2]),
            # KB v1 = 보도자료·FAQ만 / v2 = Liner가 찾은 후속 문서(8.28 행정지도, 10.20 재지정 고시) 추가
            "kb": "v2" if policy in ("828", "020") else "v1",
        })
    elif fid.startswith("G"):
        gaps.append({"id": fid, "topic": clean(c[1]), "note": clean(c[2]), "resolved": line.startswith("| ~~")})

sources = []
for c in rows(fs.split("## 출처 문서")[1].split("\n---\n")[0]):
    sources.append({"abbr": clean(c[0]), "title": clean(c[1]), "url": clean(c[2])})
sources.append({"abbr": "행정지도", "title": "주택담보대출에 대한 리스크 관리 기준(행정지도, 2026.8.28)",
                "url": "https://better.fsc.go.kr/fsc_new/status/adminMap/OpertnDetail.do?stNo=11&muNo=145&postNo=4918", "kb": "v2"})

# ---------- testset ----------
VERDICTS = ["허용", "불허", "조건부", "심사위", "보류", "역질문", "내부지침"]
fact_ids = {f["id"] for f in facts}

def expand_refs(s: str):
    out, prefix = [], None
    for tok in re.split(r"[,\s]+", clean(s).replace("(L)", "")):
        tok = re.sub(r"[➊-➓①-⑩]", "", tok)
        if not tok:
            continue
        m = re.match(r"^(F\d{3})-(\d{2})(?:~(\d{2}))?$", tok)
        if m:
            prefix = m.group(1)
            a, b = int(m.group(2)), int(m.group(3) or m.group(2))
            out += [f"{prefix}-{i:02d}" for i in range(a, b + 1)]
        elif re.match(r"^\d{2}$", tok) and prefix:
            out.append(f"{prefix}-{tok}")
        elif re.match(r"^G-\d{2}$", tok):
            out.append(tok)
    return out

ts = (D / "testset_v0.md").read_text()
cases = []
for c in rows(ts):
    if not re.match(r"^[ABC]\d{2}$", c[0]):
        continue
    raw = c[2]
    verdict = next(v for v in VERDICTS if clean(raw).startswith(v))
    refs = expand_refs(c[3])
    bad = [r for r in refs if r.startswith("F") and r not in fact_ids]
    if bad:
        sys.exit(f"{c[0]}: 알 수 없는 Fact {bad}")
    # 판정 근거가 8.28 행정지도뿐인 문항만 v1에서 보류가 정답
    needs_828 = any(r.startswith("F828") for r in refs) and all(r.startswith(("F828", "G-")) for r in refs)
    cases.append({
        "id": c[0],
        "type": c[0][0],
        "question": c[1],
        "expected": verdict,
        "expected_raw": clean(raw),
        # KB v1(행정지도 없음)에서의 정답: 8.28 경과조치가 필요한 문항은 '보류'가 맞다
        "expected_v1": "보류" if needs_828 and verdict != "보류" else verdict,
        # 함께 정답으로 인정하는 판정: 질문에 담보 소재지가 없으면 '불허' 대신 '역질문'(소재지 확인)도 맞다(현장 피드백 11/24)
        "accept": [verdict] + (["역질문"] if "또는 역질문" in raw else []),
        "liner": "(L)" in raw or "(L)" in c[3],
        "facts": refs,
        "answer": clean(c[4]),
    })

(D / "kb").mkdir(exist_ok=True)
json.dump({"version": "2026-11-13", "sources": sources, "facts": facts, "gaps": gaps},
          open(D / "kb" / "facts.json", "w"), ensure_ascii=False, indent=1)
json.dump({"version": "v0", "base_date": "2026-11-13", "verdicts": VERDICTS, "cases": cases},
          open(D / "eval" / "testset.json", "w"), ensure_ascii=False, indent=1)
from collections import Counter
print("facts", len(facts), Counter(f["kb"] for f in facts), "gaps", len(gaps))
print("cases", len(cases), Counter(c["type"] for c in cases), Counter(c["expected"] for c in cases))
print("v1≠v2:", [c["id"] for c in cases if c["expected"] != c["expected_v1"]], "L:", [c["id"] for c in cases if c["liner"]])
