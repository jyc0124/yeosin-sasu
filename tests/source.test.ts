// 근거 원문 보기: 모든 Fact가 원문에서 위치를 찾을 수 있어야 한다(판정 카드의 '원문 보기'가 항상 열리도록).
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import kb from "@/data/kb/facts.json";
import { anchoredFactIds, docOf, FILE_DIR, locate } from "@/lib/kb/source";
import { resolveFacts } from "@/lib/kb";

const factIds = (kb.facts as { id: string }[]).map((f) => f.id);

describe("근거 원문 위치", () => {
  it("KB의 모든 Fact에 원문 위치가 있다(빠진 것·남는 것 없음)", () => {
    expect(new Set(anchoredFactIds())).toEqual(new Set(factIds));
  });

  it.each(factIds)("%s: 모든 구절을 원문에서 찾고 강조할 줄이 있다", (id) => {
    const loc = locate(id);
    expect(loc).toBeDefined();
    expect(loc!.missing).toEqual([]);
    expect(loc!.highlight.length).toBeGreaterThan(0);
  });

  it("문서마다 공식 게시 페이지 주소가 있고, 원본 파일이 있으면 실제로 존재한다", () => {
    for (const id of factIds) {
      const d = locate(id)!.doc;
      expect(d.page).toMatch(/^https:\/\//);
      if (d.file) expect(existsSync(path.join(FILE_DIR, d.file)), d.file).toBe(true);
    }
    expect(docOf("없는문서")).toBeUndefined();
  });

  it("판정 카드의 근거에는 항상 원문 보기 주소가 붙는다", () => {
    for (const f of resolveFacts(factIds)) expect(f.viewer).toBe(`/source/${f.id}`);
  });
});

describe("사용 안내 질문 목록", () => {
  it("테스트셋 45문항과 현장 질문 예시를 빠짐없이 한 번씩 담는다", async () => {
    const { QUESTION_MAP } = await import("@/app/_components/questionMap");
    const { FIELD_EXAMPLES } = await import("@/app/_components/fieldExamples");
    const ts = (await import("@/data/eval/testset.json")).default as { cases: { id: string }[] };
    const ids = QUESTION_MAP.flatMap((p) => p.groups.flatMap((g) => g.items.map((i) => i.id)));
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...ts.cases.map((c) => c.id), ...FIELD_EXAMPLES.map((e) => e.id)].sort());
  });
});

describe("가상 A은행 지침 공개 화면", () => {
  it("제1~7조를 모두 읽고, 판정 문구가 인용하는 조항은 지침에 있다", async () => {
    const { loadGuideline, ARTICLE_USE } = await import("@/lib/bank/guideline");
    const g = loadGuideline();
    expect(g.articles.map((a) => a.no)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(g.articles.find((a) => a.no === 3)!.blocks.some((b) => b.kind === "table")).toBe(true);
    expect(g.articles.find((a) => a.no === 6)!.blocks.filter((b) => b.kind === "item").length).toBe(5);
    for (const n of Object.keys(ARTICLE_USE).map(Number)) expect(g.articles.some((a) => a.no === n)).toBe(true);
    const { readFileSync } = await import("node:fs");
    const rules = ["m0_info", "m1_jeonse", "m2_renewal"].map((f) => readFileSync(`lib/rules/${f}.ts`, "utf8")).join("\n");
    const cited = [...rules.matchAll(/A은행 지침 제(\d+)조/g)].map((m) => Number(m[1]));
    expect(cited.length).toBeGreaterThan(0);
    for (const n of cited) expect(["engine", "guard"]).toContain(ARTICLE_USE[n]?.kind);
  });
});
