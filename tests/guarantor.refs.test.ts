// 보증기관 확인 자료 연결(lib/guarantor): 판정과 무관한 참고 자료 — 언제 붙고 무엇을 고르는지.
import { describe, expect, it } from "vitest";
import { agencyRefs } from "@/lib/guarantor";
import { compare, observe } from "@/lib/guarantor/check";

describe("질문 → 보증기관 확인 자료", () => {
  it("현장 질문: 무주택 전세안심 · 소득에 따라 한도 → HUG 상환능력 심사(이자비용 40%)", () => {
    const r = agencyRefs("전세안심은 무주택일 경우 DSR을 안 보기 때문에 … 연간 금융비용부담률 40% 이내 조건도 있어서요. 소득에 따라 한도가 달라지나요?")!;
    expect(r.agencies).toEqual(["HUG"]);
    // 상품개요 보증한도(③ 이자비용 40%)와 FAQ(상환능력 심사 상세)가 함께 붙는다
    expect(r.excerpts.map((e) => e.id).slice(0, 3)).toEqual(expect.arrayContaining(["HUG-ANSIM-limit", "HUG-FAQ-repay"]));
  });
  it("현장 질문: 버팀목 연장 때 보증금이 늘면 추가대출 → HUG(버팀목), 증액 시 상환능력 재심사", () => {
    const r = agencyRefs("버팀목 연장 때 보증금이 늘면 추가대출이 가능한가요?")!;
    expect(r.agencies).toContain("HUG");
    expect(r.excerpts.map((e) => e.id)).toContain("HUG-FAQ-repay");
    // 주택도시기금 공식 안내: HUG 전세금안심대출보증 담보 대출은 추가대출 불가(커뮤니티 답 'HF 가능·HUG 불가'의 공식 근거)
    expect(r.excerpts.map((e) => e.id)).toContain("NHUF-ADD-rule");
  });
  it("HF로 특정하면 HF 자료만, SGI는 공개 자료 없음을 알린다", () => {
    const hf = agencyRefs("HF 전세자금보증 연장할 때 1주택자 보증한도는?")!;
    expect(hf.excerpts.every((e) => e.src.agency === "HF")).toBe(true);
    expect(hf.excerpts.map((e) => e.id)).toContain("HF-GL-limit");
    const sgi = agencyRefs("SGI 우량전세 신규 한도")!;
    expect(sgi.missing.map((m) => m.id)).toEqual(["SGI"]);
  });
  it("기관을 말하지 않은 보증 실무 질문은 기관을 먼저 확인(모든 기관 자료 후보)", () => {
    const r = agencyRefs("전세자금보증 연장할 때 보증한도가 줄어드나요?")!;
    expect(r.agencies).toEqual([]);
    expect(new Set(r.excerpts.map((e) => e.src.agency)).size).toBeGreaterThan(1);
  });
  it("보증 이야기가 없는 규제 질문에는 붙이지 않는다", () => {
    expect(agencyRefs("다주택 고객 서울 아파트 주담대 만기 12월, 세입자 있음. 연장 돼요?")).toBeUndefined();
    expect(agencyRefs("비거주 1주택자 전세대출 제한은 언제부터인가요?")).toBeUndefined();
  });
});

describe("개정 확인(네트워크 없이)", () => {
  const w = { fetch: "", encoding: "utf-8", markers: { 작성일: "작성일\\s*(\\d{4}-\\d{2}-\\d{2})", 첨부: "attachNo=(\\d+)" }, section: ["가", "끝"] as [string, string] };
  const page = (d: string, a: string, body: string) => `<a href="?attachNo=${a}">x</a><p>작성일</p><p>${d}</p><div>가 ${body} 끝</div>`;
  const src = { id: "T", title: "t", agency: "HF" };
  it("같으면 same, 작성일·첨부·본문이 바뀌면 changed", () => {
    const base = observe(page("2026-04-28", "1", "본문"), w);
    expect(compare(src, observe(page("2026-04-28", "1", "본문"), w), base).status).toBe("same");
    const c = compare(src, observe(page("2026-11-30", "2", "바뀐 본문"), w), base);
    expect(c.status).toBe("changed");
    expect(c.detail).toMatch(/작성일 2026-04-28 → 2026-11-30/);
  });
  it("구간을 못 찾으면(개편) error로 알린다", () => {
    expect(compare(src, observe("<p>완전히 다른 페이지</p>", w), { 작성일: "x" }).status).toBe("error");
  });
});

describe("HUG 전세안심보증(브라우저로 확인한 상품개요)", () => {
  it("현장 질문: 1주택자 증액 한도 2억 → HUG 보증한도(1주택자 2억원)", () => {
    const r = agencyRefs("우량전세 1주택자 연장 시 보증금 증액으로 대출금 증액 신청 시 HUG 보증 한도 최대 2억원 맞나요?")!;
    expect(r.excerpts.map((e) => e.id)).toContain("HUG-ANSIM-limit");
  });
  it("현장 질문: 2020.7.10 이후 서울 아파트 구입 1주택자 → HUG 규제대상 아파트 구입자 보증 불가", () => {
    const r = agencyRefs("2020.7.10 이후 서울 아파트를 구입한 1주택자의 HUG 전세대출 보증 신규 가능한가요?")!;
    expect(r.excerpts.map((e) => e.id)).toContain("HUG-ANSIM-target");
  });
});
