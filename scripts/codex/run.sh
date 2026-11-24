#!/usr/bin/env bash
# Codex를 멈추지 않게 실행하는 래퍼. 프롬프트는 파일로 받는다.
# 원인: codex exec는 stdin이 터미널이 아니면(백그라운드·파이프) 끝(EOF)까지 읽어 프롬프트 뒤에 붙인다.
#       Claude Code 백그라운드 셸의 stdin은 닫히지 않아 Codex가 "Reading additional input from stdin..."에서 영원히 기다린다.
# 해결: stdin을 항상 /dev/null로 닫고, 제한 시간(기본 20분)을 넘기면 끝낸다.
# 사용: scripts/codex/run.sh <작업 폴더> <프롬프트 파일> <결과 파일> [제한 초] [codex exec 추가 옵션...]
set -euo pipefail
DIR="${1:?작업 폴더}"; PROMPT="${2:?프롬프트 파일}"; OUT="${3:?결과 파일}"; LIMIT="${4:-1200}"
shift $(( $# >= 4 ? 4 : 3 ))
ERR="${OUT%.*}.err"
# perl alarm으로 제한 시간(macOS에는 timeout 명령이 없음)
perl -e 'alarm shift; exec @ARGV' "$LIMIT" \
  codex exec --skip-git-repo-check --ephemeral -s read-only -C "$DIR" "$@" "$(cat "$PROMPT")" \
  < /dev/null > "$OUT" 2> "$ERR" && rc=0 || rc=$?
if [ "$rc" = 142 ]; then echo "⏱ 제한 시간 ${LIMIT}초 초과로 중단 — $ERR 확인" >&2; fi
echo "exit $rc · 결과 $OUT ($(wc -c < "$OUT" | tr -d ' ')바이트)"
exit "$rc"
