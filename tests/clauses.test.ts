// 절 데이터(data/kb/clauses.json) 검사: 기준 답변은 절 문장을 그대로 화면에 낸다(lib/basis) → 절은 Fact 범위 안이어야 한다.
import { describe, expect, it } from "vitest";
import kb from "@/data/kb/facts.json";
import data from "@/data/kb/clauses.json";
import { clausesOf } from "@/lib/kb";
import { basisCard } from "@/lib/basis";

const FACTS = new Map((kb.facts as { id: string; text: string }[]).map((f) => [f.id, f.text]));
const CL = (data as unknown as { clauses: Record<string, string[]> }).clauses;
// Fact 문장 + 그 Fact가 가리키는 Fact(예: 'F828-09 경과조치')의 문장
const scope = (id: string) => {
  const t = FACTS.get(id) ?? "";
  return [t, ...[...t.matchAll(/F\d{3}-\d{2}/g)].map((m) => FACTS.get(m[0]) ?? "")].join(" ");
};
// 규제 이름(8.13·4.1·8.28·9.7·10.15·10.20·6.27 대책 등)은 숫자 검사에서 뺀다 — 절에 규제 이름을 붙여 혼자 읽히게 하므로
const REG = /(?<![\d.])(8\.13|4\.1|8\.28|9\.7|10\.15|10\.20|6\.27)(?![\d])/g;
const nums = (s: string) => [...s.matchAll(/\d+/g)].map((m) => String(Number(m[0])));
const clauseNums = (s: string) => nums(s.replace(REG, " ").replace(/비거주 1주택자|1주택자 전세대출 DSR/g, " "));

describe("절 데이터", () => {
  it("모든 절은 있는 Fact에 속하고 비어 있지 않다", () => {
    for (const [id, cs] of Object.entries(CL)) {
      expect(FACTS.has(id), id).toBe(true);
      expect(cs.length, id).toBeGreaterThan(0);
      for (const c of cs) expect(c.trim().length, id).toBeGreaterThan(5);
    }
  });
  it("절의 숫자는 그 Fact(또는 가리키는 Fact)에 있다 — 연도 표기(2025·2026·2027)만 예외", () => {
    const bad: string[] = [];
    for (const [id, cs] of Object.entries(CL)) {
      const src = new Set(nums(scope(id)).concat(nums(scope(id)).map((n) => String(Number(n) + 2000))));
      for (const c of cs) for (const n of clauseNums(c)) if (!src.has(n) && !["2025", "2026", "2027", "2028", "2021"].includes(n)) bad.push(`${id}: ${n} in ${c.slice(0, 60)}`);
    }
    expect(bad).toEqual([]);
  });
  it("모든 Fact에 절이 있다(짧은 Fact도 규제 이름을 붙여 혼자 읽히게)", () => {
    expect([...FACTS.keys()].filter((id) => !CL[id])).toEqual([]);
    expect(clausesOf(["F401-15"])[0].text).toContain("4.1");
  });
});

describe("기준 답변 = 고른 절 그대로(LLM은 문장을 쓰지 않는다)", () => {
  const q = { subQuestions: ["전세대출은 DSR에서 어느 대출로 분류하나요?"], regs: ["RDSR"], concepts: ["scope"] };
  it("고른 절 문장이 그대로 근거로 표시되고 '안내'", () => {
    const pick = clausesOf(["F828-11"]).find((c) => c.text.includes("기타대출"))!;
    const { card } = basisCard(q, "v2", [{ sub: 1, picks: [pick.id] }]);
    expect(card.verdict).toBe("안내");
    expect(card.basis?.[0].text).toBe(pick.text);
    expect(card.basis?.[0].facts).toEqual(["F828-11"]);
  });
  it("목록 밖 절 ID·빈 선택이면 그 하위 질문은 미답 → 보류", () => {
    expect(basisCard(q, "v2", [{ sub: 1, picks: ["F999-99#1"] }]).card.verdict).toBe("보류");
    expect(basisCard(q, "v2", [{ sub: 1, picks: [], unanswered: true }]).card.verdict).toBe("보류");
  });
});
