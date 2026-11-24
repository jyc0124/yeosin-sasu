// 기준 답변의 '대상이 다른 기준' 표시(lib/basis holderNote): 절 문장은 그대로 두고, 질문 고객의 주택 보유 상태와 다른 대상이면 안내를 붙인다.
// 현장 피드백(11/22): 무주택 고객 질문에 1주택자 DSR 기준을 '답할 수 있는 부분'으로 보여 줌.
import { describe, expect, it } from "vitest";
import { basisCard, holderNote, questionHolder } from "@/lib/basis";
import { clausesOf } from "@/lib/kb";

describe("질문 고객의 주택 보유 상태", () => {
  it("한 가지 상태만 말하면 그 상태", () => {
    expect(questionHolder("전세안심은 무주택일 경우 DSR을 안 본다던데 소득에 따라 한도가 달라지나요?")).toBe("none");
    expect(questionHolder("다주택 고객 서울 아파트 주담대 만기 12월")).toBe("multi");
    expect(questionHolder("1주택자인데 전세대출 신규 DSR 보나요?")).toBe("one");
  });
  it("여러 상태가 섞이면 판단하지 않는다(여러 사람·비교 질문)", () => {
    expect(questionHolder("1주택자 전세 보증비율이 바뀐다는데 무주택자는요?")).toBeUndefined();
    expect(questionHolder("본인은 아파트 1채, 배우자는 무주택입니다")).toBeUndefined();
    expect(questionHolder("만기 연장이 되나요?")).toBeUndefined();
  });
});

describe("대상이 다른 기준 안내", () => {
  const dsr = clausesOf(["F828-11"]).find((c) => c.id === "F828-11#4")!;
  it("무주택 질문 × 1주택자 절 → 안내, 같은 대상·대상 없는 절 → 없음", () => {
    expect(holderNote(dsr.text, "none")).toMatch(/대상은 1주택자.*무주택/);
    expect(holderNote(dsr.text, "one")).toBeUndefined();
    expect(holderNote("증액 연장은 대출금액 기준입니다.", "none")).toBeUndefined();
    expect(holderNote(dsr.text, undefined)).toBeUndefined();
  });
  it("고른 절이 모두 대상이 다르면 보류, 결론 문장에 다른 대상의 기준을 내세우지 않는다", () => {
    const q = { subQuestions: ["소득에 따라 한도가 달라지나요?"], regs: ["RDSR"], concepts: ["limit"] };
    const { card } = basisCard(q, "v2", [{ sub: 1, picks: [dsr.id] }], "무주택일 경우 DSR을 안 본다던데 소득에 따라 한도가 달라지나요?");
    expect(card.verdict).toBe("보류");
    expect(card.basis?.[0].text).toBe(dsr.text); // 절 문장은 원문 그대로
    expect(card.basis?.[0].note).toBeTruthy();
    expect(card.headline).not.toContain(dsr.text);
  });
  it("대상이 같은 질문은 그대로 안내", () => {
    const q = { subQuestions: ["신규 전세대출에 DSR을 보나요?"], regs: ["RDSR"], concepts: ["target"] };
    const { card } = basisCard(q, "v2", [{ sub: 1, picks: [dsr.id] }], "1주택자가 수도권 전세대출 신규로 받으면 DSR 보나요?");
    expect(card.verdict).toBe("안내");
    expect(card.basis?.[0].note).toBeUndefined();
  });
});
