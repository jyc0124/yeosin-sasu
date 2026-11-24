// 규칙 밖 사실의 원문 대조(2차 추출) — docs/RULES.md §4-4
//
// 문제(v3 블라인드 채점): 1차 추출기가 "항목에 담을 수 없다"고 한 사실을 엔진이 그대로 믿고
// "정부 발표 자료에 기준이 없다"며 보류했는데, 실제로는 원문에 기준이 있는 경우가 많았다
// (토지거래허가 신청 접수, 중도금대출, 세대 기준 주택 수 등).
//
// 구조:
//  1) 코드: 규칙 밖 사실마다 규제×개념 태그로 판정 근거 자료에서 관련 Fact를 고른다(selectEvidence — LLM이 고르지 않음).
//  2) Liner Router: 같은 추출 스키마로 한 번 더 추출하되, 그 Fact 원문을 함께 준다.
//     원문이 그 사실을 정하는 기준이면 해당 항목(필드)에 담고, 원문상 판정 요건이 아니면 '판정과 무관'으로,
//     기준이 없으면 그대로 둔다. 남길 때는 관련 기준 Fact ID(sourceFacts)를 적는다.
//  3) 코드: sourceFacts는 실제로 준 근거 목록 안의 ID만 인정(normalize). 남은 사실의 보류 문구는
//     근거가 있으면 '관련 기준(F…)은 있으나 자동 판정 항목이 없음', 없으면 '판정 근거 자료에서 기준을 찾지 못함'(lib/rules/index.ts guard).
import { chatJson, type ChatOptions, type RouterModel } from "@/lib/liner";
import { resolveFacts } from "@/lib/kb";
import { selectEvidence } from "@/lib/basis";
import { REGS, CONCEPTS } from "@/lib/basis/vocab";
import { EXTRACT_SCHEMA, type RawExtraction, type RawUnmodeled } from "./schema";

const BY_CHANGE: Record<string, string[]> = {
  "주택 수": ["housecount", "family"],
  "규제 대상 여부": ["target", "scope"],
  "예외 인정": ["exception"],
  "적용 시점·경과조치": ["timing", "increase"],
};
const MODULE_REGS: Record<string, string[]> = { M1: ["R813", "R907", "RDSR", "RGUAR"], M2: ["R401", "RMOVEIN"] };

/** 보류로 이어질 규칙 밖 사실(판정과 무관·이유 없음은 이미 버려짐) */
export function relevantUnmodeled(raw: RawExtraction): RawUnmodeled[] {
  return (raw.unmodeledFacts ?? []).filter(
    (f): f is RawUnmodeled => typeof f === "object" && !!f && typeof f.fact === "string" && f.changes !== "판정과 무관" && !!f.how?.trim(),
  );
}

/** 규칙 밖 사실마다 관련 근거(Fact)를 코드가 고른다. 결정적. */
export function evidenceFor(raw: RawExtraction, facts: RawUnmodeled[], max = 20): string[] {
  const mods = [raw.module, raw.alsoModule].filter((m): m is "M1" | "M2" => m === "M1" || m === "M2");
  const ids: string[] = [];
  for (const f of facts) {
    const regs = (f.regs ?? []).filter((r) => REGS.includes(r as never));
    const concepts = (f.concepts ?? []).filter((c) => CONCEPTS.includes(c as never));
    const q = {
      // 추출기가 붙인 규제 + 사례 모듈의 규제(추출기 태그가 좁아도 같은 고객 건의 다른 규제 기준을 놓치지 않게)
      regs: [...new Set([...regs, ...mods.flatMap((m) => MODULE_REGS[m])])],
      concepts: [...new Set([...concepts, ...(BY_CHANGE[f.changes] ?? [])])],
    };
    // 규제마다 몫을 나눠 고른다(한 규제의 Fact가 많아 다른 규제의 기준이 밀려나지 않게)
    for (const reg of q.regs) for (const id of selectEvidence({ regs: [reg], concepts: q.concepts }, "v2", 4).facts) if (!ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, max);
}

export const GROUND_SECTION = `
# [원문 대조] 단계 (이 단계에서만 적용)
- 1차 추출에서 아래 '항목에 담지 못한 사실'을 unmodeledFacts로 보냈다. 함께 준 '근거'는 정부 발표 자료에서 뽑은 관련 기준(Fact)이다.
- 각 사실을 근거와 대조해 다음 중 하나로 처리한다:
  (가) 근거가 그 사실을 판정 항목으로 다루면(예: 근거가 그 대출 종류·주택 종류·진행 단계·명의 범위를 정함) → 그 사실을 **해당 항목(필드)에 담고** unmodeledFacts에서 뺀다.
  (나) 근거로 보아 그 사실이 규제 요건이 아니면(요건에 없는 잔액·납부 이력·자금 출처·상담 경위 등) → unmodeledFacts에 changes='판정과 무관'으로 둔다.
  (다) 근거가 그 사실과 관련된 기준을 담고 있지만 어느 항목에도 담을 수 없으면 → unmodeledFacts에 두고 sourceFacts에 그 근거 Fact ID를 적는다.
  (라) 근거에 관련 기준이 없으면 → unmodeledFacts에 두고 sourceFacts=[]로 둔다.
- 근거에 없는 내용을 지어내지 않는다. sourceFacts에는 주어진 근거 목록의 ID만 쓴다.
- 나머지 항목은 1차와 같은 기준으로 다시 채운다(질문의 사실을 빠뜨리지 않는다).`;

export interface GroundResult {
  raw: RawExtraction;
  evidence: string[];
  model: RouterModel;
  /** fast = 사실별 결정만 받아 1차 결과에 반영, full = 항목에 담을 사실이 있어 전체를 다시 추출 */
  mode: "fast" | "full";
}

// 속도(11/22): 2차 추출이 전체 스키마(항목 60여 개)를 다시 출력해 질문당 약 14초가 더 걸렸다.
// 먼저 사실별 결정(항목에 담기/판정과 무관/남김 + 근거 ID)만 짧게 받고, '항목에 담기'가 하나라도 있을 때만 전체를 다시 추출한다.
// 결정 규칙은 GROUND_SECTION과 같다 → '담기'가 없으면 전체 재추출과 같은 결과를 더 짧은 출력으로 얻는다.
const DECIDE_SCHEMA = {
  name: "ground_decisions",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["decisions"],
    properties: {
      decisions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["i", "decision", "sourceFacts"],
          properties: {
            i: { type: "integer", description: "사실 번호(1부터)" },
            decision: { type: "string", enum: ["field", "irrelevant", "keep"], description: "field=(가) 항목에 담을 수 있음, irrelevant=(나) 판정과 무관, keep=(다)·(라) 그대로 남김" },
            sourceFacts: { type: "array", items: { type: "string" }, description: "(다)일 때 관련 근거 Fact ID(주어진 목록에서만). (라)면 []" },
          },
        },
      },
    },
  },
};
const DECIDE_SECTION = `
# [원문 대조 — 결정만] 단계
- 아래 '항목에 담지 못한 사실'마다 함께 준 '근거'와 대조해 결정만 낸다(추출 결과 전체를 다시 쓰지 않는다).
  field: 근거가 그 사실을 판정 항목으로 다룬다(그 대출 종류·주택 종류·진행 단계·명의 범위 등) → 위 추출 항목 중 하나에 담을 수 있다.
  irrelevant: 근거로 보아 규제 요건이 아니다(잔액·납부 이력·자금 출처·상담 경위 등).
  keep: 관련 기준이 근거에 있지만 어느 항목에도 담을 수 없거나(sourceFacts에 그 ID), 근거에 관련 기준이 없다(sourceFacts=[]).
- 근거에 없는 내용을 지어내지 않는다. sourceFacts에는 주어진 근거 목록의 ID만 쓴다.`;

/** 규칙 밖 사실이 있으면 근거와 대조한다. 없으면 undefined(1차 결과 그대로 씀). */
export async function groundExtraction(
  system: string,
  user: string,
  first: RawExtraction,
  opts: ChatOptions & { model: RouterModel },
): Promise<GroundResult | undefined> {
  const facts = relevantUnmodeled(first);
  if (!facts.length) return undefined;
  const evidence = evidenceFor(first, facts);
  const refs = resolveFacts(evidence);
  const listed = `# 항목에 담지 못한 사실(1차)\n${facts.map((f, i) => `${i + 1}. ${f.fact} (1차 판단: ${f.changes} — ${f.how})`).join("\n")}`;
  const evText = refs.length ? `# 근거\n${refs.map((f) => `[${f.id}] ${f.text}`).join("\n")}` : "# 근거\n(관련 근거 없음)";
  const keepIds = (ids: string[] | undefined) => (ids ?? []).filter((id) => evidence.includes(id));

  if (process.env.LOANDESK_GROUND_FULL !== "1") {
    const d = await chatJson<{ decisions: { i: number; decision: "field" | "irrelevant" | "keep"; sourceFacts: string[] }[] }>(
      [
        { role: "system", content: system + DECIDE_SECTION },
        { role: "user", content: [user, `[원문 대조]\n${listed}`, evText].join("\n\n") },
      ],
      DECIDE_SCHEMA,
      { temperature: 0, ...opts },
    );
    const ds = Array.isArray(d.decisions) ? d.decisions : [];
    const byFact = new Map(facts.map((f, i) => [f, ds.find((x) => x.i === i + 1)]));
    // 결정이 빠진 사실이 있거나 항목에 담을 사실이 있으면 전체 재추출(아래)로 간다
    if (facts.every((f) => byFact.get(f) && byFact.get(f)!.decision !== "field")) {
      const raw: RawExtraction = {
        ...first,
        unmodeledFacts: (first.unmodeledFacts ?? []).map((f) => {
          const x = typeof f === "object" && f ? byFact.get(f as RawUnmodeled) : undefined;
          if (!x) return f;
          return x.decision === "irrelevant" ? { ...(f as RawUnmodeled), changes: "판정과 무관", sourceFacts: [] } : { ...(f as RawUnmodeled), sourceFacts: keepIds(x.sourceFacts) };
        }) as RawExtraction["unmodeledFacts"],
      };
      return { raw, evidence, model: opts.model, mode: "fast" };
    }
  }
  const raw = await chatJson<RawExtraction>(
    [
      { role: "system", content: system + GROUND_SECTION },
      { role: "user", content: [user, `[원문 대조]\n${listed}`, evText].join("\n\n") },
    ],
    EXTRACT_SCHEMA,
    { temperature: 0, ...opts },
  );
  // 지어낸 근거 차단: sourceFacts는 이번에 준 근거 목록 안의 ID만
  for (const f of raw.unmodeledFacts ?? []) if (typeof f === "object" && f) f.sourceFacts = keepIds(f.sourceFacts);
  return { raw, evidence, model: opts.model, mode: "full" };
}
