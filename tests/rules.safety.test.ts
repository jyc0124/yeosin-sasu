// 안전장치: 규칙에 없는 사실은 확정하지 않는다(G-09), 법적 의무 종료일 모름, 관례로 채운 날짜 표시.
// 2026-11-18 새 상황 평가(data/eval/novel_v0.json)에서 나온 실패 유형을 엔진 단에서 막는다.
import { describe, expect, it } from "vitest";
import { normalize, type RawExtraction } from "@/lib/extract";
import { judge, type M2Case } from "@/lib/rules";

const multi: M2Case = { module: "M2", houseCount: 2, houseCountIsMinimum: true, collateral: { region: "서울", isApt: true }, maturityDate: "2026-12-20", asOf: "2026-11-13" };

describe("규칙에 없는 사실 (G-09)", () => {
  it("확정 판정(허용)이 나올 사례도 규칙에 없는 사실이 있으면 보류", () => {
    const v = judge({ module: "M2", houseCount: 1, asOf: "2026-11-13", unmodeled: ["분양권 1개"] });
    expect(v.verdict).toBe("보류");
    expect(v.gaps).toContain("G-09");
    expect(v.headline).toContain("분양권 1개");
    expect(v.conditions[0]).toContain("[허용]");
  });
  it("M1도 같은 규칙", () => {
    const v = judge({ module: "M1", action: "renewal", houses: [{ label: "아파트", region: "서울", isApt: true }], leasedOut: true, tenantIsFamily: true, asOf: "2026-11-13", unmodeled: ["경매 진행 중"] });
    expect(v.verdict).toBe("보류");
  });
  it("이미 심사위·역질문이면 판정은 그대로 두고 조건에만 표시", () => {
    const v = judge({ ...multi, otherException: true, unmodeled: ["이혼 재산분할 예정"] });
    expect(v.verdict).toBe("심사위");
    expect(v.conditions.at(-1)).toContain("이혼 재산분할 예정");
  });
  it("규칙에 없는 사실이 없으면 기존 판정 그대로", () => {
    expect(judge(multi).verdict).toBe("불허");
  });
});

describe("법적 의무 종료일 모름 (F401-08)", () => {
  it("전매제한으로 매도 불가 → 불허가 아니라 의무 종료일까지 연장 + 종료일 질문", () => {
    const v = judge({ ...multi, legalObligation: true });
    expect(v.verdict).toBe("허용");
    expect(v.facts).toContain("F401-08");
    expect(v.questions.some((q) => q.includes("법적 의무"))).toBe(true);
  });
});

describe("임차인 예외는 담보 주택 전제", () => {
  it("다른 집이 함께 나오면 임차인이 담보 주택에 사는지 묻는다", () => {
    const v = judge({ module: "M2", houses: [{ label: "강원 평창 시골집", region: "강원", sigungu: "평창군", isApt: false, baseValueAtAcq: 100000000 }], houseCount: 3, tenant: { contractValidAt0401: true }, asOf: "2026-11-19" });
    expect(v.conditions.some((x) => x.includes("담보 주택에 사는 경우를 전제"))).toBe(true);
    expect(v.questions.some((q) => q.includes("담보 주택인가요"))).toBe(true);
  });
});

describe("숨은 전제 드러내기", () => {
  it("전세: 임대 중인데 가족 여부를 모르면 '가족 아님' 전제를 표시하고 묻는다(질문은 한 번만)", () => {
    const v = judge({ module: "M1", action: "renewal", houses: [{ region: "서울", isApt: true }], houseCount: 1, leasedOut: true, everLived: false, maturityDate: "2027-03-01", asOf: "2026-11-19" });
    expect(v.conditions.some((x) => x.includes("가족") && x.includes("전제"))).toBe(true);
    expect(v.questions.filter((q) => q.includes("직계존비속")).length).toBe(1);
  });
  it("만기연장: 1채로 허용할 때 세대 기준임을 표시한다", () => {
    const v = judge({ module: "M2", houseCount: 1, asOf: "2026-11-19" });
    expect(v.verdict).toBe("허용");
    expect(v.conditions.some((x) => x.includes("세대 기준"))).toBe(true);
  });
  it("만기연장: 임차인 예외는 4.1 당시 유효 계약 전제를 표시한다", () => {
    const v = judge({ ...multi, tenant: { contractValidAt0401: true, originalEnd: "2027-08-31" } });
    expect(v.conditions.some((x) => x.includes("4.1 당시 이미 유효했던"))).toBe(true);
  });
});

describe("모르면 유리하게 넘기지 않기 (11/19 새 질문 35개 검토)", () => {
  it("만기를 알고 임대차 종료일을 모르면 '종료일까지 허용'이 아니라 역질문", () => {
    const v = judge({ ...multi, tenant: { contractValidAt0401: true } });
    expect(v.verdict).toBe("역질문");
  });
  it("묵시적 갱신인데 갱신 시점을 모르면 유예(4.16까지)로 가정하지 않고 역질문", () => {
    const v = judge({ ...multi, tenant: { contractValidAt0401: true, renewal: "implicit" } });
    expect(v.verdict).toBe("역질문");
    expect(v.questions.some((q) => q.includes("묵시적 갱신이 언제"))).toBe(true);
  });
  it("임대차 종료일과 만기가 추정 날짜로 같은 달이면 확정하지 않는다", () => {
    const v = judge({ ...multi, maturityDate: "2027-02-19", tenant: { contractValidAt0401: true, originalEnd: "2027-02-15", renewal: "claim" }, approxDates: ["2027-02-15"] });
    expect(v.verdict).toBe("역질문");
  });
  it("비수도권 담보의 규제지역 여부를 모르면 확정 불허 대신 조건부", () => {
    const v = judge({ module: "M2", houseCount: 2, collateral: { region: "부산", sigungu: "해운대구", isApt: true }, maturityDate: "2027-02-15", asOf: "2026-11-19" });
    expect(v.verdict).toBe("조건부");
    expect(v.gaps).toContain("G-07");
  });
  it("전세: 가족 임대면 소재지를 몰라도 허용", () => {
    const v = judge({ module: "M1", action: "renewal", houseCount: 1, leasedOut: true, tenantIsFamily: true, asOf: "2026-11-19" });
    expect(v.verdict).toBe("허용");
  });
  it("전세: 12.31까지 만기인 연장은 실거주를 묻기 전에 경과조치로 판정", () => {
    const v = judge({ module: "M1", action: "renewal", maturityDate: "2026-12-31", houses: [{ region: "서울", isApt: true }], houseCount: 1, leasedOut: true, asOf: "2026-11-19" });
    expect(v.verdict).toBe("조건부");
    expect(v.facts).toContain("F828-01");
  });
});

describe("Liner 조사로 확인한 공백(G-10~13)을 카드에 연결", () => {
  it("임차인 예외 → G-10, 묵시적 갱신 시점 모름 → G-11", () => {
    expect(judge({ ...multi, tenant: { contractValidAt0401: true, originalEnd: "2027-08-31" } }).gaps).toContain("G-10");
    expect(judge({ ...multi, tenant: { contractValidAt0401: true, renewal: "implicit" } }).gaps).toContain("G-11");
    expect(judge({ ...multi, tenant: { contractValidAt0401: true, originalEnd: "2026-06-30", renewedEnd: "2028-06-30" } }).gaps).not.toContain("G-11");
  });
  it("전세 증액 → G-12, 1채 허용 → 세대 정의 F401-20(세대원 명의 주택까지 센 수임을 표시)", () => {
    expect(judge({ module: "M1", action: "renewal", targetAsserted: true, maturityDate: "2026-12-20", increase: true, asOf: "2026-11-19" }).gaps).toContain("G-12");
    expect(judge({ module: "M2", houseCount: 1, asOf: "2026-11-19" }).facts).toContain("F401-20");
  });
});

describe("결론과 무관한 관례 날짜", () => {
  it("달이 달라 순서가 정해진 추정 날짜(종료 11월 < 만기 12월)는 일자를 묻지 않는다", () => {
    const v = judge({ ...multi, maturityDate: "2026-12-15", tenant: { contractValidAt0401: true, originalEnd: "2026-11-15" }, approxDates: ["2026-12-15", "2026-11-15"] });
    expect(v.verdict).toBe("불허");
    expect(v.questions.some((q) => q.includes("정확한"))).toBe(false);
  });
  it("조기 연장 예정일처럼 결론에 쓰이지 않은 날짜는 일자를 묻지 않는다", () => {
    const v = judge({ module: "M1", action: "renewal", maturityDate: "2027-01-05", plannedRenewalDate: "2026-12-15", targetAsserted: true, approxDates: ["2026-12-15"], asOf: "2026-11-13" });
    expect(v.verdict).toBe("불허");
    expect(v.questions.some((q) => q.includes("정확한 일자"))).toBe(false);
  });
});

describe("임대차 갱신 입력 모순", () => {
  it("4.1 이전 갱신일과 4.1 이후 기존 종료일이 함께 오면 추정하지 않고 역질문", () => {
    const v = judge({ ...multi, maturityDate: "2026-12-15", tenant: { contractValidAt0401: true, originalEnd: "2026-06-30", renewal: "implicit", renewalDate: "2025-12-15", renewedEnd: "2028-06-30" } });
    expect(v.verdict).toBe("역질문");
    expect(v.headline).not.toContain("28.6.30까지");
  });
});

describe("관례로 채운 날짜 표시", () => {
  it("월만 알려진 날짜는 '○년 ○월(일자 확인 필요)'로", () => {
    const v = judge({ ...multi, maturityDate: undefined, tenant: { contractValidAt0401: true, originalEnd: "2028-03-15" }, approxDates: ["2028-03-15"] });
    expect(v.headline).toContain("28년 3월(일자 확인 필요)");
    expect(v.headline).not.toContain("28.3.15");
  });
  it("만기가 월만 알려지면 연장 기한을 '이번 만기일의 1년 뒤'로 쓰고 정확한 만기일을 묻는다", () => {
    const v = judge({ ...multi, maturityDate: "2026-12-15", tenant: { contractValidAt0401: true, originalEnd: "2028-06-30" }, approxDates: ["2026-12-15"] });
    expect(v.headline).toContain("이번 만기일의 1년 뒤(27년 12월 중)");
    expect(v.headline).not.toContain("27.12.15");
    expect(v.questions.some((q) => q.includes("정확한 만기일은 26년 12월 며칠"))).toBe(true);
  });
  it("정규화가 assumptions의 '…-15로 가정'과 unmodeledFacts를 사례에 붙인다", () => {
    const n = normalize({ module: "M2", topic: null, m1: {} as RawExtraction["m1"], m2: { houses: [], houseCount: 2, collateral: {}, tenant: { mentioned: false }, registeredRental: { mentioned: false } } as unknown as RawExtraction["m2"], unmodeledFacts: ["입주권 1개", " "], assumptions: ["만기 12월 → 2026-12-15로 가정"] });
    expect(n.case && "unmodeled" in n.case ? n.case.unmodeled : undefined).toEqual(["입주권 1개"]);
    expect(n.case && "approxDates" in n.case ? n.case.approxDates : undefined).toEqual(["2026-12-15"]);
  });
});

describe("주택 수 기준이 없는 유형 (주거용 오피스텔·상가주택, G-09)", () => {
  it("오피스텔 때문에 다주택자가 되는 경우만 보류", () => {
    const v = judge({ module: "M2", houses: [{ label: "서울 아파트", region: "서울", isApt: true }, { label: "오피스텔", isApt: false, kind: "officetel" }], collateral: { region: "서울", isApt: true }, asOf: "2026-11-13" });
    expect(v.verdict).toBe("보류");
    expect(v.gaps).toContain("G-09");
  });
  it("오피스텔을 빼도 다주택자면 그대로 판정", () => {
    const v = judge({ module: "M2", houses: [{ label: "서울 아파트", region: "서울", isApt: true }, { label: "경기 아파트", region: "경기", isApt: true }, { label: "오피스텔", isApt: false, kind: "officetel" }], collateral: { region: "서울", isApt: true }, maturityDate: "2026-12-20", asOf: "2026-11-13" });
    expect(v.verdict).toBe("불허");
  });
  it("오피스텔 1채뿐(8.13)은 기존대로 아파트 아님 → 허용", () => {
    const v = judge({ module: "M1", action: "renewal", houses: [{ label: "경기 오피스텔", region: "경기", isApt: false, kind: "officetel" }], leasedOut: true, everLived: false, asOf: "2026-11-13" });
    expect(v.verdict).toBe("허용");
  });
});

describe("세입자 없음 (N04)", () => {
  it("'세입자 없다'는 언급 표시가 있어도 임차인 예외로 쓰지 않는다", () => {
    const n = normalize({ module: "M2", topic: null, m1: {} as RawExtraction["m1"], m2: { houses: [], houseCount: 2, houseCountIsMinimum: true, collateral: { region: "서울", isApt: true }, maturityDate: "2026-12-20", tenant: { mentioned: true, absent: true }, registeredRental: { mentioned: false } } as unknown as RawExtraction["m2"], assumptions: [] });
    expect(n.case && "tenant" in n.case ? n.case.tenant : undefined).toBeUndefined();
    expect(judge({ ...(n.case as M2Case), asOf: "2026-11-13" }).verdict).toBe("불허");
  });
});
