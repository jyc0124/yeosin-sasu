// 테스트셋 45문항: 정답 입력 항목(cases.slots.json) → 규칙 엔진 → 기대 판정 (KB v2, v1)
import { describe, expect, it } from "vitest";
import testset from "@/data/eval/testset.json";
import slots from "@/data/eval/cases.slots.json";
import { judge, type Case } from "@/lib/rules";

const S = slots as unknown as Record<string, Case>;

describe("테스트셋 KB v2 (행정지도 포함)", () => {
  for (const tc of testset.cases) {
    it(`${tc.id} → ${tc.expected}`, () => {
      const v = judge({ ...S[tc.id], kb: "v2" });
      expect(v.verdict, `${tc.question}\n${v.headline}\n${JSON.stringify(v.trace, null, 1)}`).toBeOneOf(tc.accept);
      expect(v.facts.length + v.gaps.length).toBeGreaterThan(0);
      if (v.verdict === "역질문") expect(v.questions.length).toBeGreaterThan(0);
    });
  }
});

describe("테스트셋 KB v1 (보도자료·FAQ만)", () => {
  for (const tc of testset.cases) {
    it(`${tc.id} → ${tc.expected_v1}`, () => {
      const v = judge({ ...S[tc.id], kb: "v1" });
      expect(v.verdict, `${tc.question}\n${v.headline}`).toBeOneOf(tc.expected_v1 === tc.expected ? tc.accept : [tc.expected_v1]);
      expect(v.facts.some((f) => f.startsWith("F828") || f.startsWith("F020")), "v1에 Liner가 찾은 후속 문서 근거가 섞이면 안 됨").toBe(false);
    });
  }
});

it("모든 문항에 정답 입력 항목이 있다", () => {
  expect(testset.cases.filter((c) => !S[c.id]).map((c) => c.id)).toEqual([]);
});
