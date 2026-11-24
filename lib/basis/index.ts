// 기준 질문(해석·범위·정의·기준일) 답변 — "근거 조회 + 원문 대조 검증" (docs/RULES.md §4-2)
//
// 고정 주제(M0) 목록에 없는 해석형 질문에도 답하기 위한 경로. 역할 분담:
//  1) 추출기(LLM)  : 질문을 하위 질문으로 나누고 규제(regs)·개념(concepts) 태그를 붙인다.
//  2) 코드         : 태그로 판정 근거 자료(Fact·공백)를 고른다(selectEvidence). LLM은 근거를 고르지 않는다.
//  3) Router(LLM)  : 고른 Fact의 '절'(data/kb/clauses.json, 검수된 문장) 중 하위 질문에 답하는 절의 번호만 고른다.
//                    문장을 쓰지 않는다 → 화면 문장은 검수된 절 그대로라 원문과 다른 말이 나올 수 없다.
//                    (11/22 측정: 어휘 겹침 검증기는 단어 하나 바꾼 틀린 문장을 바른 문장보다 높게 쳐서, 문장 생성 + 검증 방식으로는
//                     짧은 바른 답을 살리면 틀린 답도 같이 통과한다)
//  4) 코드         : 고른 번호가 제시한 절 목록에 있는지만 확인(목록 밖 번호는 버림).
//  5) 코드         : 판정 코드 결정 — 모든 하위 질문에 고른 절이 있으면 '안내', 하나라도 없으면 '보류'.
// 고객 건의 허용·불허는 이 경로에서 내리지 않는다(그건 규칙 엔진 M1·M2만).
import tags from "@/data/kb/tags.json";
import { chatJson, type RouterModel } from "@/lib/liner";
import { clausesOf, resolveGaps, type ClauseRef } from "@/lib/kb";
import { Card } from "@/lib/rules/verdict";
import type { KbVersion, Verdict } from "@/lib/rules/types";

type Tagged = { regs: string[]; concepts: string[] };
const ITEMS = (tags as unknown as { items: Record<string, Tagged> }).items;
import { REG_LABEL } from "./vocab";
export { CONCEPTS, REGS, REG_LABEL, CONCEPT_LABEL } from "./vocab";

export interface BasisQuery {
  subQuestions: string[];
  regs: string[];
  concepts: string[];
}

/** KB v1(보도자료·FAQ만)에는 후속 문서 Fact(F828·F020)가 없다 */
const inKb = (id: string, kb: KbVersion) => kb === "v2" || !(id.startsWith("F828") || id.startsWith("F020"));

/**
 * 규제×개념이 모두 겹치는 근거만 고른다(규제만·개념만 겹치면 제외). 겹친 개념 수로 정렬.
 * 결정적: 같은 태그면 같은 근거.
 */
export function selectEvidence(q: Pick<BasisQuery, "regs" | "concepts">, kb: KbVersion, max = 12): { facts: string[]; gaps: string[] } {
  const scored: [string, number][] = [];
  for (const [id, t] of Object.entries(ITEMS)) {
    if (!inKb(id, kb)) continue;
    const r = t.regs.filter((x) => q.regs.includes(x)).length;
    const c = t.concepts.filter((x) => q.concepts.includes(x)).length;
    if (r > 0 && c > 0) scored.push([id, r + c * 2]);
  }
  scored.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const ids = scored.map(([id]) => id);
  const gaps = ids.filter((id) => id.startsWith("G-"));
  const facts = ids.filter((id) => !id.startsWith("G-")).slice(0, max);
  // v2에서 해소된 공백(G-02·G-08)은 쟁점으로 내지 않는다
  const open = resolveGaps(gaps).filter((g) => !(g.resolved && kb === "v2")).map((g) => g.id);
  return { facts, gaps: open };
}

const SCHEMA = {
  name: "basis_pick",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["answers"],
    properties: {
      answers: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["sub", "picks", "unanswered"],
          properties: {
            sub: { type: "integer", description: "하위 질문 번호(1부터)" },
            picks: { type: "array", items: { type: "string" }, description: "이 하위 질문에 직접 답하는 절 ID(예: F828-11#3), 중요한 순서로 1~3개" },
            unanswered: { type: "boolean", description: "목록의 어떤 절도 이 하위 질문에 직접 답하지 않으면 true(이때 picks는 [])" },
          },
        },
      },
    },
  },
};

const SYSTEM = `너는 은행 지점 창구 직원의 기준 질문에 답할 '정부 발표 자료의 절'을 고르는 보조다. 문장을 새로 쓰지 않는다.
- 아래 '절' 목록에서 하위 질문마다 그 질문에 **직접** 답하는 절의 ID만 1~3개 고른다(중요한 순서). 관련만 있고 답이 아닌 절은 고르지 않는다.
- 어떤 절도 직접 답하지 않으면 unanswered=true, picks=[]. 억지로 고르지 않는다.
- 규제를 피하는 방법(조기 연장, 명의 이전, 계약일 조정, 나눠 받기 등)을 묻는 하위 질문에는 답하지 않는다(unanswered=true).`;

/** 주택 보유 상태: 무주택·1주택·다주택 */
export type Holder = "none" | "one" | "multi";
const HOLDER_LABEL: Record<Holder, string> = { none: "무주택", one: "1주택자", multi: "다주택자" };
/** 문장에 나온 주택 보유 상태(여러 개일 수 있음). '○채'는 세지 않는다('1채와 1채'처럼 합산이 필요한 말은 상태로 읽지 않음) */
export function holdersIn(text: string): Set<Holder> {
  const s = new Set<Holder>();
  if (/무주택/.test(text)) s.add("none");
  if (/(?<![\d,])1\s?주택/.test(text)) s.add("one");
  if (/다주택|(?<![\d,])[2-9]\s?주택/.test(text)) s.add("multi");
  return s;
}
/** 질문이 고객의 주택 보유 상태를 하나로만 말했을 때 그 상태(여러 사람·여러 상태가 섞이면 판단하지 않음) */
export function questionHolder(text: string | undefined): Holder | undefined {
  if (!text) return undefined;
  // '○채'를 따로 말하면(누가 몇 채인지) 상태를 합산해야 하므로 문장만으로 정하지 않는다
  if (/\d\s?채|[한두세네]\s?채/.test(text)) return undefined;
  const s = holdersIn(text);
  return s.size === 1 ? [...s][0] : undefined;
}
/** 절의 대상이 질문 고객의 보유 상태와 다르면 안내 문장. 절 문장은 바꾸지 않는다 */
export function holderNote(clause: string, asked: Holder | undefined): string | undefined {
  if (!asked) return undefined;
  const s = holdersIn(clause);
  if (!s.size || s.has(asked)) return undefined;
  return `이 기준의 대상은 ${[...s].map((h) => HOLDER_LABEL[h]).join("·")}입니다. 질문의 고객은 ${HOLDER_LABEL[asked]}(으)로 적혀 있어 대상이 다릅니다.`;
}

/** 고른 절로 카드를 만든다(LLM 없음 — 테스트 가능). context = 고객 질문 원문(보유 상태가 다른 대상의 기준인지 표시용) */
export function basisCard(
  query: BasisQuery,
  kb: KbVersion,
  answers: { sub: number; picks: string[]; unanswered?: boolean }[],
  context?: string,
): { card: Verdict; subs: BasisResult["subs"] } {
  const asked = questionHolder(context);
  const card = new Card("M0", kb);
  const subsQ = subQuestions(query);
  const ev = selectEvidence(query, kb);
  const regText = query.regs.map((r) => REG_LABEL[r] ?? r).join(", ") || "규제 미상";
  card.step("기준 조회", `규제 ${regText} · 개념 ${query.concepts.join(", ") || "미상"} → 근거 ${ev.facts.length}개, 공백 ${ev.gaps.length}개`, [...ev.facts.slice(0, 6), ...ev.gaps]);
  const units = new Map(clausesOf(ev.facts).map((c) => [c.id, c]));
  const subs: BasisResult["subs"] = [];
  const unanswered: string[] = [];
  subsQ.forEach((q, i) => {
    const a = answers.find((x) => x.sub === i + 1);
    const picked = [...new Set(a?.unanswered ? [] : a?.picks ?? [])].slice(0, 3);
    const ok = picked.map((id) => units.get(id)).filter((c): c is ClauseRef => !!c);
    for (const c of ok) card.basis(q, c.text, [c.fact], holderNote(c.text, asked));
    subs.push({ q, passed: ok.length, rejected: picked.filter((id) => !units.has(id)).map((id) => ({ text: id, reasons: ["제시한 절 목록 밖"] })) });
    if (!ok.length) unanswered.push(q);
  });
  ev.gaps.forEach((g) => card.fact(g));
  // 결론 문장은 고객과 대상이 같은 기준을 먼저 쓴다. 모두 대상이 다르면 그 사실을 결론에 쓴다(다른 대상의 기준을 고객 답처럼 내세우지 않는다)
  const same = card.basisItems.find((b) => !b.note);
  const other = card.basisItems[0];
  const first = () =>
    same
      ? same.text
      : other
        ? `질문의 고객(${HOLDER_LABEL[asked!]})에게 해당하는 기준은 정부 발표 자료에서 확인하지 못했습니다. 아래는 대상이 다른 기준입니다.`
        : "정부 발표 자료로 확인된 기준은 아래와 같습니다.";
  if (!ev.facts.length) {
    card.cond("판정 근거 자료에서 이 질문의 기준을 찾지 못했습니다. 단정하지 말고 본점에 확인하세요.");
    return { card: card.done("보류", "정부 발표 자료에서 이 질문에 대한 기준을 찾지 못했습니다. 본점 확인 후 안내하세요."), subs };
  }
  if (unanswered.length) {
    card.cond(...unanswered.map((q) => `'${q}' — 정부 발표 자료에서 확인되지 않았습니다. 단정하지 말고 본점에 확인하세요.`));
    const any = subs.some((s) => s.passed > 0);
    return { card: card.done("보류", any ? `${first()} 다만 질문 중 정부 발표 자료로 확인되지 않는 부분이 있어, 그 부분은 본점 확인 후 안내하세요.` : "정부 발표 자료로 이 질문의 기준을 확인하지 못했습니다. 본점 확인 후 안내하세요."), subs };
  }
  const head = ev.gaps.length ? `${first()} 관련 쟁점 중 정부 발표 자료에 없는 부분은 본점 확인 후 안내하세요.` : first();
  // 고른 기준이 모두 고객과 대상이 다르면 이 고객에 대한 답은 확인되지 않은 것 → 보류
  if (!same && other) {
    card.cond(`고른 기준이 모두 ${HOLDER_LABEL[asked!]}이 아닌 다른 대상의 기준입니다. 고객에게 적용되는지는 본점에 확인하세요.`);
    return { card: card.done("보류", head), subs };
  }
  return { card: card.done("안내", head), subs };
}

const subQuestions = (q: BasisQuery) => (q.subQuestions.length ? q.subQuestions : ["질문"]).slice(0, 5);

export interface BasisResult {
  card: Verdict;
  /** 하위 질문별 결과(평가·디버그용) */
  subs: { q: string; passed: number; rejected: { text: string; reasons: string[] }[] }[];
  model?: RouterModel;
  ms: number;
}

export async function answerBasis(
  query: BasisQuery,
  opts: { kb: KbVersion; asOf?: string; model?: RouterModel; useCache?: boolean; timeoutMs?: number; context?: string },
): Promise<BasisResult> {
  const t0 = Date.now();
  const ev = selectEvidence(query, opts.kb);
  // 근거가 하나도 없으면 LLM을 부르지 않는다 → 보류(본점 질의)
  if (!ev.facts.length) return { ...basisCard(query, opts.kb, [], opts.context), ms: Date.now() - t0 };
  const units = clausesOf(ev.facts);
  const gapRefs = resolveGaps(ev.gaps);
  const user = [
    `# 하위 질문\n${subQuestions(query).map((q, i) => `${i + 1}. ${q}`).join("\n")}`,
    `# 절(정부 발표 자료)\n${units.map((c) => `[${c.id}] ${c.text}`).join("\n")}`,
    gapRefs.length ? `# 정부 발표 자료에 없는 것(이 내용을 묻는 하위 질문은 unanswered)\n${gapRefs.map((g) => `- ${g.topic}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const model = opts.model ?? "liner-gpt-router";
  const out = await chatJson<{ answers: { sub: number; picks: string[]; unanswered: boolean }[] }>(
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    SCHEMA,
    { model, temperature: 0, useCache: opts.useCache ?? true, timeoutMs: opts.timeoutMs ?? 25_000, retries: 1 },
  );
  return { ...basisCard(query, opts.kb, Array.isArray(out.answers) ? out.answers : [], opts.context), model, ms: Date.now() - t0 };
}
