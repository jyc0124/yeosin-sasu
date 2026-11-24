#!/usr/bin/env bash
# 회귀 평가 한 번에: 예시 45·바꿔 쓴 질문 28·처음 보는 질문 41·사용자 점검 25·현장 14·현장 변형 14 + 참고 세트
# 사용: scripts/eval-regress.sh <태그>   → data/eval/runs/regress_<태그>.log
set -uo pipefail
cd "$(dirname "$0")/.."
TAG="${1:?usage: eval-regress.sh <tag>}"; R="$PWD/data/eval/runs"; L="$R/regress_$TAG.log"
(
echo "=== extract"; npm run eval:extract -- --no-cache 2>&1 | grep "모듈 "
echo "=== paraphrase"; npm run eval:extract -- --no-cache --set=paraphrase 2>&1 | grep "모듈 "
for s in "" "--set=holdout" "--set=holdout2"; do echo "=== novel $s"; npx tsx --env-file=.env scripts/eval-novel.ts --no-cache $s 2>&1 | grep -E "✗|정답"; done
echo "=== probe"; npx tsx --env-file=.env scripts/eval-probe.ts 2>&1 | grep -E "^### .*MISS"
echo "=== field"; OUT="$R/field_$TAG.json" npx tsx --env-file=.env scripts/eval-field.ts > "$R/field_$TAG.log" 2>&1; grep -E "^###|^==" "$R/field_$TAG.log"
echo "=== variants"; OUT="$R/variants_$TAG.json" npx tsx --env-file=.env scripts/eval-field.ts --set=variants 2>&1 | grep -E "MISS|== "
echo "=== v3 (참고: 결과를 본 세트)"; OUT="$R/v3_$TAG.json" npx tsx --env-file=.env scripts/eval-field.ts --set=codex-v3 > "$R/v3_$TAG.log" 2>&1; grep "^==" "$R/v3_$TAG.log"
) < /dev/null > "$L" 2>&1
cat "$L"
