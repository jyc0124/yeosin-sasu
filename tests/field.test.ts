// 현장 질문 세트 v1(data/field_questions_v1.md, 2026-11-21) 대응 — 규칙 엔진 단위 테스트(추출 없이 Case 직접 입력)
// 정답 뼈대: data/field_answers_v1.md
import { describe, expect, it } from "vitest";
import { judge } from "@/lib/rules";
import { resolveFacts, resolveGaps } from "@/lib/kb";
import { buildInquiry } from "@/lib/hq/inquiry";
import type { Case, M1Case } from "@/lib/rules/types";

const asOf = "2026-11-21";
const base: M1Case = { module: "M1", action: "renewal", maturityDate: "2026-12-20", houseCount: 1, targetAsserted: true, asOf, kb: "v2" };

describe("FQ1 증액 연장 = 대출금액 기준(F828-01)", () => {
  it("FQ1-1 보증금만 증액, 대출금액 그대로 → 증액 연장 아님, 종전 규정", () => {
    const v = judge({ ...base, increase: false, depositIncrease: true, loanAmount: 200_000_000 });
    expect(v.verdict).toBe("조건부");
    expect(v.headline).toContain("'증액 연장'이 아닙니다");
    expect(v.trace.some((t) => t.step === "S5 증액" && t.facts.includes("F828-01"))).toBe(true);
    expect(v.conditions.join(" ")).toContain("만기도래일");
  });

  it("FQ1-2 대출금액 2억 → 2.3억 증액 → 변경 규정, 한도 2억 초과 표시, G-12 쟁점", () => {
    const v = judge({ ...base, increase: true, depositIncrease: true, loanAmount: 200_000_000, newLoanAmount: 230_000_000 });
    expect(v.headline).toContain("2억원 → 2.3억원");
    expect(v.headline).toContain("예외 사유가 없으면 증액 연장을 할 수 없습니다");
    expect(v.gaps).toContain("G-12");
    const limit = v.basis?.find((b) => b.label.includes("한도"));
    expect(limit?.text).toContain("2.3억원은 한도 2억원을 넘습니다");
    expect(limit?.facts).toEqual(["F828-09", "F828-10"]);
    expect(v.basis?.some((b) => b.label.includes("DSR") && b.text.includes("DSR"))).toBe(true);
    // 전셋집 소재지를 모르면 묻는다
    expect(v.questions.some((q) => q.includes("전셋집"))).toBe(true);
  });

  it("FQ1-3 만기 27.1.20 → 경과조치 불가, 결론에 이유", () => {
    const v = judge({ ...base, increase: false, maturityDate: "2027-01-20" });
    expect(v.verdict).toBe("불허");
    expect(v.headline).toMatch(/^만기가 27\.1\.20로 '27\.1\.1 이후라 경과조치/);
  });

  it("전셋집이 비수도권·비규제지역이면 한도·DSR 대상 아님", () => {
    const v = judge({ ...base, increase: true, rentalRegion: "부산", rentalRegulated: false });
    expect(v.basis?.[0].text).toContain("대상이 아닙니다");
    expect(v.questions.some((q) => q.includes("전셋집"))).toBe(false);
  });

  it("KB v1에는 함께 보는 규제(F828)가 없다", () => {
    const v = judge({ ...base, increase: true, kb: "v1" });
    expect(v.basis ?? []).toHaveLength(0);
  });
});

describe("FQ2 대환(G-15)", () => {
  it("증액 목적 대환 → 연장·신규 두 경우를 나눠 보여 주고 보류", () => {
    const v = judge({ ...base, refinance: true, increase: true });
    expect(v.verdict).toBe("보류");
    expect(v.gaps).toContain("G-15");
    expect(v.basis?.map((b) => b.label)).toEqual(expect.arrayContaining(["연장으로 보면", "신규로 보면"]));
  });
});

describe("FQ3 부모 명의 주택은 8.13 부부합산에 넣지 않는다(F813-01)", () => {
  it("본인 1채 + 부모 1채 → 8.13 판단은 1주택", () => {
    const v = judge({ module: "M1", action: "renewal", houseCount: 1, otherHouseholdHouses: 1, asOf, kb: "v2" });
    expect(v.trace.some((t) => t.result.includes("부부합산이라 세지 않음"))).toBe(true);
    expect(v.trace.some((t) => t.result.includes("다주택"))).toBe(false);
  });
});

describe("해석·범위형 주제(M0)", () => {
  const m0 = (topic: string, kb: "v1" | "v2" = "v2") => judge({ module: "M0", topic, asOf, kb } as Case);
  it.each([
    ["increase_definition", "안내", ["G-12"]],
    ["jeonse_basis_date", "안내", []],
    ["renewal_vs_refinance", "보류", ["G-15"]],
    ["house_count_scope", "안내", ["G-14"]], // 세대 범위는 F401-20(은행업감독규정 <별표6>)으로 해소
    ["household_scope_consent", "보류", ["G-13"]],
    ["early_renewal_procedure", "안내", []],
  ])("%s → %s, 쟁점 %j", (topic, verdict, gaps) => {
    const v = m0(topic);
    expect(v.verdict).toBe(verdict);
    expect(v.gaps).toEqual(gaps);
    expect(v.basis?.length ?? 0).toBeGreaterThan(0);
    // 확인된 기준의 근거는 모두 판정 근거 자료에 있는 Fact여야 한다
    for (const b of v.basis ?? []) expect(resolveFacts(b.facts)).toHaveLength(b.facts.length);
  });

  it("FQ4-2 예외 적용 범위: 4.1·8.13 둘 다, 그 밖 규제는 아님", () => {
    const v = m0("exception_scope");
    expect(v.facts).toEqual(expect.arrayContaining(["F401-15", "F813-04"]));
    expect(v.headline).toContain("8.13 비거주 1주택자 전세대출 제한");
  });

  it("8.28 행정지도에만 기대는 주제는 KB v1에서 보류", () => {
    expect(m0("increase_definition", "v1").verdict).toBe("보류");
    expect(m0("jeonse_basis_date", "v1").verdict).toBe("보류");
    // v1 근거가 있는 주제는 v1에서도 답한다
    expect(m0("house_count_scope", "v1").verdict).toBe("안내");
  });

  it("FQ10 만기 전 연장: 회피 방법 안내 금지 문구, 고객 건 판정 없음", () => {
    const v = m0("early_renewal_procedure");
    expect(v.conditions.join(" ")).toContain("제7조 1항");
    expect(v.questions).toHaveLength(0);
  });
});

describe("FQ5-2 본점 질의서: 확인된 기준과 쟁점을 나눈다", () => {
  it("household_scope_consent → escalate, confirmed에 HOMS 동의, 쟁점에 G-13", () => {
    const c: Case = { module: "M0", topic: "household_scope_consent", asOf, kb: "v2" };
    const v = judge(c);
    const d = buildInquiry({ question: "q", followUps: [], asOf, case: c, caseRows: [], card: { ...v, factRefs: resolveFacts(v.facts), gapRefs: resolveGaps(v.gaps) } });
    expect(d.kind).toBe("escalate");
    expect(d.confirmed?.some((x) => x.includes("HOMS"))).toBe(true);
    expect(d.issues.some((x) => x.includes("G-13"))).toBe(true);
  });

  it("남은 쟁점이 있는 안내 카드도 질의(escalate)", () => {
    const c: Case = { module: "M0", topic: "house_count_scope", asOf, kb: "v2" };
    const v = judge(c);
    const d = buildInquiry({ question: "q", followUps: [], asOf, case: c, caseRows: [], card: { ...v, factRefs: resolveFacts(v.facts), gapRefs: resolveGaps(v.gaps) } });
    expect(d.kind).toBe("escalate");
  });
});

describe("안내 문구 검증기: 금액 표기", () => {
  it("'2억 3천만원'·'5천만원'·'2.3억원'은 억 단위 금액(2.3억은 날짜 2.3이 아님)", async () => {
    const { numTokens } = await import("@/lib/explain/verify");
    expect(numTokens("2억 3천만원, 5천만원, 2.3억원")).toEqual([
      { kind: "num", v: 2.3, unit: "억" },
      { kind: "num", v: 0.5, unit: "억" },
      { kind: "num", v: 2.3, unit: "억" },
    ]);
  });
});

describe("일반 규칙 보강(Codex 개발용 세트에서 드러난 구조 문제)", () => {
  it("'수도권'(시도 미상)도 수도권으로 판단", async () => {
    const { isCapital } = await import("@/lib/rules/houses");
    expect(isCapital("수도권")).toBe(true);
    expect(isCapital("비수도권")).toBe(false);
  });
  it("유주택자가 수도권 전셋집 신규 2억원 초과 → 8.13 대상이 아니어도 신청 금액 그대로는 불허(F828-09)", () => {
    const v = judge({ module: "M1", action: "new", applicationDate: "2027-01-05", houses: [{ region: "비수도권", regulated: false }], houseCount: 1, newLoanAmount: 200_000_001, rentalRegion: "수도권", asOf, kb: "v2" });
    expect(v.verdict).toBe("불허");
    expect(v.headline).toContain("한도 2억원을 넘어");
    expect(v.facts).toContain("F828-09");
  });
  it("같은 집 계속 거주·무증액·최초 계약 '25.9.7 이전 연장은 종전 한도(초과해도 불허 아님)", () => {
    const v = judge({ ...base, increase: false, sameHome: true, firstLeaseBy0907: true, newLoanAmount: 240_000_000, rentalRegion: "서울" });
    expect(v.verdict).toBe("조건부");
  });
  it("연장+증액이 한도 2억원을 넘으면 묻는 그대로(증액)는 불허, '증액 없이 연장'은 대안으로 남긴다(11/22 설계 변경: 규제는 독립, 하나라도 막으면 막힘)", () => {
    const v = judge({ ...base, increase: true, loanAmount: 190_000_000, newLoanAmount: 220_000_000, rentalRegion: "서울" });
    expect(v.verdict).toBe("불허");
    expect(v.headline).toContain("한도 2억원을 넘어");
    expect(v.conditions.join(" ")).toContain("증액 없이");
  });
  it("개인 임대사업자라도 세대 2채 이상이면 주된 영업과 무관하게 다주택자(내부지침으로 빠지지 않음)", () => {
    const v = judge({ module: "M2", borrowerType: "individual_landlord", houseCount: 2, loanPurpose: "commercial", collateral: { region: "수도권", isApt: true }, maturityDate: "2026-12-20", asOf, kb: "v2" });
    expect(v.verdict).not.toBe("내부지침");
    expect(v.trace.some((t) => t.result.includes("무관하게 다주택자"))).toBe(true);
  });
  it("주택 수를 모르는 개인 임대사업자는 여전히 주된 영업 판단(내부지침, 예시 B15)", () => {
    expect(judge({ module: "M2", borrowerType: "individual_landlord", asOf, kb: "v2" }).verdict).toBe("내부지침");
  });
  it("회피 시도: 판정 코드는 실제 사실로, 결론 앞에 '바뀌지 않는다', 지침 제7조 1항", () => {
    const v = judge({ module: "M2", houseCount: 2, collateral: { region: "수도권", isApt: true }, maturityDate: "2026-12-20", avoidanceAsked: true, asOf, kb: "v2" });
    const plain = judge({ module: "M2", houseCount: 2, collateral: { region: "수도권", isApt: true }, maturityDate: "2026-12-20", asOf, kb: "v2" });
    expect(v.verdict).toBe(plain.verdict);
    expect(v.headline).toMatch(/^제안한 방법/);
    expect(v.conditions[0]).toContain("제7조 1항");
  });
});

describe("같은 고객 건의 두 규제(M1+M2)", () => {
  it("alsoModule이 있으면 두 모듈 Case를 모두 만들고, 지역 '수도권'을 그대로 받는다", async () => {
    const { normalize } = await import("@/lib/extract/normalize");
    const m1 = { action: "new", houses: [], houseCount: 2, everLived: false };
    const m2 = { houses: [], houseCount: 2, collateral: { region: "수도권", isApt: true }, maturityDate: "2027-01-20", tenant: { mentioned: false }, registeredRental: { mentioned: false } };
    const n = normalize({ module: "M2", alsoModule: "M1", topic: null, m1, m2, assumptions: [] } as never);
    expect(n.case?.module).toBe("M2");
    expect(n.also?.module).toBe("M1");
    expect(judge({ ...n.case!, kb: "v2" }).verdict).toBe("불허"); // 다주택자 수도권 APT, 예외 없음
    expect(judge({ ...n.also!, kb: "v2" }).verdict).toBe("불허"); // 부부합산 2주택 → 기존 다주택자 전세보증 제한
  });
});

describe("후속 임차인 신규계약(F401-06)·전제보다 사실 우선", () => {
  const m2 = { module: "M2" as const, houseCount: 2, collateral: { region: "수도권", isApt: true }, maturityDate: "2026-05-10", asOf, kb: "v2" as const };
  it("4.1까지 정식 체결 → 신규계약 종료일까지", () => {
    const v = judge({ ...m2, tenant: { contractValidAt0401: true, originalEnd: "2026-05-31", successor: { signedDate: "2026-03-28", end: "2028-05-31" } } });
    expect(v.headline).toContain("28.5.31");
  });
  it("4.1까지는 가계약, 4.2 정식 → 기존 계약 종료일(26.5.31)까지만, 가계약 때문에 전부 불인정하지 않음", () => {
    const v = judge({ ...m2, tenant: { contractValidAt0401: true, originalEnd: "2026-05-31", successor: { signedDate: "2026-04-02", end: "2028-05-31", provisional: true } } });
    expect(v.verdict).not.toBe("불허");
    expect(v.headline).toContain("26.5.31");
  });
  it("'비거주 1주택자' 전제여도 가족 임대 사실이 있으면 대상 아님", () => {
    expect(judge({ ...base, targetAsserted: true, leasedOut: true, tenantIsFamily: true }).verdict).toBe("허용");
  });
  it("경계 금액은 반올림하지 않는다(200,000,001원)", () => {
    const v = judge({ module: "M1", action: "new", houses: [{ region: "비수도권", regulated: false }], houseCount: 1, newLoanAmount: 200_000_001, rentalRegion: "서울", asOf, kb: "v2" });
    expect(v.headline).toContain("200,000,001원");
  });
});

describe("규칙 밖 사실은 바꿀 판정 부분을 대야 남는다", () => {
  it("'판정과 무관'·이유 없음은 버리고 경고로 남긴다, 주택 수 영향은 남긴다", async () => {
    const { normalize } = await import("@/lib/extract/normalize");
    const n = normalize({
      module: "M2", topic: null, m1: {} as never,
      m2: { houses: [], houseCount: 2, collateral: { region: "수도권", isApt: true }, tenant: { mentioned: false }, registeredRental: { mentioned: false } } as never,
      unmodeledFacts: [
        { fact: "DSR 37%", changes: "판정과 무관", how: "" },
        { fact: "분양권 1개", changes: "주택 수", how: "분양권을 주택 수에 넣으면 3주택" },
        { fact: "희망 처리일 12.15", changes: "적용 시점·경과조치", how: "" },
      ],
      assumptions: [],
    } as never);
    expect((n.case as { unmodeled?: string[] }).unmodeled).toEqual(["분양권 1개"]);
    expect(n.warnings.join(" ")).toContain("DSR 37%");
  });
});

describe("1주택자 전세대출 DSR을 판정에 반영(F828-11)", () => {
  const c = { module: "M1" as const, action: "new" as const, houses: [{ region: "비수도권", isApt: true, regulated: false }], houseCount: 1, leasedOut: true, everLived: false, newLoanAmount: 200_000_000, rentalRegion: "수도권", asOf, kb: "v2" as const };
  it("8.13 비대상이어도 DSR 44% > 은행권 40% → 불허", () => {
    const v = judge({ ...c, dsrRatio: 44 });
    expect(v.verdict).toBe("불허");
    expect(v.headline).toContain("DSR 44%");
    expect(v.facts).toContain("F828-11");
  });
  it("DSR 39%면 판정 유지 + 기준 이내 표시", () => {
    const v = judge({ ...c, dsrRatio: 39 });
    expect(v.verdict).toBe("허용");
    expect(v.conditions.join(" ")).toContain("이내");
  });
  it("비은행권은 50%", () => {
    expect(judge({ ...c, dsrRatio: 44, lenderSector: "nonbank" }).verdict).toBe("허용");
  });
  it("비은행권 카드의 설명·조건에 은행권 40%가 섞이지 않는다(판정 줄과 같은 기준)", () => {
    for (const x of [{ dsrRatio: 44 }, {}, { dsrRatio: 55 }]) {
      const v = judge({ ...c, ...x, lenderSector: "nonbank" });
      const all = [v.headline, ...v.conditions, ...(v.basis ?? []).map((b) => b.text)].join(" ");
      expect(all).not.toContain("은행권 40%");
      expect(all).toContain("비은행권 50%");
    }
  });
  it("은행이거나 업권을 모르면(은행 지점용) 판정·설명 모두 은행권 40%", () => {
    for (const x of [{ lenderSector: "bank" as const }, {}]) {
      const b = judge({ ...c, ...x, dsrRatio: 39 });
      const all = [...b.conditions, ...(b.basis ?? []).map((y) => y.text)].join(" ");
      expect(all).toContain("은행권 40%");
      expect(all).not.toContain("비은행권");
    }
  });
  it("같은 집 무증액 연장은 DSR 미적용(F828-12)", () => {
    expect(judge({ ...c, action: "renewal", increase: false, dsrRatio: 60 }).verdict).not.toBe("불허");
  });
});

it("4.1까지 체결한 후속 계약의 종료일을 모르면 기존 종료일로 넘기지 않고 묻는다", () => {
  const v = judge({ module: "M2", houseCount: 2, collateral: { region: "수도권", isApt: true }, maturityDate: "2026-12-07", tenant: { contractValidAt0401: true, originalEnd: "2027-02-28", successor: { signedDate: "2026-03-30" } }, asOf: "2026-11-21", kb: "v2" });
  expect(v.verdict).toBe("역질문");
  expect(v.questions.join(" ")).toContain("종료일");
});

it("보증비율은 전셋집 소재지로 안내(보유 주택이 지방이어도 전셋집이 수도권이면 70%)", () => {
  const v = judge({ module: "M1", action: "new", houses: [{ region: "비수도권", isApt: true, regulated: false }], houseCount: 1, rentalRegion: "서울", asOf: "2026-11-21", kb: "v2" });
  expect(v.conditions.join(" ")).toContain("70%(전셋집이 수도권·규제지역)");
  expect(v.conditions.join(" ")).not.toContain("80% 적용");
});

describe("유주택자 한도 2억원은 무증액 연장에도 적용(F828-09·10) — 종전 한도는 같은 집·최초 계약 '25.9.7 이전만", () => {
  it("같은 집 무증액 연장, 연장 금액 2억원 초과, 최초 계약 '25.9.7 이후 → 그대로는 불허", () => {
    const v = judge({ ...base, increase: false, sameHome: true, firstLeaseBy0907: false, loanAmount: 216_000_000, rentalRegion: "수도권" });
    expect(v.verdict).toBe("불허");
    expect(v.headline).toContain("연장 금액");
    expect(v.headline).toContain("종전 한도 유지 대상 아님");
    expect(v.facts).toEqual(expect.arrayContaining(["F828-09", "F828-10"]));
  });
  it("같은 집 무증액 연장, 연장 금액 2억원 초과, 최초 계약 '25.9.7 이전 → 종전 한도(막지 않음)", () => {
    const v = judge({ ...base, increase: false, sameHome: true, firstLeaseBy0907: true, loanAmount: 216_000_000, rentalRegion: "수도권" });
    expect(v.verdict).not.toBe("불허");
  });
  it("최초 계약일을 모르면 막지 않고 묻는다", () => {
    const v = judge({ ...base, increase: false, sameHome: true, loanAmount: 216_000_000, rentalRegion: "수도권" });
    expect(v.verdict).not.toBe("불허");
    expect(v.questions.join(" ")).toContain("2025.9.7");
  });
  it("연장 금액이 2억원 이하면 한도와 무관", () => {
    const v = judge({ ...base, increase: false, sameHome: true, firstLeaseBy0907: false, loanAmount: 200_000_000, rentalRegion: "수도권" });
    expect(v.verdict).toBe("조건부");
  });
});
