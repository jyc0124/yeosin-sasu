// 규칙 엔진 경계값 테스트 (테스트셋 밖의 날짜·지역 경계)
import { describe, expect, it } from "vitest";
import { judge } from "@/lib/rules";
import { tenantEnd } from "@/lib/rules/m2_renewal";
import { depopulation } from "@/lib/rules/houses";
import { addYears } from "@/lib/rules/dates";

describe("날짜", () => {
  it("1년 후 계산과 윤년 보정", () => {
    expect(addYears("2026-12-20", 1)).toBe("2027-12-20");
    expect(addYears("2028-02-29", 1)).toBe("2029-02-28");
  });
});

describe("임차인 종료일 (F401-06)", () => {
  it("4.16 묵시적 갱신은 인정, 4.17은 불인정", () => {
    const base = { contractValidAt0401: true, originalEnd: "2026-06-16", renewal: "implicit" as const, renewedEnd: "2028-06-16" };
    expect(tenantEnd({ ...base, renewalDate: "2026-04-16" }).end).toBe("2028-06-16");
    expect(tenantEnd({ ...base, renewalDate: "2026-04-17" }).end).toBe("2026-06-16");
  });
  it("갱신청구권: 7.31 종료 계약은 인정, 8.1 종료 계약은 불인정", () => {
    const base = { contractValidAt0401: true, renewal: "claim" as const, renewedEnd: "2028-08-01" };
    expect(tenantEnd({ ...base, originalEnd: "2026-07-31" }).end).toBe("2028-08-01");
    expect(tenantEnd({ ...base, originalEnd: "2026-08-01" }).end).toBe("2026-08-01");
  });
  it("가계약은 인정하지 않음", () => {
    expect(tenantEnd({ provisional: true, originalEnd: "2028-01-01" }).recognized).toBe(false);
  });
  it("갱신 방식 모름: 결과가 같으면 묻지 않음", () => {
    const r = tenantEnd({ contractValidAt0401: true, originalEnd: "2026-09-30", renewalDate: "2026-08-01", renewedEnd: "2028-09-30" });
    expect(r.ask).toBeUndefined();
    expect(r.end).toBe("2026-09-30");
  });
});

describe("➏ 인구감소(관심)지역 (F401-03)", () => {
  const V2 = { kb: "v2" as const, asOf: "2026-11-13" }; // 10.20 재지정 이후
  const V2_OLD = { kb: "v2" as const, asOf: "2026-10-19" }; // 재지정 전날 → 2021 지정
  const V1 = { kb: "v1" as const, asOf: "2026-11-13" }; // 4.1 FAQ 참고표만 앎
  it("비수도권 인구감소지역 9억 한도", () => {
    expect(depopulation({ region: "강원", sigungu: "평창군", baseValueAtAcq: 9e8 }, V2)?.status).toBe("excluded");
    expect(depopulation({ region: "강원", sigungu: "평창군", baseValueAtAcq: 9e8 + 1 }, V2)?.status).toBe("counted");
  });
  it("관심지역은 4억 한도 (인구활력+지역도 지정 유지)", () => {
    expect(depopulation({ region: "강원", sigungu: "강릉시", baseValueAtAcq: 4e8 }, V2)?.status).toBe("excluded");
    expect(depopulation({ region: "강원", sigungu: "강릉시", baseValueAtAcq: 5e8 }, V2)?.status).toBe("counted");
    expect(depopulation({ region: "전남", sigungu: "영광군", baseValueAtAcq: 9e8 }, V2)?.status).toBe("excluded");
  });
  it("수도권은 접경 인구감소지역만, 4억 한도", () => {
    expect(depopulation({ region: "경기", sigungu: "연천군", baseValueAtAcq: 3e8 }, V2)?.status).toBe("excluded");
    expect(depopulation({ region: "경기", sigungu: "연천군", baseValueAtAcq: 5e8 }, V2)?.status).toBe("counted");
    const pc = depopulation({ region: "경기", sigungu: "포천시", baseValueAtAcq: 1e8 }, V2);
    expect(pc?.status).toBe("counted");
    expect(pc?.reason).toContain("해석 확인");
  });
  it("동두천: 10.20 재지정으로 '접경지역인 인구감소지역'이 되어 ➏ 인정 (v1·재지정 전은 불인정)", () => {
    const now = depopulation({ region: "경기", sigungu: "동두천시", baseValueAtAcq: 1e8 }, V2);
    expect(now?.status).toBe("excluded");
    expect(now?.reason).toContain("재지정");
    expect(now?.facts).toContain("F020-01");
    expect(depopulation({ region: "경기", sigungu: "동두천시", baseValueAtAcq: 1e8 }, V2_OLD)?.status).toBe("counted");
    const v1 = depopulation({ region: "경기", sigungu: "동두천시", baseValueAtAcq: 1e8 }, V1);
    expect(v1?.status).toBe("counted");
    expect(v1?.facts.some((f) => f.startsWith("F020"))).toBe(false);
  });
  it("광역시는 군만 인정 — 금정구는 인구감소지역이 됐어도 불인정", () => {
    expect(depopulation({ region: "대구", sigungu: "군위군", baseValueAtAcq: 5e8 }, V2)?.status).toBe("excluded");
    expect(depopulation({ region: "부산", sigungu: "동구", baseValueAtAcq: 1e8 }, V2)?.status).toBe("counted");
    const gj = depopulation({ region: "부산", sigungu: "금정구", baseValueAtAcq: 1e8 }, V2);
    expect(gj?.status).toBe("counted");
    expect(gj?.reason).toContain("인구감소관심지역 → 인구감소지역");
  });
  it("통영: v1은 참고표 누락이라 최신 고시 확인(G-08), v2는 인구감소지역 9억 한도", () => {
    const v1 = depopulation({ region: "경남", sigungu: "통영시", claimsDepopulation: true }, V1);
    expect(v1?.status).toBe("check");
    expect(v1?.facts).toContain("G-08");
    const v2 = depopulation({ region: "경남", sigungu: "통영시", claimsDepopulation: true }, V2);
    expect(v2?.status).toBe("ask");
    expect(v2?.reason).toContain("9억");
    // 같은 5억 주택: 2021 지정(관심지역, 4억 한도)이면 포함, 재지정 후(인구감소지역, 9억 한도)면 제외
    expect(depopulation({ region: "경남", sigungu: "통영시", baseValueAtAcq: 5e8 }, V2_OLD)?.status).toBe("counted");
    expect(depopulation({ region: "경남", sigungu: "통영시", baseValueAtAcq: 5e8 }, V2)?.status).toBe("excluded");
    expect(depopulation({ region: "경기", sigungu: "수원시", claimsDepopulation: true }, V2)).toBeUndefined();
  });
  it("신규 관심지역(예천·칠곡)과 인천 동구→제물포구 표기", () => {
    expect(depopulation({ region: "경북", sigungu: "예천군", baseValueAtAcq: 3e8 }, V2)?.status).toBe("excluded");
    expect(depopulation({ region: "경북", sigungu: "칠곡군", baseValueAtAcq: 3e8 }, V1)).toBeUndefined();
    expect(depopulation({ region: "인천", sigungu: "동구", baseValueAtAcq: 1e8 }, V2)?.status).toBe("counted"); // 수도권·광역시 구
  });
});

describe("M1 경과조치 경계 (F828-01·02)", () => {
  const base = { module: "M1" as const, action: "renewal" as const, targetAsserted: true, kb: "v2" as const };
  it("12.31 만기는 종전, 1.1 만기는 신규", () => {
    expect(judge({ ...base, maturityDate: "2026-12-31" }).verdict).toBe("조건부");
    expect(judge({ ...base, maturityDate: "2027-01-01" }).verdict).toBe("불허");
  });
  it("27년 신청이라도 12.31까지 전산 접수했으면 종전 규정", () => {
    const v = judge({ module: "M1", action: "new", targetAsserted: true, kb: "v2", applicationDate: "2027-01-10", bankIntakeBy1231: true });
    expect(v.verdict).toBe("조건부");
  });
  it("조기 연장 질문에 회피 안내를 하지 않는다", () => {
    const v = judge({ ...base, maturityDate: "2027-01-05", plannedRenewalDate: "2026-12-15" });
    expect(v.verdict).toBe("불허");
    expect(v.conditions.join(" ")).toContain("회피 방법");
  });
  it("v1에서는 경과조치를 모르므로 보류", () => {
    expect(judge({ ...base, kb: "v1", maturityDate: "2026-12-20" }).verdict).toBe("보류");
  });
});

describe("M2 1년 주기와 중복 예외 (F401-13·14)", () => {
  const base = { module: "M2" as const, houseCount: 2, collateral: { region: "서울", isApt: true } };
  it("임대차 종료가 1년 넘게 남으면 1년만 연장", () => {
    const v = judge({ ...base, maturityDate: "2026-12-01", tenant: { contractValidAt0401: true, originalEnd: "2028-04-01" } });
    expect(v.verdict).toBe("조건부");
    expect(v.headline).toContain("27.12.1");
  });
  it("예외 중복 시 늦은 날짜", () => {
    const v = judge({ ...base, maturityDate: "2026-12-01", legalObligationEnd: "2027-06-30", tenant: { contractValidAt0401: true, originalEnd: "2027-03-31" } });
    expect(v.headline).toContain("27.6.30");
    expect(v.facts).toContain("F401-14");
  });
  it("비수도권 비규제 담보는 대상 아님", () => {
    expect(judge({ ...base, collateral: { region: "전남", isApt: true, regulated: false } }).verdict).toBe("허용");
  });
});

// 현장 피드백(11/22·11/24): 담보 지역·유형을 모르는 채 '불가'가 맨 위에 뜨면 확정 결론으로 읽힌다
// → '고객 확인 필요'(역질문)로 두고, 전제와 소재지별 결론(갈림길)을 함께 보인다
describe("M2 담보 소재지 미확인", () => {
  it("담보 정보 없이 증여로 2주택 → 역질문 + 담보 전제", () => {
    const v = judge({ module: "M2", asOf: "2026-11-13", kb: "v2", houseCount: 2, houses: [{ tags: ["gift"] }, {}], maturityDate: "2026-12-20" });
    expect(v.verdict).toBe("역질문");
    expect(v.premise).toMatch(/수도권·규제지역 아파트라는 전제/);
    expect(v.questions.some((q) => q.includes("소재지"))).toBe(true);
  });
  it("아파트인 건 알고 소재지만 모름(예외 없음 확인) → 역질문 + 갈림길(수도권 불가 / 비규제지역 가능)", () => {
    const v = judge({ module: "M2", asOf: "2026-11-13", kb: "v2", houseCount: 2, houses: [{ tags: ["gift"] }], collateral: { isApt: true }, exceptionsNone: true });
    expect(v.verdict).toBe("역질문");
    expect(v.branches?.options.map((o) => o.verdict)).toEqual(["불허", "허용"]);
    // 아파트인 건 이미 알므로 소재지만 묻는다
    expect(v.questions.at(-1)).toMatch(/^담보 주택의 소재지\(시군구\)는\?/);
    expect(v.questions.at(-1)).not.toMatch(/아파트/);
  });
  it("담보가 본인 명의 유일한 주택(수도권 아파트)으로 나오면 소재지를 아는 것으로 본다", () => {
    const v = judge({ module: "M2", asOf: "2026-11-13", kb: "v2", houses: [{ region: "수도권", isApt: true, owner: "self" }, { owner: "household" }], maturityDate: "2027-06-21" });
    expect(v.verdict).toBe("불허");
  });
  it("담보가 서울 아파트로 확인되면 전제 없음", () => {
    const v = judge({ module: "M2", asOf: "2026-11-13", kb: "v2", houseCount: 2, collateral: { region: "서울", isApt: true }, maturityDate: "2026-12-20" });
    expect(v.verdict).toBe("불허");
    expect(v.premise).toBeUndefined();
  });
});
