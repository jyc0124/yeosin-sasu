#!/usr/bin/env bash
# Codex 격리 폴더 생성 — 공개 자료만 복사한다.
set -euo pipefail
W="${1:?usage: workspace.sh <dir>}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
rm -rf "$W"; mkdir -p "$W/official"
cp "$ROOT"/data/official/text/*.txt "$W/official/"
cp "$ROOT/data/factsheet.md" "$W/factsheet.md"
grep -v "^>" "$ROOT/data/field_questions_v1.md" | sed 's/^# 현장 질문 세트 v1 (field_questions_v1)/# 현장 질문 예시 (말투·난이도 참고용)/' > "$W/field_examples.md"
cp "$(dirname "$0")/VERDICTS.md" "$W/VERDICTS.md"
python3 -I - "$ROOT/data/eval/codex" "$W/used.md" <<'PY'
import json,sys,glob,os
qs=[]
for p in sorted(glob.glob(os.path.join(sys.argv[1],'codex_v*_raw.json'))):
    qs+=[x['question'] for x in json.load(open(p))['questions']]
open(sys.argv[2],'w').write('# 이미 낸 질문(상황·쟁점이 겹치지 말 것)\n'+'\n'.join('- '+q[:120].replace('\n',' ') for q in qs)+'\n')
print(len(qs),'used questions')
PY
if grep -rlE "sk_l[A-Za-z0-9_-]{8,}|LINER_API_KEY" "$W"; then echo "secret-like string found" >&2; exit 1; fi
echo "workspace ready: $W"
