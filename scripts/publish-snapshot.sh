#!/usr/bin/env bash
# 제출용 공개 저장소 사본 만들기: 커밋된 현재 파일(HEAD)만 꺼내 새 git 저장소에 한 커밋으로 담는다.
# 지난 커밋 기록(검색 결과에 섞인 연락처·개인 메모·작성자 이메일)은 따라가지 않는다.
# 사용: scripts/publish-snapshot.sh <빈 폴더 경로>
#   AUTHOR_NAME, AUTHOR_EMAIL로 작성자를 바꿀 수 있다(기본: GitHub noreply 주소).
# 푸시는 이 스크립트가 하지 않는다. 끝에 나오는 안내대로 사람이 확인한 뒤 한다.
set -euo pipefail

OUT="${1:?사용: scripts/publish-snapshot.sh <빈 폴더 경로>}"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  커밋되지 않은 변경이 있습니다. 사본에는 커밋된 파일(HEAD)만 들어갑니다." >&2
  git status --short >&2
fi
if [ -e "$OUT" ] && [ -n "$(ls -A "$OUT" 2>/dev/null)" ]; then
  echo "❌ $OUT 이 비어 있지 않습니다." >&2; exit 1
fi
mkdir -p "$OUT"
git archive --format=tar HEAD | tar -x -C "$OUT"
# 결선 시연 준비 등 비공개 문서(docs/private/)는 개발 저장소에만 두고 공개 사본에서 뺀다
rm -rf "$OUT/docs/private"
SRC_COMMIT="$(git rev-parse --short HEAD)"
SRC_COUNT="$(git rev-list --count HEAD)"

cd "$OUT"
fail=0
# 1) API 키
if grep -rInE "sk_l[A-Za-z0-9_-]{8,}" . ; then echo "❌ API 키 형식 문자열" >&2; fail=1; fi
# 2) 휴대전화 번호(테스트용 가짜 번호 010-1234-5678과 가린 번호는 제외)
if grep -rInE "01[016789]-?[0-9]{3,4}-?[0-9]{4}" --include="*.json" --include="*.md" --include="*.ts" --include="*.tsx" --include="*.log" . \
   | grep -vE "010-1234-5678|\*\*\*\*" | grep -vE "https?://[^ \"]*01[016789]" ; then
  echo "❌ 휴대전화 번호로 보이는 문자열" >&2; fail=1
fi
# 3) 로컬 경로·커밋 금지 폴더
if grep -rIn "/Users/" --exclude=publish-snapshot.sh . | head -3 | grep -q .; then echo "⚠️  로컬 경로(/Users/)가 남아 있습니다(위 확인)." >&2; grep -rIn "/Users/" --exclude=publish-snapshot.sh . | head -3 >&2; fi
for d in "Raw data" data/feedback docs/private; do [ -e "$d" ] && { echo "❌ 커밋 금지 폴더: $d" >&2; fail=1; }; done
ls data/survey_* >/dev/null 2>&1 && { echo "❌ 커밋 금지 파일: data/survey_*" >&2; fail=1; }
[ -e .env ] && { echo "❌ .env 포함" >&2; fail=1; }
[ "$fail" = 0 ] || { echo "검사 실패 — 사본을 지우고 원본을 고친 뒤 다시 실행하세요: rm -rf \"$OUT\"" >&2; exit 1; }

git init -q -b main
git add -A
GIT_AUTHOR_NAME="${AUTHOR_NAME:-jyc0124}" GIT_AUTHOR_EMAIL="${AUTHOR_EMAIL:-jyc0124@users.noreply.github.com}" \
GIT_COMMITTER_NAME="${AUTHOR_NAME:-jyc0124}" GIT_COMMITTER_EMAIL="${AUTHOR_EMAIL:-jyc0124@users.noreply.github.com}" \
git commit -q -m "여신 사수 — Liner .EXE-THON 제출본

개발 저장소(비공개) ${SRC_COMMIT} 시점의 파일. 개발 기록 ${SRC_COUNT}커밋(2026-11-13~)은 비공개 저장소에 있다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

echo "✅ 사본 준비 완료: $OUT ($(git ls-files | wc -l | tr -d ' ')개 파일, 원본 ${SRC_COMMIT})"
echo "다음 단계(사람이 확인 후):"
echo "  1) GitHub에서 빈 공개 저장소 만들기(README·.gitignore 추가하지 않음)"
echo "  2) cd \"$OUT\" && git remote add origin https://github.com/<계정>/<저장소>.git && git push -u origin main"
echo "  3) 시크릿 창에서 저장소가 열리는지 확인"
