// 항목별 답변(app/_components/answerItems): 질문 문장 구조에서 선택지를 뽑고, 답을 '고객에게 확인한 답' 문장으로 만든다.
// 현장 피드백(11/22) UI 상세 수정안 A01~A03·C01.
import { describe, expect, it } from "vitest";
import { answerLine, composeAnswers, composeCorrection, dateError, EMPTY, groupFor, isHqItem, itemFor, status } from "@/app/_components/answerItems";

describe("질문 → 답변 칸", () => {
  it("①~⑤ 목록은 여러 개 고르기 + 해당 없음", () => {
    const it = itemFor("예외 사유 해당 여부: ① 법적 의무로 실거주 예정(토허구역 매수 등) ② 임대차 승계 조건부 취득 ③ 임대인 보증금 미반환");
    expect(it.kind).toBe("multi");
    expect(it.options).toEqual(["법적 의무로 실거주 예정", "임대차 승계 조건부 취득", "임대인 보증금 미반환"]);
    expect(it.none).toBe("해당 없음");
  });
  it("'A인지, B가 있는지' 나열은 읽히는 선택지로", () => {
    const it = itemFor("만기연장 예외 사유: 임차인이 있는지(계약 기간), 등록임대사업자인지, 법적 의무(전매제한·실거주의무)가 있는지, 4.1 이전에 연장을 통보받았는지");
    expect(it.options).toEqual(["임차인 있음", "등록임대사업자", "법적 의무(전매제한·실거주의무) 있음", "4.1 이전에 연장을 통보받음"]);
  });
  it("주택 수·예아니오·날짜·소재지", () => {
    expect(itemFor("본인과 배우자 명의 주택이 모두 몇 채인가요? (부부합산)").options).toContain("1채");
    expect(itemFor("본인 또는 배우자가 그 주택에 하루라도 실거주한 적이 있나요?").options).toEqual(["산 적 있음", "산 적 없음"]);
    expect(itemFor("임대차계약 종료일은 언제인가요?").kind).toBe("date");
    expect(itemFor("통보한 연장 기한과 대출 약정서상 만기일은 각각 언제인가요?").kind).toBe("text");
    expect(itemFor("담보 주택의 소재지(시군구)와 아파트 여부는? (수도권 밖이면 대상 아님)").options).toEqual(["아파트", "아파트 아님"]);
  });
  it("연장인지 신규인지 고르기(연장 전용 예외가 신규로 읽힌 경우)", () => {
    expect(itemFor("지금 있는 전세대출을 연장하는 건인가요, 새로 받는 전세대출인가요? (연장이면 이 예외로 가능, 신규면 적용 불가)").options).toEqual(["지금 대출 연장", "새로 받는 대출(신규)"]);
  });
  it("본점 확인 항목은 고객 질문이 아니다", () => {
    expect(isHqItem('"분양권 1개" — 이 사실이 주택 수·규제 대상·예외 판단에 어떻게 반영되는지 본점 확인')).toBe(true);
    expect(isHqItem("임대차계약 종료일은 언제인가요?")).toBe(false);
  });
});

describe("답 → 보낼 문장", () => {
  const it1 = itemFor("본인 또는 배우자가 그 주택에 하루라도 실거주한 적이 있나요? (있으면 규제 대상이 아닙니다)");
  it("빈칸은 보내지 않고, 미확인은 '모름'으로(아니오·0으로 바꾸지 않음)", () => {
    expect(answerLine(it1, EMPTY)).toBeNull();
    expect(answerLine(it1, { picks: [], text: "", unknown: true })).toBe("본인 또는 배우자가 그 주택에 하루라도 실거주한 적이 있나요? → 고객도 모름(미확인)");
    expect(answerLine(it1, { picks: ["산 적 없음"], text: "", unknown: false })).toMatch(/→ 산 적 없음$/);
    expect(status(undefined)).toBe("empty");
    expect(status({ picks: [], text: " ", unknown: false })).toBe("empty");
  });
  it("여러 답은 번호를 붙여 한 번에, 새 질문이 아님을 밝힌다", () => {
    const t = composeAnswers(["a → 예", "b → 고객도 모름(미확인)"]);
    expect(t).toMatch(/^고객에게 확인한 답\(새 질문 아님/);
    expect(t).toContain("1) a → 예\n2) b → 고객도 모름(미확인)");
  });
  it("조건 정정은 바꾼 항목만", () => {
    const t = composeCorrection([{ k: "보유 주택 1", from: "상속", to: "증여" }], "");
    expect(t).toMatch(/^조건 정정\(새 질문 아님.*다른 조건은 그대로\)/);
    expect(t).toContain("- 보유 주택 1: 상속 → 증여");
  });
});

describe("날짜 형식 검사(정책 판단과 무관)", () => {
  it("형식·실제 날짜", () => {
    expect(dateError("2027.3.31")).toBeNull();
    expect(dateError("27.3.31")).toBeNull();
    expect(dateError("2027-02-30")).toMatch(/실제 있는 날짜/);
    expect(dateError("내년 봄")).toMatch(/형식/);
    expect(dateError("")).toBeNull();
  });
});

describe("예/아니오 질문: 어미·보충 괄호", () => {
  it("'…늘리나요? (보충 괄호)'도 예/아니오", () => {
    const it1 = itemFor("담보 주택에 지금 사나요? (전입 기준)");
    expect(it1.kind).toBe("single");
    expect(it1.options).toEqual(["예", "아니오"]);
  });
  it("대출금액 증액은 늘림/그대로 + 금액(선택)", () => {
    const it2 = itemFor("연장하면서 전세대출 금액을 늘리나요? (임차보증금이 아니라 대출금액 기준)");
    expect(it2.options).toEqual(["늘림(증액)", "그대로(증액 없음)"]);
    expect(it2.placeholder).toMatch(/금액/);
    expect(answerLine(it2, { picks: ["늘림(증액)"], text: "2억 → 2.3억", unknown: false })).toBe("연장하면서 전세대출 금액을 늘리나요? → 늘림(증액), 2억 → 2.3억");
  });
  it("무엇·어떤을 묻는 질문은 글 입력", () => {
    expect(itemFor("어떤 보증기관 상품인가요?").kind).toBe("text");
    expect(itemFor("임차인은 누구인가요?").kind).toBe("text");
  });
});

describe("질문 묶음(groupFor): 두세 가지를 묻는 질문은 칸을 나눈다", () => {
  it("물음표 뒤 괄호 설명은 따로 칸을 만들지 않는다(11/24 화면 확인)", () => {
    for (const q of ["담보 주택의 소재지(시군구)는? (수도권 밖 비규제지역이면 이번 제한 대상이 아닙니다)", "공익 목적 법인(민간임대리츠·공익법인)인가요? (그렇다면 제한의 예외입니다)"]) {
      const g = groupFor(q);
      expect(g.items).toHaveLength(1);
      expect(g.hint).toMatch(/^\(?[^)]*\)?$/);
    }
  });
  it("'A과 B은 각각 언제' → 날짜 두 칸, 보낼 문장은 칸 이름으로", () => {
    const g = groupFor("통보한 연장 기한과 대출 약정서상 만기일은 각각 언제인가요?");
    expect(g.items.map((i) => [i.label, i.kind])).toEqual([
      ["통보한 연장 기한", "date"],
      ["대출 약정서상 만기일", "date"],
    ]);
    expect(answerLine(g.items[0], { picks: [], text: "2026.3.20", unknown: false })).toBe("통보한 연장 기한 → 2026.3.20");
    expect(new Set(g.items.map((i) => i.q)).size).toBe(2);
  });
  it("소재지·유형과 임대 여부 → 세 칸(임대 여부를 빠뜨리지 않음)", () => {
    const g = groupFor("보유 주택의 소재지·유형(수도권·규제지역 아파트인가요?)과 임대 여부(임차인이 가족인가요?)");
    expect(g.items.map((i) => i.label)).toEqual(["소재지", "유형", "임대 여부"]);
  });
  it("물음표 두 개 → 문장마다 예/아니오", () => {
    const g = groupFor("대환이라면 다른 대출로 갈아타는 것인가요? 버팀목 등 정책 전세대출인가요?");
    expect(g.items).toHaveLength(2);
    expect(g.items.every((i) => i.kind === "single")).toBe(true);
  });
  it("목록형은 제목을 콜론 앞만, 괄호 설명은 제목 아래로", () => {
    expect(groupFor("예외 사유 해당 여부: ① 법적 의무로 실거주 예정 ② 임대차 승계 조건부 취득").title).toBe("예외 사유 해당 여부");
    const g = groupFor("연장하면서 전세대출 금액을 늘리나요? (임차보증금이 아니라 대출금액 기준)");
    expect(g.title).toBe("연장하면서 전세대출 금액을 늘리나요?");
    expect(g.hint).toBe("임차보증금이 아니라 대출금액 기준");
  });
  it("고를 수 있는 것은 버튼: 시도·대출 종류·기준시가·규제지역 지정", () => {
    expect(itemFor("고객이 사는 전셋집의 소재지(시도)는? (수도권·규제지역이면 한도 2억원·DSR 적용)").options).toEqual(["서울", "경기", "인천", "그 밖의 지역"]);
    expect(itemFor("대출 종류(일반 주담대·생활안정자금·중도금·이주비)").options).toEqual(["일반 주담대", "생활안정자금", "중도금", "이주비"]);
    expect(itemFor("인천 강화군 주택의 취득 시 기준시가가 4억 원(수도권 접경 인구감소지역) 이하인가요? (취득 시점 기준시가는 공개 자료로 확인 가능)").options).toEqual(["4억 원 이하", "4억 원 초과"]);
    expect(itemFor("담보 주택 소재지가 현재 규제지역(조정대상지역·투기과열지구)으로 지정돼 있나요?").kind).toBe("single");
  });
});

describe("나눈 칸의 답은 질문 제목과 함께 보낸다", () => {
  it("칸 이름만으로 무엇의 답인지 모를 때 제목을 붙인다", () => {
    const g = groupFor("보유 주택의 소재지·유형(수도권·규제지역 아파트인가요?)과 임대 여부(임차인이 가족인가요?)");
    expect(answerLine(g.items[0], { picks: [], text: "서울 송파구", unknown: false }, g.title)).toBe("보유 주택의 소재지·유형과 임대 여부: 소재지 → 서울 송파구");
  });
  it("칸 이름이 이미 질문 문장이면 제목을 붙이지 않는다", () => {
    const g = groupFor("대환이라면 다른 대출로 갈아타는 것인가요? 버팀목 등 정책 전세대출인가요?");
    expect(answerLine(g.items[1], { picks: ["예"], text: "", unknown: false }, g.title)).toBe("버팀목 등 정책 전세대출인가요 → 예");
  });
});
