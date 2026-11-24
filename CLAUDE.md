# CLAUDE.md — 여신 사수 작업 규칙

Liner .EXE-THON 출품작입니다. **제출 마감 2026-11-25 23:59 KST** (목표: 11/25 오전 제출).
기획: `docs/PRD.md` · 일정: `docs/PLAN.md` · 판정 설계: `docs/RULES.md`

## 절대 원칙
1. **판정은 코드가 내린다.** `lib/rules`의 규칙 엔진만 판정 코드(허용/불허/조건부/심사위/보류/역질문/내부지침)를 결정한다. LLM(Liner Router·Search Agent)은 조건 추출, 역질문 문장, 근거 설명에만 쓴다.
2. **모든 판정 근거는 Fact ID로 추적한다.** 근거는 `data/kb/facts.json`(원본 `data/factsheet.md`)에만 있다. 원문에 없는 내용은 만들지 말고 `보류`로 처리한다.
3. **Search Agent 답변은 원문 대조 전에는 화면에 내보내지 않는다.** 비결정적이고 과잉 일반화가 확인됐다(`data/liner_spike/REPORT.md`).
4. **규제 회피 방법은 안내하지 않는다.** (예: 만기 전 조기 연장으로 신규 규정을 피하는 방법)

## 보안·공개 규칙
- `LINER_API_KEY`는 `.env`(gitignore)와 Vercel 환경변수에만 둔다. 코드·로그·커밋·채팅에 키 값을 출력하지 않는다. 커밋 전 `git grep -nE "sk_l[A-Za-z0-9_-]{8,}"`로 검사한다.
- 실제 은행명·실제 고객·실제 단톡방 대화를 쓰지 않는다. 은행은 **"가상 A은행"**, 출처 관찰은 "시중은행 지점 직원 커뮤니티"로 표기한다.
- `Raw data/`, `data/survey_*.md`는 커밋하지 않는다(개인 기획 자료·내부 설문).
- 저장소는 제출 직전까지 비공개. 공개 전환 전에 키·개인정보를 다시 검사한다.

## 데이터 흐름
- `data/factsheet.md` → `npm run data:build` → `data/kb/facts.json`
- `data/testset_v0.md` → 같은 명령 → `data/eval/testset.json` (각 문항에 KB v1/v2 정답)
- KB v1 = 보도자료·FAQ만, KB v2 = Liner가 찾은 8.28 행정지도 추가. 이 차이가 데모의 "타임머신" 장면이다.
- 가상 A은행 지침: `data/bank/` (실제 은행 기준이 아님을 화면에 표시)

## 개발
- `npm run dev` / `npm run build` / `npm test` (vitest) / `npm run liner:smoke`
- Liner 호출은 반드시 `lib/liner`를 거친다(재시도·캐시·Search Agent 직렬 큐·출처 신뢰도).
- 데모 안정성: `LOANDESK_DEMO_REPLAY=1`이면 `data/demo_cache`의 저장 응답만 사용한다.
- 기준일은 코드에 하드코딩하지 말고 입력값(`asOf`, 기본 오늘)으로 받는다. 테스트셋 기준일은 2026-11-13.
- main에 push하면 Vercel이 자동 배포한다(https://loandesk-copilot-rosy.vercel.app).
