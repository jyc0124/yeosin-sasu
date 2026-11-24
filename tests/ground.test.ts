// 규칙 밖 사실 처리(docs/RULES.md §4-4): 원문 대조 근거 선택, 보류 문구, 판정 단계 도달 여부, 판정 근거 자료 커버리지
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import kb from "@/data/kb/facts.json";
import coverage from "@/data/kb/coverage.json";
import { normalize, type RawExtraction } from "@/lib/extract";
import { evidenceFor, relevantUnmodeled } from "@/lib/extract/ground";
import { judge, type M1Case, type M2Case } from "@/lib/rules";

const multi: M2Case = { module: "M2", houseCount: 2, collateral: { region: "서울", isApt: true }, maturityDate: "2026-12-20", asOf: "2026-11-21", kb: "v2" };
const raw = (over: Partial<RawExtraction>): RawExtraction => ({ module: "M2", topic: null, m1: { houses: [] }, m2: { houses: [], collateral: {}, tenant: { mentioned: false }, registeredRental: { mentioned: false } }, assumptions: [], ...over }) as RawExtraction;

describe("원문 대조 근거 선택(코드가 고름)", () => {
  it("규칙 밖 사실의 규제×개념 태그로 관련 Fact를 고른다 — 결정적", () => {
    const r = raw({ unmodeledFacts: [{ fact: "토지거래허가 신청 접수", changes: "예외 인정", how: "매도계약 예외 인정 여부가 달라짐", regs: ["R401"], concepts: ["exception"], sourceFacts: [] }] });
    const a = evidenceFor(r, relevantUnmodeled(r));
    expect(a).toContain("F401-03");
    expect(evidenceFor(r, relevantUnmodeled(r))).toEqual(a);
  });
  it("태그가 없으면 모듈의 규제와 'changes'의 개념으로 찾는다", () => {
    const r = raw({ module: "M1", unmodeledFacts: [{ fact: "세대 기준 1주택", changes: "주택 수", how: "DSR 적용 여부", regs: [], concepts: [], sourceFacts: [] }] });
    expect(evidenceFor(r, relevantUnmodeled(r))).toEqual(expect.arrayContaining(["F813-01", "F828-11"]));
  });
  it("'판정과 무관'은 원문 대조 대상이 아니다", () => {
    const r = raw({ unmodeledFacts: [{ fact: "대출 잔액 300만원", changes: "판정과 무관", how: "", regs: [], concepts: [], sourceFacts: [] }] });
    expect(relevantUnmodeled(r)).toHaveLength(0);
  });
  it("근거 ID는 판정 근거 자료에 있는 것만 남는다(지어낸 ID 차단)", () => {
    const n = normalize(raw({ unmodeledFacts: [{ fact: "분양권", changes: "주택 수", how: "주택 수가 늘 수 있음", sourceFacts: ["F401-03", "F999-99"] }] }));
    expect((n.case as M2Case).unmodeledInfo?.[0].sources).toEqual(["F401-03"]);
  });
});

describe("보류 문구 — 원문에 기준이 있는지에 따라", () => {
  it("관련 기준이 확인되면 그 Fact를 보여 주고, '기준이 없다'고 하지 않는다(G-09 아님)", () => {
    const v = judge({ ...multi, houseCount: 1, unmodeled: ["분양권"], unmodeledInfo: [{ fact: "분양권", changes: "주택 수", sources: ["F401-03"] }] });
    expect(v.verdict).toBe("보류");
    const text = [v.headline, ...v.conditions].join(" ");
    expect(text).toContain("F401-03");
    expect(text).not.toMatch(/기준이 없/);
    expect(v.gaps).not.toContain("G-09");
  });
  it("관련 기준을 못 찾았으면 '판정 근거 자료에서 찾지 못함'(G-09)", () => {
    const v = judge({ ...multi, houseCount: 1, unmodeled: ["분양권"], unmodeledInfo: [{ fact: "분양권", changes: "주택 수", sources: [] }] });
    expect(v.conditions.join(" ")).toContain("찾지 못했습니다");
    expect(v.gaps).toContain("G-09");
  });
});

describe("결론이 기댄 기준과 관련된 규칙 밖 사실은 단계 이름과 무관하게 '도달'로 본다", () => {
  // 예외(가족 임대 등)로 허용했는데, 그 예외 기준과 관련된 기준 밖 사정이 있으면 확정하지 않는다(관대한 오류 방지)
  const base: M1Case = { module: "M1", kb: "v2", asOf: "2026-11-21", action: "new", applicationDate: "2027-03-03", houses: [{ region: "수도권", isApt: true }], houseCount: 1, leasedOut: true, tenantIsFamily: true, everLived: false };
  it("결론에 쓴 기준(sources)과 겹치면 보류", () => {
    const v = judge({ ...base, unmodeled: ["임차 가족이 다른 사람에게 다시 임대"], unmodeledInfo: [{ fact: "임차 가족이 다른 사람에게 다시 임대", changes: "예외 인정", sources: ["F813-02"] }] });
    expect(v.verdict).toBe("보류");
  });
  it("결론에 쓰지 않은 기준만 관련되고 단계도 지나지 않았으면 참고로만(확정 유지)", () => {
    const v = judge({ ...base, unmodeled: ["다른 사정"], unmodeledInfo: [{ fact: "다른 사정", changes: "예외 인정", sources: ["F401-03"] }] });
    expect(v.verdict).toBe("허용");
    expect(v.conditions.join(" ")).toContain("참고");
  });
});

describe("판정이 그 단계까지 가지 않으면 결론을 바꿀 수 없다", () => {
  it("중도금대출(T1에서 결론)인데 주택 수를 바꾼다는 사실 → 보류하지 않고 참고로만", () => {
    const v = judge({ ...multi, loanPurpose: "interim", unmodeled: ["분양권"], unmodeledInfo: [{ fact: "분양권", changes: "주택 수", sources: [] }] });
    expect(v.verdict).toBe("허용");
    expect(v.conditions.join(" ")).toContain("참고");
  });
  it("그 단계를 거친 판정이면 보류(기존 안전장치 유지)", () => {
    const v = judge({ ...multi, houseCount: 1, unmodeled: ["분양권"], unmodeledInfo: [{ fact: "분양권", changes: "주택 수", sources: [] }] });
    expect(v.verdict).toBe("보류");
  });
  it("8.13: 아파트가 아니라 S2에서 허용 → 예외 사유를 바꾼다는 사실은 결론을 못 바꾼다", () => {
    const c: M1Case = { module: "M1", kb: "v2", asOf: "2026-11-21", action: "renewal", maturityDate: "2027-03-01", houses: [{ region: "서울", isApt: false, owner: "self" }], unmodeled: ["발령 예정"], unmodeledInfo: [{ fact: "발령 예정", changes: "예외 인정", sources: [] }] };
    expect(judge(c).verdict).toBe("허용");
  });
  it("changes를 모르면(예전 형식) 그대로 보류", () => {
    expect(judge({ ...multi, loanPurpose: "interim", unmodeled: ["분양권"] }).verdict).toBe("보류");
  });
});

describe("판정 근거 자료 커버리지 — 모든 Fact는 엔진 판정에 쓰이거나, 설명용으로 이유와 함께 등록", () => {
  const src = [
    ...readdirSync("lib/rules").map((f) => readFileSync(`lib/rules/${f}`, "utf8")),
    readFileSync("data/kb/regions.json", "utf8"),
    readFileSync("data/kb/house_scopes.json", "utf8"),
  ].join("\n");
  const explain = (coverage as { explainOnly: Record<string, string> }).explainOnly;
  it("빠진 Fact가 없다", () => {
    const missing = (kb.facts as { id: string }[]).map((f) => f.id).filter((id) => !src.includes(id) && !explain[id]);
    expect(missing).toEqual([]);
  });
  it("설명용 목록은 실제 Fact만, 이유와 함께", () => {
    const ids = new Set((kb.facts as { id: string }[]).map((f) => f.id));
    for (const [id, why] of Object.entries(explain)) {
      expect(ids.has(id), id).toBe(true);
      expect(why.length).toBeGreaterThan(5);
    }
  });
});

describe("답변 문장 검증기 — 규제 이름·긴 Fact 항목", () => {
  it("'8.13 비거주 제한'의 8.13은 날짜가 아니라 이름(숫자 검사에서 뺀다), '4.1까지'는 날짜로 검사", async () => {
    const { numTokens, stripRegNames } = await import("@/lib/explain/verify");
    expect(numTokens(stripRegNames("8.13 비거주 제한은 보유 아파트 위치를 봅니다."))).toEqual([]);
    expect(numTokens(stripRegNames("4.1까지 통보받은 건"))).toHaveLength(1);
  });
  it("예외 8가지 중 한 항목만 말하는 문장도 그 항목과 비교한다(인용 Fact 안에서만)", async () => {
    const { factSimilarity } = await import("@/lib/explain/verify");
    const { resolveFacts } = await import("@/lib/kb");
    const f = resolveFacts(["F401-03"])[0].text;
    expect(factSimilarity("상속으로 불가피하게 취득한 주택은 주택 수 산정에서 제외합니다.", f)).toBeGreaterThanOrEqual(0.15);
    expect(factSimilarity("전세대출 보증비율은 70%입니다.", f)).toBeLessThan(0.15);
  });
});
