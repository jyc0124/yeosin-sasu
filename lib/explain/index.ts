// 고객 안내 문구. 판정은 바꾸지 않는다.
// 기본(11/22~): '절 고르기' — 첫 문장은 규칙 엔진의 결론 그대로, 이유는 카드가 쓴 Fact의 검수된 절(data/kb/clauses.json)을
//   LLM이 번호로만 골라 문장 그대로 보인다. LLM이 문장을 쓰지 않으므로 원문과 다른 말이 나올 수 없다.
//   (측정: 어휘 겹침 검증기는 단어 하나 바꾼 틀린 문장을 바른 문장보다 높게 쳐서, 문장 생성 + 검증으로는 틀린 문장을 다 거르지 못한다)
// LOANDESK_EXPLAIN_MODE=generate: 예전 방식(LLM이 문장 작성 → 원문 대조 검증 통과분만)
import { chatJson, type RouterModel } from "@/lib/liner";
import { clausesOf, resolveFacts } from "@/lib/kb";
import type { Verdict } from "@/lib/rules/types";
import { checkSentence, type CheckedSentence, type DraftSentence } from "./verify";

const SCHEMA = {
  name: "customer_explanation",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["sentences"],
    properties: {
      sentences: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["text", "facts"],
          properties: {
            text: { type: "string", description: "고객에게 그대로 말할 한 문장(존댓말, 60자 안팎)" },
            facts: { type: "array", items: { type: "string" }, description: "이 문장의 근거 Fact ID(아래 목록에서만)" },
          },
        },
      },
    },
  },
};

const SYSTEM = `너는 은행 창구 직원이 고객에게 말할 안내 문구를 쓰는 보조다.
판정은 이미 규칙 엔진이 내렸다. 너는 판정을 바꾸거나 새로운 사실을 더하면 안 된다.
- 첫 문장은 판정 카드의 '결론'을 고객 말투로 옮긴다. 결론에 이유(예: 왜 주택 수에 들어가는지)가 있으면 빼지 않는다.
- '…이 아니라', '…이 아닌' 같은 대조 표현은 쓰지 않는다. 인정되는 날짜·결론만 바로 말한다.
- 2~4문장. 각 문장은 아래 '근거' 목록의 Fact ID를 1개 이상 facts에 적는다. 목록 밖 ID 금지.
- 근거 문장과 판정 카드에 없는 숫자·날짜·비율을 쓰지 않는다.
- 판정이 보류·심사위·역질문·내부지침이면 "됩니다/가능합니다"라고 단정하지 않는다. "본점 확인 후 안내드리겠습니다", "심사를 거쳐야 합니다"처럼 말한다.
- 판정이 안내이면 고객 건의 가능·불가를 말하지 않고, 확인된 기준만 설명한다. 정부 발표 자료에 없는 부분은 "본점 확인 후 안내드리겠습니다"라고 말한다.
- 규제를 피하는 방법(조기 연장, 명의 이전, 계약일 조정 등)은 절대 안내하지 않는다.
- 고객 이름 등 개인정보를 만들지 않는다.`;

export interface Explanation {
  sentences: CheckedSentence[]; // 통과한 문장만
  rejected: number;
  model: RouterModel;
  ms: number;
}

export async function explain(
  input: { question: string; card: Verdict },
  opts: { model?: RouterModel; useCache?: boolean; timeoutMs?: number } = {},
): Promise<Explanation & { all: CheckedSentence[] }> {
  if (process.env.LOANDESK_EXPLAIN_MODE !== "generate") return explainByClauses(input, opts);
  const t0 = Date.now();
  const model = opts.model ?? "liner-gpt-router";
  const { card } = input;
  const refs = resolveFacts(card.facts);
  const factText = (id: string) => refs.find((f) => f.id === id)?.text;
  const user = [
    `# 창구 질문\n${input.question}`,
    `# 판정 카드\n판정: ${card.verdict}\n결론: ${card.headline}`,
    card.basis?.length ? `확인된 기준(규제별):\n${card.basis.map((b) => `- ${b.label}: ${b.text} [${b.facts.join(",")}]`).join("\n")}` : "",
    card.conditions.length ? `조건·주의:\n${card.conditions.map((c) => `- ${c}`).join("\n")}` : "",
    card.documents.length ? `징구 서류:\n${card.documents.map((c) => `- ${c}`).join("\n")}` : "",
    card.questions.length ? `고객에게 확인할 것:\n${card.questions.map((c) => `- ${c}`).join("\n")}` : "",
    `# 근거\n${refs.map((f) => `[${f.id}] ${f.text}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const out = await chatJson<{ sentences: DraftSentence[] }>(
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    SCHEMA,
    { model, temperature: 0, useCache: opts.useCache ?? true, timeoutMs: opts.timeoutMs ?? 25_000, retries: 1 },
  );
  const drafts = (Array.isArray(out.sentences) ? out.sentences : []).filter((s) => s && typeof s.text === "string" && Array.isArray(s.facts)).slice(0, 6);
  // 질문 속 고객 사실관계는 날짜만 숫자 출처로 인정한다(비율·금액 같은 정책 수치는 근거·카드에서만)
  const all = drafts.map((s) => checkSentence(s, card, factText, [input.question]));
  const passed = all.filter((s) => s.ok);
  return { sentences: passed, rejected: all.length - passed.length, all, model, ms: Date.now() - t0 };
}

const PICK_SCHEMA = {
  name: "explanation_pick",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["picks"],
    properties: { picks: { type: "array", items: { type: "string" }, description: "결론의 핵심 이유를 설명하는 절 ID(예: F401-06#2), 중요한 순서로 0~3개" } },
  },
};
const PICK_SYSTEM = `너는 은행 창구 직원이 고객에게 판정 이유를 설명할 때 보여 줄 '정부 발표 자료의 절'을 고르는 보조다. 문장을 새로 쓰지 않는다.
- 판정은 이미 규칙 엔진이 내렸다. 그 결론의 **핵심 이유**를 직접 설명하는 절만 0~3개 고른다(중요한 순서).
- 고르지 않는다: 이 질문과 다른 규제(예: 전세대출 질문에 4.1 주담대 만기연장 조항)·다른 상황(예: 전세대출 차주의 퇴거와 보유 주택 세입자의 퇴거)을 말하는 절, 결론에 적용되지 않는 예외를 적용되는 것처럼 읽히게 하는 절, 정의만 있고 결론과 상관없는 절.
- 알맞은 절이 없으면 빈 목록으로 둔다(억지로 고르지 않는다).
- 규제를 피하는 방법으로 읽힐 수 있는 절은 고르지 않는다.`;

/** 절 고르기 방식의 고객 안내(기본) */
export async function explainByClauses(
  input: { question: string; card: Verdict },
  opts: { model?: RouterModel; useCache?: boolean; timeoutMs?: number } = {},
): Promise<Explanation & { all: CheckedSentence[] }> {
  const t0 = Date.now();
  const model = opts.model ?? "liner-gpt-router";
  const { card } = input;
  const head: CheckedSentence = { text: card.headline, facts: [], ok: true, reasons: [], score: 1, source: "card" };
  const units = clausesOf(card.facts.filter((f) => f.startsWith("F")));
  if (!units.length) return { sentences: [head], rejected: 0, all: [head], model, ms: Date.now() - t0 };
  const user = [
    `# 창구 질문\n${input.question}`,
    `# 판정 카드\n판정: ${card.verdict}\n결론: ${card.headline}`,
    card.conditions.length ? `조건·주의:\n${card.conditions.map((c) => `- ${c}`).join("\n")}` : "",
    `# 절(정부 발표 자료)\n${units.map((c) => `[${c.id}] ${c.text}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const out = await chatJson<{ picks: string[] }>(
    [
      { role: "system", content: PICK_SYSTEM },
      { role: "user", content: user },
    ],
    PICK_SCHEMA,
    { model, temperature: 0, useCache: opts.useCache ?? true, timeoutMs: opts.timeoutMs ?? 25_000, retries: 1 },
  );
  const byId = new Map(units.map((u) => [u.id, u]));
  const picks = [...new Set(Array.isArray(out.picks) ? out.picks : [])].slice(0, 3);
  const chosen = picks.map((id) => byId.get(id)).filter((u): u is NonNullable<typeof u> => !!u);
  const sentences: CheckedSentence[] = [head, ...chosen.map((u) => ({ text: u.text, facts: [u.fact], ok: true, reasons: [], score: 1, source: "fact" as const }))];
  return { sentences, rejected: picks.length - chosen.length, all: sentences, model, ms: Date.now() - t0 };
}
