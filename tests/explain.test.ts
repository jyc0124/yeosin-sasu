// 설명 문장 검증기: 지어낸 숫자·근거 밖 인용·판정과 어긋난 단정·규제 회피를 막는지(LLM 없음)
import { describe, expect, it } from "vitest";
import gold from "@/data/eval/cases.slots.json";
import { checkSentence } from "@/lib/explain/verify";
import { resolveFacts } from "@/lib/kb";
import { judge, type Case } from "@/lib/rules";

const G = gold as unknown as Record<string, Case>;
const cardOf = (id: string) => judge({ ...G[id], asOf: "2026-11-13", kb: "v2" });
const factText = (id: string) => resolveFacts([id])[0]?.text;

describe("설명 문장 검증", () => {
  const b02 = cardOf("B02"); // 조건부, F828-01
  const c01 = cardOf("C01"); // 불허(11/19 정답 수정: 실제로 안 살았으면 실거주 아님)
  const c02 = cardOf("C02"); // 보류

  it("근거와 맞는 문장은 통과", () => {
    const s = checkSentence({ text: "올해 12월 31일까지 만기가 돌아오는 건은 종전 규정으로 연장 심사를 합니다.", facts: ["F828-01"] }, b02, factText);
    expect(s.reasons).toEqual([]);
    expect(s.ok).toBe(true);
  });
  it("근거 ID 없이 카드 문장을 옮긴 문장은 '판정 카드' 출처로만 통과, 카드와도 무관하면 탈락", () => {
    const fromCard = checkSentence({ text: "증액하지 않는 조건으로 종전 규정에 따라 연장 심사합니다.", facts: [] }, b02, factText);
    expect(fromCard).toMatchObject({ ok: true, source: "card", facts: [] });
    expect(checkSentence({ text: "서류를 잘 챙겨 오세요.", facts: [] }, b02, factText).ok).toBe(false);
  });
  it("인용 ID와 내용이 따로 놀면 그 ID를 근거로 붙이지 않는다", () => {
    const s = checkSentence({ text: "실거주 이력 증빙 서류를 준비해 주세요.", facts: ["F828-01"] }, b02, factText);
    expect(s.ok && s.facts.includes("F828-01")).toBe(false);
  });
  it("카드가 쓰지 않은 근거를 인용하면 탈락", () => {
    const s = checkSentence({ text: "보증비율은 수도권 70%입니다.", facts: ["F813-11"] }, b02, factText);
    expect(s.reasons.join()).toContain("카드에 없는 근거");
  });
  it("출처에 없는 숫자(지어낸 비율·날짜)는 탈락", () => {
    const s = checkSentence({ text: "종전 규정으로 연장 심사하며 금리는 0.3%p 오릅니다.", facts: ["F828-01"] }, b02, factText);
    expect(s.reasons.join()).toContain("출처에 없는 숫자");
    const d = checkSentence({ text: "2027년 3월 31일까지 만기가 돌아오면 종전 규정으로 연장 심사합니다.", facts: ["F828-01"] }, b02, factText);
    expect(d.ok).toBe(false);
  });
  it("연도 표기 차이('26.12.31 ↔ 2026년 12월 31일)는 같은 숫자로 본다", () => {
    const s = checkSentence({ text: "2026.12.31까지 만기가 돌아오면 종전 규정으로 연장 심사합니다.", facts: ["F828-01"] }, b02, factText);
    expect(s.reasons.filter((r) => r.includes("숫자"))).toEqual([]);
  });
  it("보류 판정에서 '됩니다'라고 단정하면 탈락, '본점 확인 후'는 통과", () => {
    const bad = checkSentence({ text: "가계약금만 넣으셨어도 매도계약 예외가 인정됩니다.", facts: c02.facts.slice(0, 1) }, c02, factText);
    expect(bad.reasons.join()).toContain("단정");
    const good = checkSentence({ text: "가계약금만으로 매도계약 예외가 인정되는지는 기준이 없어 본점 확인 후 안내드리겠습니다.", facts: c02.facts.slice(0, 1) }, c02, factText);
    expect(good.reasons.filter((r) => r.includes("단정"))).toEqual([]);
  });
  it("불허 판정(C01)에서 '실거주로 인정된다'는 탈락, '인정되지 않는다'는 통과", () => {
    const bad = checkSentence({ text: "전입신고만 하셨어도 실거주로 인정됩니다.", facts: ["F813-03"] }, c01, factText);
    expect(bad.reasons.join()).toContain("인정·충족");
    const good = checkSentence({ text: "실제로 살지 않으셨다면 실거주로 인정되지 않습니다.", facts: ["F813-03"] }, c01, factText);
    expect(good.reasons.filter((r) => r.includes("불허"))).toEqual([]);
  });
  it("규제 회피 안내는 탈락", () => {
    const s = checkSentence({ text: "만기 전에 미리 연장하시면 종전 규정으로 연장 심사를 받을 수 있습니다.", facts: ["F828-01"] }, b02, factText);
    expect(s.reasons.join()).toContain("규제 회피");
  });
  it("근거·카드와 무관한 내용은 탈락", () => {
    const s = checkSentence({ text: "요즘 금리가 많이 올라서 고정금리 상품을 추천드립니다.", facts: ["F828-01"] }, b02, factText);
    expect(s.reasons.join()).toContain("겹치지 않음");
  });
});

describe("리뷰 회귀: 우회 문장을 막는다", () => {
  const b02 = cardOf("B02");
  const c01 = cardOf("C01");
  const a13 = cardOf("A13");
  const rej = (card: ReturnType<typeof cardOf>, text: string, facts = [card.facts[0]]) => checkSentence({ text, facts }, card, factText).ok;
  it.each([
    "전입신고만 하셨다면 실거주로 인정될 것으로 보입니다.",
    "전입신고만 하셨어도 실거주로 인정받으실 수 있어요.",
    "전입신고만 하셨어도 실거주 요건은 충족하신 겁니다.",
    "전입신고만으로 실거주 인정은 문제없습니다.",
    "전입신고만 하셨어도 실거주로 인정되니 걱정하지 않으셔도 됩니다, 본점 확인 후 안내드리겠습니다.",
  ])("불허 판정(C01)의 완곡한 인정: %s", (t) => expect(rej(c01, t)).toBe(false));
  it.each([
    ["올해 12월 31일까지 만기가 돌아오는 건은 종전 규정으로 연장 심사 없이 자동 연장됩니다.", ["F828-01"]],
    ["만기가 돌아오는 건은 종전 규정이 아니라 신규 규정으로 연장 심사를 합니다.", ["F828-01"]],
    ["종전 규정으로 연장 심사하며 6개월 안에 서류를 내셔야 합니다.", ["F828-01"]],
    ["종전 규정으로 연장 심사하며 세 달 안에 집을 처분하셔야 합니다.", ["F828-01"]],
    ["만기 전에 앞당겨 연장하시면 종전 규정을 적용받으실 수 있습니다.", ["F828-01"]],
    ["만기를 올해 안으로 당겨 두시면 종전 규정으로 연장 심사를 합니다.", ["F828-01"]],
    ["가족 명의로 넘기시면 주택 수에서 빠집니다.", ["F828-01"]],
  ])("조건부 판정의 조건 삭제·반전·지어낸 숫자·회피 안내: %s", (t, f) => expect(rej(b02, t as string, f as string[])).toBe(false));
  it.each(["이 경우에도 만기연장은 가능합니다.", "연장해 드릴 수 있습니다."])("불허 판정의 가능 표현: %s", (t) => expect(rej(a13, t)).toBe(false));
  it("질문에 넣은 정책 수치(90%)는 숫자 출처로 인정하지 않고, 날짜만 인정한다", () => {
    const pct = checkSentence({ text: "종전 규정으로 연장 심사하며 보증비율은 90%입니다.", facts: ["F828-01"] }, b02, factText, ["보증비율 90%라던데요"]);
    expect(pct.reasons.join()).toContain("출처에 없는 숫자");
    const date = checkSentence({ text: "만기 12월 20일 건은 종전 규정으로 연장 심사합니다.", facts: ["F828-01"] }, b02, factText, ["전세 만기가 올해 12/20이에요"]);
    expect(date.reasons.filter((r) => r.includes("숫자"))).toEqual([]);
  });

  // 2차 리뷰 우회 사례
  it.each([
    "연장 시점을 12월로 옮기시면 종전 규정이 적용됩니다.",
    "연장 신청을 올해 안에 넣으시면 종전 규정으로 연장 심사를 합니다.",
    "만기일을 12월 31일 이전으로 변경 요청하시면 종전 규정으로 연장 심사합니다.",
    "별도 확인 없이 종전 규정으로 연장됩니다.",
    "종전 규정 말고 신규 규정으로 연장 심사합니다.",
    "증액하셔도 종전 규정으로 연장 심사합니다.",
    "올해 12월 31일까지 만기가 돌아오는 건도 신규 규정으로 연장 심사를 합니다.",
  ])("조건부 2차: %s", (t) => expect(rej(b02, t, ["F828-01"])).toBe(false));
  it.each(["다주택자의 주택담보대출도 원칙적으로 만기연장 해 드리겠습니다.", "주택 수 산정 예외는 이번 만기연장 제한에서 그대로 진행됩니다."])(
    "불허 2차: %s",
    (t) => expect(rej(a13, t)).toBe(false),
  );
  it.each(["전입신고만 하셨으면 실거주로 봅니다.", "전입신고만으로도 실거주 판단에는 걱정 마세요."])("보류 2차: %s", (t) => expect(rej(c01, t)).toBe(false));
  it("정상 문장은 통과: 규정 그대로의 조건문·확인 안내", () => {
    expect(rej(b02, "증액하지 않으시면 종전 규정으로 연장 심사를 받으십니다.", ["F828-01"])).toBe(true);
    expect(checkSentence({ text: "다만 다른 예외 사유에 해당하는지 추가로 확인해 드리겠습니다.", facts: [] }, a13, factText).reasons.filter((r) => r.includes("불허"))).toEqual([]);
  });

  // 3차 리뷰
  it("시점 표현('12월 안에 접수하시면') 회피 문형", () =>
    expect(rej(b02, "12월 안에 연장 서류를 접수하시면 종전 규정으로 연장 심사를 합니다.", ["F828-01"])).toBe(false));
  it("불허 '이루어집니다' 약속", () => expect(rej(a13, "임대차 종료일까지는 만기연장이 이루어집니다.")).toBe(false));
});
