# Codex 독립 출제·채점 도구 (docs/FIELD_UPGRADE.md)

Codex CLI를 **독립 출제자·두 번째 채점자**로 쓴다. 제품 실행 경로에는 들어가지 않는다(측정 전용).

- `workspace.sh <폴더>` : Codex가 읽을 격리 폴더를 만든다. **공개 자료만** 복사(정부 발표 자료 원문·factsheet·현장 질문 예시·답변 코드 정의·이미 낸 질문 목록). `.env`·`Raw data/`·설문 파일은 절대 넣지 않는다.
- `gen_schema.json`, `gen_prompt_v4.md` : 출제(세트 v4).
- `freeze.py` : 출제 원본 → 개발용/검증용 분할(카테고리별 층화, 고정 시드) + sha256 기록 → `data/eval/codex/`.
- `judge_paired_prompt.md`, `judge_paired_schema.json`, `export_paired.py` : **블라인드 비교 채점**(이전·이후 두 답을 한 세션에서 A/B 무작위로). 세션을 따로 돌린 채점은 편차가 커서 비교에 쓰지 않는다(v3에서 확인).

실행 예:
```bash
W=$TMPDIR/codex_ws; scripts/codex/workspace.sh $W
(cd $W && codex exec --skip-git-repo-check --ephemeral -s read-only -C $W \
  --output-schema "$PWD/scripts/codex/gen_schema.json" -o out.json "$(cat scripts/codex/gen_prompt_v4.md)" < /dev/null)
```
`< /dev/null` 필수(없으면 stdin 대기로 멈춤).

**권장: `scripts/codex/run.sh <작업 폴더> <프롬프트 파일> <결과 파일> [제한 초] [추가 옵션]`** — stdin을 항상 닫고(`< /dev/null`), 제한 시간(기본 1200초)을 넘기면 끝낸다. 직접 `codex exec`를 부르지 말고 이 래퍼를 쓴다.
원인: `codex exec`는 stdin이 터미널이 아니면 끝(EOF)까지 읽어 프롬프트 뒤에 붙인다. Claude Code 백그라운드 셸의 stdin은 닫히지 않아 "Reading additional input from stdin..."에서 멈춘다.
