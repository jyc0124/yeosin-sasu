// 근거 조회 태그(data/kb/tags.json): 모든 Fact·공백에 태그가 있어야 기준 질문에서 찾을 수 있다
import { describe, expect, it } from "vitest";
import kb from "@/data/kb/facts.json";
import tags from "@/data/kb/tags.json";
import { selectEvidence } from "@/lib/basis";

const T = tags as unknown as { regs: Record<string, string>; concepts: Record<string, string>; items: Record<string, { regs: string[]; concepts: string[] }> };
const ids = [...(kb.facts as { id: string }[]).map((f) => f.id), ...(kb.gaps as { id: string }[]).map((g) => g.id)];

describe("근거 조회 태그", () => {
  it("모든 Fact·공백에 규제·개념 태그가 있다", () => {
    const missing = ids.filter((id) => !T.items[id] || !T.items[id].regs.length || !T.items[id].concepts.length);
    expect(missing).toEqual([]);
  });
  it("태그는 어휘 목록 안에 있고, 없는 ID를 가리키지 않는다", () => {
    for (const [id, t] of Object.entries(T.items)) {
      expect(ids).toContain(id);
      for (const r of t.regs) expect(Object.keys(T.regs)).toContain(r);
      for (const c of t.concepts) expect(Object.keys(T.concepts)).toContain(c);
    }
  });
  it("규제×개념이 모두 겹치는 근거만 고른다(결정적)", () => {
    const a = selectEvidence({ regs: ["R813"], concepts: ["family"] }, "v2");
    expect(a.facts).toEqual(expect.arrayContaining(["F813-01", "F813-02"]));
    expect(a.facts).not.toContain("F401-01"); // 규제가 다름
    expect(a.gaps).toContain("G-14");
    expect(selectEvidence({ regs: ["R813"], concepts: ["family"] }, "v2")).toEqual(a);
  });
  it("KB v1에서는 후속 문서 Fact(F828·F020)를 고르지 않는다", () => {
    const v1 = selectEvidence({ regs: ["R813", "R907"], concepts: ["increase", "timing"] }, "v1");
    expect(v1.facts.some((f) => f.startsWith("F828"))).toBe(false);
  });
});
