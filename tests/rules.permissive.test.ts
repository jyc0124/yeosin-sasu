// 관대한 오류(안 되는 대출을 '가능'으로) 경로 점검 — 11/23 제3자 검토(Codex 독립 지적을 엔진에 직접 넣어 확인)에서 나온 세 경로.
import { describe, expect, it } from "vitest";
import { judge } from "@/lib/rules";

const A = { asOf: "2026-11-23", kb: "v2" as const };

describe("예외① 법적 의무 실거주는 비거주 1주택자 제한의 예외", () => {
  it("다주택자는 예외①이어도 다주택자 제한(F813-10)으로 불허", () => {
    const v = judge({ module: "M1", action: "new", applicationDate: "2027-01-02", houseCount: 2, exception: "legal_obligation", ...A });
    expect(v.verdict).toBe("불허");
    expect(v.conditions.join(" ")).toContain("다주택자 전세대출보증 제한에는 적용되지 않습니다");
  });
  it("1주택이면 그대로 가능(실거주 시점에 전세대출 종료 조건)", () => {
    const v = judge({ module: "M1", action: "new", applicationDate: "2027-01-02", houseCount: 1, exception: "legal_obligation", ...A });
    expect(["허용", "조건부"]).toContain(v.verdict);
  });
  it("주택 수를 말하지 않으면 그 집 1채로 보되, 다른 주택이 있는지 묻고 조건으로 남긴다", () => {
    const v = judge({ module: "M1", leasedOut: true, exception: "legal_obligation", ...A });
    expect(v.questions.join(" ")).toContain("이번에 산 집 외에");
    expect(v.conditions.join(" ")).toContain("이 집 1채일 때의 판정");
  });
});

describe("예외②③④는 연장에만 있다(F813-07)", () => {
  for (const exception of ["succession", "deposit_unreturned", "short_extension"] as const) {
    it(`신규로 읽힌 ${exception} → 가능으로 내지 않고 연장 건인지 묻는다`, () => {
      const v = judge({ module: "M1", targetAsserted: true, action: "new", applicationDate: "2027-01-02", exception, ...A });
      expect(v.verdict).toBe("역질문");
      expect(v.questions.join(" ")).toContain("연장하는 건인가요, 새로 받는");
    });
  }
  it("연장 건이면 그 예외로 조건부", () => {
    const v = judge({ module: "M1", targetAsserted: true, action: "renewal", maturityDate: "2027-03-01", exception: "succession", ...A });
    expect(v.verdict).toBe("조건부");
  });
});

describe("유주택자 한도 2억원: 최초 임대차계약일이 결론을 뒤집으면 먼저 묻는다", () => {
  const base = { module: "M1" as const, houseCount: 1, houses: [{ owner: "self" as const, region: "서울", isApt: true }], leasedOut: false, action: "renewal" as const, maturityDate: "2027-06-01", increase: false, sameHome: true, rentalRegion: "서울", loanAmount: 300000000, ...A };
  it("계약일 모름 → 고객 확인 필요", () => {
    const v = judge(base);
    expect(v.verdict).toBe("역질문");
    expect(v.questions.join(" ")).toContain("2025.9.7까지 체결했나요");
  });
  it("'25.9.7까지 계약 → 종전 한도로 가능", () => {
    expect(judge({ ...base, firstLeaseBy0907: true }).verdict).toBe("허용");
  });
  it("'25.9.7 이후 계약 → 한도 초과로 불가", () => {
    expect(judge({ ...base, firstLeaseBy0907: false }).verdict).toBe("불허");
  });
});

describe("등록임대: 4.2 이후 체결 계약은 최대 2년(F401-07)", () => {
  it("4.2 이후 맺은 4년 계약 → 계약일부터 2년까지만 인정", () => {
    const v = judge({ module: "M2", borrowerType: "individual", houseCount: 2, collateral: { region: "서울", isApt: true }, maturityDate: "2027-12-01", registeredRental: { mandatoryEnd: "2026-12-01" }, tenant: { contractValidAt0401: false, originalEnd: "2026-05-01", renewal: "agreed", renewalDate: "2026-05-01", renewedEnd: "2030-05-01" }, ...A });
    expect(v.headline).toContain("28.5.1");
    expect(v.headline).not.toContain("30.5.1");
  });
});

describe("1주택자 전세대출 DSR: 다른 집으로 옮기며 연장하면 적용(F828-12)", () => {
  const base = { module: "M1" as const, houseCount: 1, houses: [{ owner: "self" as const, region: "서울", isApt: true }], leasedOut: false, action: "renewal" as const, maturityDate: "2027-06-01", increase: false, rentalRegion: "서울", loanAmount: 100000000, dsrRatio: 45, lenderSector: "bank" as const, policyLoan: false, ...A };
  it("이사 + DSR 45% → 불가", () => expect(judge({ ...base, sameHome: false }).verdict).toBe("불허"));
  it("같은 집 무증액 연장 → DSR 미적용", () => expect(judge({ ...base, sameHome: true }).verdict).not.toBe("불허"));
});

describe("4.1 만기를 '4월'로만 알면 4.16 경계를 확정하지 않는다", () => {
  it("추정 날짜 4월 → 정확한 만기일 질문", () => {
    const v = judge({ module: "M2", borrowerType: "individual", houseCount: 2, collateral: { region: "서울", isApt: true }, maturityDate: "2026-04-15", approxDates: ["2026-04-15"], exceptionsNone: true, ...A });
    expect(v.verdict).toBe("역질문");
  });
  it("정확한 날짜 4.15 → 종전 규정", () => {
    expect(judge({ module: "M2", borrowerType: "individual", houseCount: 2, collateral: { region: "서울", isApt: true }, maturityDate: "2026-04-15", exceptionsNone: true, ...A }).verdict).toBe("허용");
  });
});

describe("2차 제3자 검토(Codex) 지적 6건", () => {
  const J = (c: Record<string, unknown>) => judge({ ...c, ...A } as Parameters<typeof judge>[0]);
  it("증액 연장 + 불가피한 비거주(⑤) → 심사위", () => {
    expect(J({ module: "M1", targetAsserted: true, action: "renewal", maturityDate: "2026-12-20", increase: true, exception: "other_inevitable", loanAmount: 100000000, newLoanAmount: 150000000, rentalRegion: "서울" }).verdict).toBe("심사위");
  });
  it("상가 임대사업용: 세대 2주택을 말했고 동의 거부 → 불허", () => {
    expect(J({ module: "M2", borrowerType: "individual", loanPurpose: "commercial", countClaims: [{ scope: "household", count: 2 }], consentRefused: true, collateral: { region: "서울", isApt: true }, maturityDate: "2026-12-20", exceptionsNone: true }).verdict).toBe("불허");
  });
  it("법인 HOMS 조회 불가: 다주택 확인 → 불허, 산정 예외로 1주택이면 대체 입증 절차", () => {
    const base = { module: "M2", borrowerType: "corporate_landlord", landlordMainBusiness: "rental", homsAvailable: false, collateral: { region: "서울", isApt: true }, maturityDate: "2026-12-20", exceptionsNone: true };
    expect(J({ ...base, houseCount: 2 }).verdict).toBe("불허");
    expect(J({ ...base, houseCount: 2, houses: [{ label: "아파트", region: "서울", isApt: true, owner: "self", isCollateral: true }, { label: "문화유산 주택", owner: "self", tags: ["heritage"] }] }).verdict).toBe("조건부");
  });
  it("다음 만기: 지난 만기 전에 끝난 임대차 예외는 근거가 아님 → 불허", () => {
    expect(J({ module: "M2", borrowerType: "individual", houseCount: 2, collateral: { region: "서울", isApt: true }, maturityDate: "2026-04-15", asksNextMaturity: true, tenant: { contractValidAt0401: true, originalEnd: "2026-04-10", renewal: "none" }, exceptionsNone: true }).verdict).toBe("불허");
  });
  it("DSR 초과인데 전셋집 소재지 모름 → 고객 확인 필요", () => {
    expect(J({ module: "M1", houseCount: 1, houses: [{ region: "서울", isApt: false }], action: "new", applicationDate: "2027-02-01", dsrRatio: 60, policyLoan: false }).verdict).toBe("역질문");
  });
  it("묵시적 갱신일을 4월로만 앎 → 정확한 날짜 질문", () => {
    expect(J({ module: "M2", houseCount: 2, collateral: { region: "서울", isApt: true }, maturityDate: "2026-06-01", tenant: { contractValidAt0401: true, originalEnd: "2026-04-15", renewal: "implicit", renewalDate: "2026-04-15", renewedEnd: "2028-04-15" }, approxDates: ["2026-04-15", "2028-04-15"], exceptionsNone: true }).verdict).toBe("역질문");
  });
});

describe("현장 검토(11/22): 한도를 물었는데 8.13 대상 확인에서 멈춰도 한도 2억원·DSR을 답한다", () => {
  const q1 = { module: "M1" as const, action: "renewal" as const, increase: true, houseCount: 1, depositIncrease: true, asOf: "2026-10-16", kb: "v2" as const };
  it("증액 연장 + 보유 주택 소재지 모름 → 판정은 고객 확인 필요 그대로, 조건 줄에 한도 2억원·DSR", () => {
    const v = judge(q1);
    expect(v.verdict).toBe("역질문");
    expect(v.conditions.join(" ")).toContain("한도 2억원과 DSR");
    expect(v.basis?.map((b) => b.label)).toContain("유주택자 전세대출 한도 2억원");
  });
  it("무주택이면 붙이지 않는다", () => {
    const v = judge({ module: "M1", houseCount: 0, action: "new", rentalRegion: "서울", asOf: "2026-10-12", kb: "v2" });
    expect(v.conditions.join(" ")).not.toContain("한도 2억원");
  });
  it("전셋집이 비수도권·비규제지역으로 확인되면 붙이지 않는다", () => {
    const v = judge({ ...q1, rentalRegion: "부산", rentalRegulated: false });
    expect(v.conditions.join(" ")).not.toContain("한도 2억원과 DSR");
  });
});
