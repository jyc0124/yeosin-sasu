// 추출 결과 정규화(null → 모름, 표기 보정, 값 검증). Liner 호출 없이 돈다.
import { describe, expect, it } from "vitest";
import { normalize, type RawExtraction } from "@/lib/extract";
import { normRegion, normSigungu } from "@/lib/extract/normalize";
import { composeQuestion } from "@/lib/extract";
import { judge } from "@/lib/rules";

const emptyHouse = { label: null, region: null, sigungu: null, isApt: null, regulated: null, baseValueAtAcq: null, tags: [], claimsDepopulation: null };
const nullM1 = () => ({
  action: null, increase: null, maturityDate: null, plannedRenewalDate: null, applicationDate: null,
  contractAndDepositBy1231: null, bankIntakeBy1231: null, houses: [], houseCount: null, leasedOut: null,
  tenantIsFamily: null, everLived: null, livedEvidence: null, exception: null, targetAsserted: null,
});
const nullM2 = () => ({
  borrowerType: null, houses: [], houseCount: null, houseCountIsMinimum: null, conditionalDisposal: null, loanPurpose: null,
  collateral: { region: null, sigungu: null, isApt: null, regulated: null }, maturityDate: null,
  tenant: { mentioned: false, contractValidAt0401: null, originalEnd: null, renewal: null, renewalDate: null, renewedEnd: null, provisional: null },
  registeredRental: { mentioned: false, mandatoryEnd: null, voluntaryCancel: null, voluntaryCancelDate: null },
  legalObligation: null, legalObligationEnd: null, notifiedBy0401: null, publicInterest: null, otherException: null, homsAvailable: null, landlordMainBusiness: null,
});
const raw = (o: Partial<RawExtraction>): RawExtraction =>
  ({ module: "M2", topic: null, m1: nullM1(), m2: nullM2(), assumptions: [], ...o }) as RawExtraction;

describe("표기 정규화", () => {
  it("시도 정식 명칭 → 약칭", () => {
    expect(normRegion("경기도")).toBe("경기");
    expect(normRegion("강원특별자치도")).toBe("강원");
    expect(normRegion("서울")).toBe("서울");
    expect(normRegion("화성")).toBeUndefined();
  });
  it("시군구 접미사 보정은 지역표에 있는 이름일 때만", () => {
    expect(normSigungu("강원", "평창")).toBe("평창군");
    expect(normSigungu("경기", "동두천")).toBe("동두천시");
    expect(normSigungu("인천", "인천 강화군")).toBe("강화군");
    expect(normSigungu("부산", "금정구")).toBe("금정구");
    expect(normSigungu("서울", "강남")).toBe("강남"); // 모르는 이름은 지어내지 않음
  });
});

describe("null → 모름", () => {
  it("모든 값이 null이면 module만 남는다", () => {
    expect(normalize(raw({})).case).toEqual({ module: "M2" });
    expect(normalize(raw({ module: "M1" })).case).toEqual({ module: "M1" });
  });
  it("세입자 언급이 없으면 tenant를 만들지 않는다", () => {
    const m2 = nullM2();
    m2.tenant.contractValidAt0401 = true as never;
    expect(normalize(raw({ m2 })).case).toEqual({ module: "M2" });
  });
  it("정보 없는 주택(이름만)은 버린다", () => {
    const m2 = nullM2();
    m2.houses = [{ ...emptyHouse, label: "집" }] as never;
    expect(normalize(raw({ m2 })).case).toEqual({ module: "M2" });
  });
  it("targetAsserted=false는 '모름'과 같게 둔다(엔진은 true만 의미 있음)", () => {
    const m1 = nullM1();
    m1.targetAsserted = false as never;
    expect(normalize(raw({ module: "M1", m1 })).case).toEqual({ module: "M1" });
  });
});

describe("값 검증", () => {
  it("잘못된 날짜·음수는 모름으로 두고 경고를 남긴다", () => {
    const m2 = nullM2();
    m2.maturityDate = "2026-02-30" as never;
    m2.houseCount = -1 as never;
    const n = normalize(raw({ m2 }));
    expect(n.case).toEqual({ module: "M2" });
    expect(n.warnings).toHaveLength(2);
  });
  it("허용되지 않은 태그·열거값은 버린다", () => {
    const m2 = nullM2();
    m2.loanPurpose = "mortgage" as never;
    m2.houses = [{ ...emptyHouse, region: "강원", sigungu: "평창", tags: ["gift", "weird"] }] as never;
    expect(normalize(raw({ m2 })).case).toEqual({ module: "M2", houses: [{ region: "강원", sigungu: "평창군", tags: ["gift"] }] });
  });
  it("M0 주제가 목록에 없으면 범위 밖으로 처리", () => {
    expect(normalize(raw({ module: "M0", topic: "weather" })).module).toBe("OUT");
    expect(normalize(raw({ module: "M0", topic: "guarantee_ratio" })).case).toEqual({ module: "M0", topic: "guarantee_ratio" });
  });
});

describe("리뷰 회귀: 지어낸 false·언급 플래그가 판정을 바꾸지 않는다", () => {
  const v2 = (m2: ReturnType<typeof nullM2>) => judge({ ...normalize(raw({ m2 })).case!, asOf: "2026-11-13", kb: "v2" });
  const multi = () => {
    const m2 = nullM2();
    m2.houseCount = 2 as never;
    return m2;
  };
  it("등록임대 언급 없이 voluntaryCancel=false만 있으면 등록임대로 보지 않는다", () => {
    const m2 = multi();
    m2.registeredRental.voluntaryCancel = false as never;
    expect(normalize(raw({ m2 })).case).not.toHaveProperty("registeredRental");
    expect(v2(m2).verdict).toBe("역질문");
  });
  it("등록임대가 언급됐으면 값이 비어도 남긴다", () => {
    const m2 = multi();
    m2.registeredRental.mentioned = true;
    expect(normalize(raw({ m2 })).case).toHaveProperty("registeredRental", {});
  });
  it("notifiedBy0401=false 같은 '아니오'는 모름으로 둔다(역질문 유지)", () => {
    const m2 = multi();
    m2.notifiedBy0401 = false as never;
    m2.publicInterest = false as never;
    expect(v2(m2).verdict).toBe("역질문");
  });
  it("세입자 언급 표시가 false여도 계약 정보가 있으면 살리고 경고", () => {
    const m2 = multi();
    m2.maturityDate = "2026-12-20" as never;
    m2.tenant = { ...m2.tenant, contractValidAt0401: true, originalEnd: "2027-08-31" } as never;
    const n = normalize(raw({ m2 }));
    expect(n.case).toHaveProperty("tenant.originalEnd", "2027-08-31");
    expect(n.warnings.join()).toContain("세입자");
    expect(v2(m2).verdict).toBe("조건부");
  });
  it("기준시가 단위 오류(3)·소수 주택 수는 모름 처리", () => {
    const m2 = nullM2();
    m2.houseCount = 1.4 as never;
    m2.houses = [{ ...emptyHouse, region: "강원", sigungu: "평창군", baseValueAtAcq: 3 }] as never;
    const n = normalize(raw({ m2 }));
    expect(n.case).toEqual({ module: "M2", houses: [{ region: "강원", sigungu: "평창군" }] });
    expect(n.warnings).toHaveLength(2);
  });
  it("'다주택'(최소 2채)인데 제외로 1채가 되면 허용으로 확정하지 않는다", () => {
    const m2 = multi();
    m2.houseCountIsMinimum = true as never;
    m2.houses = [{ ...emptyHouse, region: "강원", sigungu: "평창군", baseValueAtAcq: 100000000 }] as never;
    const v = v2(m2);
    expect(v.verdict).toBe("조건부");
    expect(v.questions.length).toBeGreaterThan(0);
    m2.houseCountIsMinimum = null as never; // 정확히 2주택이라고 한 경우
    expect(v2(m2).verdict).toBe("허용");
  });
});

describe("정규화 결과가 엔진으로 이어진다", () => {
  it("B11 유형: '평창' 접미사 보정 → ➏ 제외 → 허용", () => {
    const m2 = nullM2();
    m2.houseCount = 2 as never;
    m2.houses = [{ ...emptyHouse, region: "강원도", sigungu: "평창", baseValueAtAcq: 100000000 }] as never;
    const c = normalize(raw({ m2 })).case!;
    expect(judge({ ...c, asOf: "2026-11-13", kb: "v2" }).verdict).toBe("허용");
  });
});

it("역질문 답변은 원 질문 뒤에 붙는다", () => {
  expect(composeQuestion("연장 돼요?", ["", "세입자 갱신청구권 행사"])).toBe("연장 돼요?\n\n[추가 확인 내용]\n- 세입자 갱신청구권 행사");
  expect(composeQuestion(" 연장 돼요? ")).toBe("연장 돼요?");
});
