// ⑥ 영향 분석: 테스트셋 전 문항을 KB v1·v2로 판정해 결론이 바뀌는 문항을 찾는다(규칙 엔진, LLM 없음).
import testset from "@/data/eval/testset.json";
import gold from "@/data/eval/cases.slots.json";
import { judge, type Case } from "@/lib/rules";

export interface ImpactRow {
  id: string;
  question: string;
  v1: string;
  v2: string;
  headlineV2: string;
  newFacts: string[]; // v2 판정에 새로 쓰인 후속 문서 근거
}

const G = gold as unknown as Record<string, Case>;

export function impact(asOf = testset.base_date): { total: number; changed: ImpactRow[] } {
  const changed: ImpactRow[] = [];
  for (const tc of testset.cases) {
    const c = G[tc.id];
    if (!c) continue;
    const a = judge({ ...c, asOf, kb: "v1" });
    const b = judge({ ...c, asOf, kb: "v2" });
    if (a.verdict !== b.verdict) {
      changed.push({
        id: tc.id,
        question: tc.question,
        v1: a.verdict,
        v2: b.verdict,
        headlineV2: b.headline,
        newFacts: b.facts.filter((f) => f.startsWith("F828") || f.startsWith("F020")),
      });
    }
  }
  return { total: testset.cases.length, changed };
}
