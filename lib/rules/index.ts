// 규칙 엔진 진입점. 판정은 여기서만 내린다(LLM 아님).
import { judgeM0 } from "./m0_info";
import { applyDsr, applyLimit, guarantorFamily, judgeM1, labelMain, limitInfo, withScopes } from "./m1_jeonse";
import { judgeM2 } from "./m2_renewal";
import { branchesFor } from "./branches";
import { addYears, fmt } from "./dates";
import type { Case, ISODate, Verdict } from "./types";

export function judge(c: Case): Verdict {
  const v = judgeCore(c);
  const b = branchesFor(c, v, judgeCore);
  return b ? { ...v, branches: b } : v;
}

function judgeCore(c: Case): Verdict {
  const kb = c.kb ?? "v2";
  switch (c.module) {
    case "M1":
      return guard(c, guarantorFamily(c, withScopes(c, limitInfo(c, applyDsr(c, applyLimit(c, labelMain(c, judgeM1(c, kb)), kb), kb), kb), kb)));
    case "M2":
      return guard(c, judgeM2(c, kb));
    case "M0":
      return judgeM0(c, kb);
  }
}

const SETTLED = new Set(["허용", "불허", "조건부"]);

const AVOID_RULE = "A은행 지침 제7조 1항: 규제를 피하는 방법(조기 연장, 명의 분산, 계약일 조정 등)을 안내하지 않습니다.";
/**
 * 회피 시도: 판정은 실제 사실로만 내리고(추출기가 제안된 조작은 넣지 않는다), 결론 앞에 '그 방법으로는 바뀌지 않는다'를 둔다.
 * 판정 코드는 바꾸지 않는다(CLAUDE.md 원칙 4: 회피 방법 안내 금지).
 */
function avoid(c: Case, v: Verdict): Verdict {
  if (!c.avoidanceAsked) return v;
  return {
    ...v,
    headline: `제안한 방법(조기 연장·서류 날짜 조정 등)으로는 판정이 바뀌지 않으며, 실제 사실로만 판단합니다. ${v.headline}`,
    conditions: v.conditions.includes(AVOID_RULE) ? v.conditions : [AVOID_RULE, ...v.conditions],
    trace: [...v.trace, { step: "회피 시도", result: "질문이 규제를 피하는 방법을 제안 → 실제 사실로만 판정, 방법은 안내하지 않음", facts: [] }],
  };
}

/**
 * 규칙 밖 사실이 판정의 어느 단계를 바꾼다고 했는지(추출기 changes) → 그 단계의 판정 과정(trace) 접두어.
 * 판정이 그 단계에 가기 전에 결론이 났으면(예: 중도금대출이라 주택 수를 보기 전에 허용) 그 사실은 결론을 바꿀 수 없다.
 */
const STEPS: Record<"M1" | "M2", Record<string, string[]>> = {
  M1: { "주택 수": ["S1"], "규제 대상 여부": ["S0", "S1", "S2", "S3", "S4", "한도", "DSR"], "예외 인정": ["S0 예외", "S6"], "적용 시점·경과조치": ["S5"] },
  M2: { "주택 수": ["T2"], "규제 대상 여부": ["T1", "T2", "T3"], "예외 인정": ["T1 담보 주택 예외", "T2 주택 수", "T5"], "적용 시점·경과조치": ["T4", "T6"] },
};

/**
 * 안전장치(추출 결과에 대한 사후 처리).
 * 1) 규칙에 없는 사실이 있으면 확정 판정(허용·불허·조건부)을 보류로 바꾼다 — 모르는 사실을 무시한 확답 방지(G-09).
 *    단, 판정이 그 사실이 바꾼다는 단계까지 가지 않았으면 결론을 바꿀 수 없으므로 참고로만 표시한다.
 *    문구는 원문 대조 결과(unmodeledInfo.sources)에 따라 다르다: 관련 기준이 있으면 그 Fact를 보여 주고,
 *    없을 때만 '판정 근거 자료에서 기준을 찾지 못함'이라고 쓴다('정부 자료에 기준이 없다'고 단정하지 않는다).
 * 2) 일(日)을 관례로 채운 날짜는 문장에서 '○년 ○월(일자 확인 필요)'로 표시한다.
 */
function guard(c: Case, v: Verdict): Verdict {
  let out = avoid(c, v);
  const all = (c.unmodeledInfo ?? (c.unmodeled ?? []).map((fact) => ({ fact, changes: undefined, sources: [] as string[] }))).filter((f) => f.fact);
  const steps = c.module === "M1" || c.module === "M2" ? STEPS[c.module] : undefined;
  // 판정이 그 사실의 단계까지 갔는가: ① 사실이 바꾼다는 단계를 지났거나 ② 사실과 관련된 기준(sources)을 결론에 실제로 썼으면 도달.
  // ②는 단계 이름표와 무관하게 '결론이 그 기준에 기대고 있는데 기준 밖 사정이 있다'(예: 예외를 인정했는데 예외 요건 밖 사정)를 잡는다.
  const usedFacts = new Set(v.trace.flatMap((t) => t.facts));
  // ②는 허용·조건부일 때만: 확정 허용 뒤에 기준 밖 사정이 숨어 있으면 잘못 승인될 수 있다(관대한 오류 — I007).
  // 불허는 그 사정이 결론 단계에 닿을 때만 보류한다(11/22 v6: 불허 건까지 ②를 쓰면 판정과 무관한 사실로 보류가 늘었다).
  const positive = v.verdict === "허용" || v.verdict === "조건부";
  const reached = (f: { changes?: string; sources: string[] }) => {
    if (positive && f.sources.some((s) => usedFacts.has(s))) return true;
    const pre = f.changes && steps?.[f.changes];
    return !pre || v.trace.some((t) => pre.some((p) => t.step.startsWith(p)));
  };
  const unreached = SETTLED.has(v.verdict) ? all.filter((f) => !reached(f)) : [];
  const unknown = all.filter((f) => !unreached.includes(f));
  if (unreached.length) {
    out = {
      ...out,
      conditions: [...out.conditions, ...unreached.map((f) => `참고: "${f.fact}"은(는) ${f.changes} 판단에 쓰이는 사실이지만, 이 건은 그 단계 전에 결론이 납니다.`)],
      trace: [...out.trace, { step: "판정 범위", result: `결론 전 단계에 쓰이지 않는 사실: ${unreached.map((f) => f.fact).join(", ")}`, facts: [] }],
    };
  }
  if (unknown.length) {
    const list = unknown.map((f) => f.fact).join(", ");
    const sourced = unknown.filter((f) => f.sources.length);
    const unsourced = unknown.filter((f) => !f.sources.length);
    const why = [
      ...sourced.map((f) => `"${f.fact}" — 관련 기준(${f.sources.join("·")})은 판정 근거 자료에 있으나, 규칙 엔진이 이 사실을 판정 항목으로 다루지 못했습니다.`),
      ...unsourced.map((f) => `"${f.fact}" — 판정 근거 자료에서 이 사실에 대한 기준을 찾지 못했습니다.`),
    ];
    const facts = [...new Set([...out.facts, ...sourced.flatMap((f) => f.sources)])];
    const gaps = unsourced.length && !out.gaps.includes("G-09") ? [...out.gaps, "G-09"] : out.gaps;
    const trace = [...out.trace, { step: "판정 범위", result: `규칙 엔진이 판정에 반영하지 못한 사실: ${list}`, facts: [...sourced.flatMap((f) => f.sources), ...(unsourced.length ? ["G-09"] : [])] }];
    out = SETTLED.has(v.verdict)
      ? {
          ...out,
          verdict: "보류",
          headline: `규칙 엔진이 판정에 반영하지 못한 사실이 있어 확정하지 않습니다: "${list}". 본점 확인이 필요합니다.`,
          conditions: [`이 사실이 결론에 영향이 없다면 참고 판정: [${v.verdict}] ${v.headline}`, ...why, ...out.conditions],
          questions: [`"${list}" — 이 사실이 주택 수·규제 대상·예외 판단에 어떻게 반영되는지 본점 확인`, ...out.questions],
          facts,
          gaps,
          trace,
        }
      : v.verdict === "내부지침"
        ? // 내부지침 판정은 그 사실을 A은행 지침으로 판단하라는 결론이다 → '본점 확인 후 확정' 문구를 덧붙이면 서로 어긋난다
          { ...out, facts, gaps, trace }
        : { ...out, conditions: [...out.conditions, ...why.slice(0, -1), `${why.at(-1)} 그래서 확인 항목에 답해도 확정 판정은 본점 확인 후에 할 수 있습니다.`], facts, gaps, trace };
  }
  // 월만 알려진 날짜: 그 날짜는 '○년 ○월(일자 확인 필요)', 대출 만기의 1년 뒤는 '이번 만기일의 1년 뒤(○년 ○월 중)'로 쓰고
  // 정확한 일자를 '고객에게 확인할 것'에 올려 답하면 날짜가 확정되게 한다
  const approx = c.approxDates ?? [];
  if (!approx.length) return out;
  const mat = "maturityDate" in c ? c.maturityDate : undefined;
  const label = new Map<ISODate, string>();
  for (const d of approx) {
    label.set(d, `${d.slice(2, 4)}년 ${Number(d.slice(5, 7))}월(일자 확인 필요)`);
    const y = addYears(d, 1);
    if (!label.has(y)) label.set(y, d === mat ? `이번 만기일의 1년 뒤(${y.slice(2, 4)}년 ${Number(y.slice(5, 7))}월 중)` : `${y.slice(2, 4)}년 ${Number(y.slice(5, 7))}월(일자 확인 필요)`);
  }
  const relabel = (s: string) =>
    [...label].reduce((t, [d, l]) => t.replace(new RegExp(`(?<![\\d.])${fmt(d).replace(/\./g, "\\.")}(?![\\d])`, "g"), l), s);
  // 결론 문장·조건에 실제로 쓰인 날짜(또는 그 1년 뒤)만 묻는다. 결론과 무관한 날짜(예: 조기 연장 예정일)는 묻지 않는다
  const shown = [out.headline, ...out.conditions].join("\n");
  const used = (d: ISODate) => [d, addYears(d, 1)].some((x) => new RegExp(`(?<![\\d.])${fmt(x).replace(/\./g, "\\.")}(?![\\d])`).test(shown));
  // 일자를 묻는 것은 연장 기한(만기일 기준)을 확정해야 할 때뿐이다. 다른 날짜는 같은 달 비교일 때만 결론이 갈리고,
  // 그 경우는 규칙(M2 T6)이 따로 역질문으로 처리한다
  const settling = out.verdict === "허용" || out.verdict === "조건부";
  const ask = approx
    .filter((d) => d === mat && settling && used(d))
    .map((d) => `대출 약정서상 정확한 만기일은 ${d.slice(2, 4)}년 ${Number(d.slice(5, 7))}월 며칠인가요? (답하면 연장 기한 날짜를 확정합니다)`);
  return {
    ...out,
    headline: relabel(out.headline),
    conditions: out.conditions.map(relabel),
    questions: [...out.questions, ...ask.filter((q) => !out.questions.includes(q))],
    trace: out.trace.map((t) => ({ ...t, result: relabel(t.result) })),
  };
}

export * from "./types";
export { M0_TOPICS } from "./m0_info";
