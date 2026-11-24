// 비교 기준(baseline): 규칙 엔진 없이 LLM(Liner Router)에게 판정 코드를 바로 물었을 때.
//   --mode=bare : 질문만 준다(정책 원문 없음)
//   --mode=docs : KB v2 Fact·원문 공백 전체 + 추출기와 같은 해석 관례를 프롬프트에 넣는다(엔진 없는 RAG에 해당)
//                 ※ 공정 비교: 여신 사수 추출기가 쓰는 관례(docs/RULES.md §6-1)를 똑같이 준다. 다른 점은 판정을 LLM이 하느냐뿐.
// 실행: npm run eval:baseline -- --mode=bare|docs [--no-cache]
// 결과: data/eval/runs/baseline_<mode>_<timestamp>.json
import { promises as fs } from "node:fs";
import path from "node:path";
import testset from "../data/eval/testset.json";
import kb from "../data/kb/facts.json";
import { chatJson, type RouterModel } from "../lib/liner";
import type { VerdictCode } from "../lib/rules/types";

const CODES: VerdictCode[] = ["허용", "불허", "조건부", "심사위", "보류", "역질문", "내부지침"];
const MODEL: RouterModel = "liner-gpt-router";

const DEFINITIONS = `판정 코드(하나만 고른다):
- 허용: 규제 대상이 아니거나 예외가 확정돼 서류만 받으면 됨
- 조건부: 확인 항목(기간 제한·증빙 등)을 충족하면 허용
- 불허: 원칙적 제한에 해당하고 예외 없음
- 심사위: 금융회사 여신심사위원회 판단 사항. 지점이 확답할 수 없음
- 내부지침: 금융회사 내부 기준에 위임된 사항
- 보류: 공식 기준이 없거나 최신 정보가 필요해 확정할 수 없음
- 역질문: 판정에 필요한 정보가 질문에 부족함`;

function system(mode: "bare" | "docs"): string {
  const base = `너는 시중은행 지점 여신 창구의 대출 규정 판정 보조다. 오늘은 ${testset.base_date}이다.
대상 정책: 2026.8.13 「부동산 시장 안정을 위한 금융 종합대책」(비거주 1주택자 전세대출 제한), 2026.4.1 「가계부채 관리방안」(다주택자 수도권·규제지역 아파트 주담대 만기연장 제한).
창구 직원의 질문을 읽고 판정 코드 하나와 한 문장 이유를 답한다.
${DEFINITIONS}`;
  if (mode === "bare") return base;
  const facts = (kb.facts as { id: string; text: string; source: string }[]).map((f) => `[${f.id}] ${f.text} (${f.source})`).join("\n");
  const gaps = (kb.gaps as { id: string; topic: string; note: string; resolved: boolean }[])
    .map((g) => `[${g.id}] ${g.topic}: ${g.note}${g.resolved ? " (후속 문서로 해소)" : ""}`)
    .join("\n");
  return `${base}

# 창구 질문 해석 관례(코파일럿 추출기와 같음)
- '다주택'·'여러 채'·'집 하나가 ~'는 세대 2주택 이상 다주택자로 본다. 주택 수 없이 4.1 만기연장 예외(임차인·실거주의무·등록임대·통보)를 묻는 질문도 다주택자 건이다.
- 세입자 이야기가 있고 가계약이라는 말이 없으면 '26.4.1 기준 유효한 임대차계약으로 본다. '2년 재계약'처럼 기간만 있으면 기존 종료일 + 기간.
- 날짜에 일이 없으면 그 달 15일, 연도가 없으면 기준일 이후 가장 가까운 날(지난 사건은 이전 가장 가까운 날)로 본다.
- 실거주 이력은 본인 또는 배우자 기준이다. 고객 본인이 안 살았다는 말만 있으면 배우자 이력은 모른다.
- 질문이 고객을 비거주 1주택자로 전제하거나, 보유 주택 사실관계 없이 시행 시점·예외 사유만 물으면 비거주 1주택자로 본다.
- 임대사업자의 '주된 영업' 판단은 금융회사 내부 기준이다.
- 고객 건의 사실관계가 있어도 쟁점이 제도 자체(전입신고만, 가계약금만, 다른 은행 사례 등)면 그 쟁점으로 판정한다.
- 판정에 꼭 필요한 정보가 없을 때만 '역질문'. 관례로 채울 수 있으면 채워서 판정한다.

아래 정책 근거만 사용한다. 근거에 없으면 '보류'로 답한다.
# 정책 근거(Fact)
${facts}

# 원문 공백
${gaps}`;
}

const SCHEMA = {
  name: "verdict",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["verdict", "reason"],
    properties: { verdict: { type: "string", enum: CODES }, reason: { type: "string" } },
  },
};

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const mode = (args.find((a) => a.startsWith("--mode="))?.slice(7) ?? "bare") as "bare" | "docs";
  if (mode !== "bare" && mode !== "docs") throw new Error(`알 수 없는 mode: ${mode}`);
  const useCache = !args.includes("--no-cache");
  const sys = system(mode);

  const rows = await pool(testset.cases, 4, async (tc) => {
    const t0 = Date.now();
    try {
      const r = await chatJson<{ verdict: VerdictCode; reason: string }>(
        [
          { role: "system", content: sys },
          { role: "user", content: tc.question },
        ],
        SCHEMA,
        { model: MODEL, temperature: 0, useCache, timeoutMs: 60_000 },
      );
      return { id: tc.id, verdict: r.verdict, reason: r.reason, ms: Date.now() - t0 };
    } catch (e) {
      return { id: tc.id, verdict: null, error: (e as Error).message, ms: Date.now() - t0 };
    }
  });

  const ok = rows.filter((r) => r.verdict === testset.cases.find((c) => c.id === r.id)!.expected).length;
  console.log(`${mode}: 정답 ${ok}/${rows.length}, 오류 ${rows.filter((r) => !r.verdict).length}`);
  const dir = path.join(process.cwd(), "data", "eval", "runs");
  await fs.mkdir(dir, { recursive: true });
  const at = new Date().toISOString();
  const file = path.join(dir, `baseline_${mode}_${at.replace(/[:.]/g, "-").slice(0, 19)}.json`);
  await fs.writeFile(file, JSON.stringify({ mode, model: MODEL, at, rows }, null, 1));
  console.log(`저장: ${path.relative(process.cwd(), file)}`);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
