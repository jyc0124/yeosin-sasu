// 규제별 주택 수 범위(lib/rules/scope.ts, data/kb/house_scopes.json)
// 특정 문항이 아니라 무작위 가족 구성 수천 건으로 '범위의 성질'을 검사한다.
import { describe, expect, it } from "vitest";
import kb from "@/data/kb/facts.json";
import { countFor, SCOPES, type ScopeReg } from "@/lib/rules/scope";
import { judge } from "@/lib/rules";
import type { House, M1Case, M2Case, Owner } from "@/lib/rules/types";

const ids = new Set([...(kb.facts as { id: string }[]).map((f) => f.id), ...(kb.gaps as { id: string }[]).map((g) => g.id)]);
const ctx = { kb: "v2" as const, asOf: "2026-11-21" };

// 결정적 의사난수(시드 고정)
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];

const OWNERS: (Owner | undefined)[] = [undefined, "self", "spouse", "joint", "household"];
function randomHouse(r: () => number, owners = OWNERS): House {
  const h: House = { region: pick(r, ["서울", "경기", "부산", "강원"] as const), isApt: r() < 0.7, owner: pick(r, owners) };
  if (r() < 0.2) h.tags = ["inheritance"];
  return h;
}
function randomM1(r: () => number): M1Case {
  const houses = Array.from({ length: Math.floor(r() * 4) }, () => randomHouse(r));
  return { module: "M1", asOf: "2026-11-21", kb: "v2", houses: houses.length ? houses : undefined, otherHouseholdHouses: r() < 0.3 ? 1 + Math.floor(r() * 2) : undefined };
}
const n = (c: M1Case | M2Case, reg: ScopeReg) => countFor(c, reg, ctx).count;

describe("규제별 주택 수 범위 — 표", () => {
  it("범위 표의 근거 Fact·공백이 판정 근거 자료에 있다", () => {
    for (const s of Object.values(SCOPES)) for (const id of [...s.facts, ...(s.gaps ?? [])]) expect(ids.has(id), id).toBe(true);
  });
  it("8.13=부부합산·예외 적용, 한도 2억=부부(예외 없음), DSR=세대(예외 없음), 4.1=세대·예외 적용", () => {
    expect([SCOPES.R813.scope, SCOPES.R813.exceptions]).toEqual(["couple", true]);
    expect([SCOPES.R907.scope, SCOPES.R907.exceptions]).toEqual(["couple", false]);
    expect([SCOPES.RDSR.scope, SCOPES.RDSR.exceptions]).toEqual(["household", false]);
    expect([SCOPES.R401.scope, SCOPES.R401.exceptions]).toEqual(["household", true]);
  });
});

describe("규제별 주택 수 범위 — 무작위 가족 구성 3000건의 성질", () => {
  const r = rng(20261122);
  const cases = Array.from({ length: 3000 }, () => randomM1(r));
  it("세대 기준 ≥ 부부합산(예외 없음) ≥ 부부합산(예외 적용)", () => {
    for (const c of cases) {
      const [a, b, d] = [n(c, "R813"), n(c, "R907"), n(c, "RDSR")];
      if (a !== undefined && b !== undefined) expect(b).toBeGreaterThanOrEqual(a);
      if (b !== undefined && d !== undefined) expect(d).toBeGreaterThanOrEqual(b);
    }
  });
  it("같은 세대 가족 명의 주택을 더하면 세대 기준만 1 늘고, 부부합산은 그대로", () => {
    for (const c of cases) {
      const more: M1Case = { ...c, houses: [...(c.houses ?? []), { region: "서울", isApt: true, owner: "household" }] };
      expect(n(more, "R813")).toBe(n(c, "R813"));
      expect(n(more, "R907")).toBe(n(c, "R907"));
      const d = n(c, "RDSR");
      if (d !== undefined) expect(n(more, "RDSR")).toBe(d + 1);
    }
  });
  it("본인·배우자 주택의 산정 예외(상속)는 8.13 주택 수만 줄이고 한도·DSR 주택 수는 그대로", () => {
    for (const c of cases) {
      const base: M1Case = { ...c, houses: [...(c.houses ?? []), { region: "서울", isApt: true, owner: "self" }] };
      const inh: M1Case = { ...c, houses: [...(c.houses ?? []), { region: "서울", isApt: true, owner: "self", tags: ["inheritance"] }] };
      expect(n(inh, "R813")).toBe((n(base, "R813") ?? 0) - 1);
      expect(n(inh, "R907")).toBe(n(base, "R907"));
      expect(n(inh, "RDSR")).toBe(n(base, "RDSR"));
    }
  });
  it("범위를 붙여 말한 수는 그 범위에만 쓴다", () => {
    for (const c of cases.slice(0, 500)) {
      const k = Math.floor(r() * 3);
      const claimed: M1Case = { ...c, countClaims: [{ scope: "household", count: k }] };
      expect(n(claimed, "RDSR")).toBe(k);
      if (n(c, "R907") !== undefined) expect(n(claimed, "R907")).toBe(n(c, "R907"));
      if (n(c, "R907") === undefined && k === 0) expect(n(claimed, "R907")).toBe(0);
    }
  });
  it("가족 명의 주택만 있고 본인·배우자 주택을 모르면 부부합산은 0이 아니라 '모름'", () => {
    const c: M1Case = { module: "M1", houses: [{ region: "서울", isApt: true, owner: "household" }] };
    expect(n(c, "R813")).toBeUndefined();
    expect(n(c, "RDSR")).toBeUndefined();
  });
});

describe("4.1(세대 기준) — 무작위 세대 구성", () => {
  const r = rng(7);
  it("세대 분리 가족 명의 주택은 세지 않고, 같은 세대 가족 명의는 센다", () => {
    for (let i = 0; i < 2000; i++) {
      const houses = Array.from({ length: 1 + Math.floor(r() * 3) }, () => randomHouse(r, [undefined, "self", "spouse", "household"]));
      const c: M2Case = { module: "M2", houses };
      const base = n(c, "R401")!;
      expect(n({ ...c, houses: [...houses, { region: "서울", isApt: true, owner: "separated" }] }, "R401")).toBe(base);
      expect(n({ ...c, houses: [...houses, { region: "서울", isApt: true, owner: "household" }] }, "R401")).toBe(base + 1);
    }
  });
});

describe("판정에 반영", () => {
  const dsrCase = (extra: Partial<M1Case>): M1Case => ({
    module: "M1", kb: "v2", asOf: "2026-11-21", action: "new", applicationDate: "2027-02-01",
    houses: [{ region: "서울", isApt: true, owner: "self" }], leasedOut: true, everLived: true,
    rentalRegion: "서울", newLoanAmount: 150_000_000, dsrRatio: 45, ...extra,
  });
  it("세대 1주택이면 1주택자 DSR(은행권 40%) 초과로 불허", () => {
    expect(judge(dsrCase({})).verdict).toBe("불허");
  });
  it("본인 1채 + 같은 세대 부모 1채: 부모는 세대원(F401-20)이라 세대 2채 → 1주택자 DSR 대상 아님, 세대원 관계 확인을 카드에 표시", () => {
    const v = judge(dsrCase({ otherHouseholdHouses: 1 }));
    expect(v.verdict).not.toBe("보류");
    expect(v.conditions.join(" ")).toContain("세대 기준");
    expect(v.conditions.join(" ")).toContain("은행업감독규정 <별표6>");
    expect((v.basis ?? []).map((b) => b.label).join(" ")).toContain("1주택자 전세대출 DSR");
    expect(v.facts).toContain("F401-20");
    expect(v.gaps).not.toContain("G-13");
  });
  it("'DSR상 세대 1주택'이라고 말하면 부부합산을 다시 묻지 않고 그 범위로 판단", () => {
    const v = judge(dsrCase({ houses: undefined, countClaims: [{ scope: "household", count: 1 }], targetAsserted: true }));
    expect(v.verdict).toBe("불허");
    expect(v.questions.join(" ")).not.toContain("부부합산");
  });
  it("4.1: 세대 분리한 자녀 명의 주택은 세지 않아 1주택 → 제한 대상 아님", () => {
    const v = judge({ module: "M2", kb: "v2", asOf: "2026-11-21", borrowerType: "individual", houses: [{ region: "서울", isApt: true, owner: "self" }, { region: "경기", isApt: true, owner: "separated" }], collateral: { region: "서울", isApt: true }, maturityDate: "2026-12-20" });
    expect(v.verdict).toBe("허용");
    expect((v.basis ?? []).map((b) => b.text).join(" ")).toContain("세대 분리");
  });
});

describe("규제 합성·경과조치·담보 주택 예외(11/22 일반 규칙)", () => {
  const asOf = "2026-11-21";
  const m1 = (x: Partial<M1Case>): M1Case => ({ module: "M1", kb: "v2", asOf, ...x });
  it("8.13 쪽 사실을 몰라도(역질문) DSR이 확정 초과면 신청 그대로는 불허, 8.13 확인 항목은 참고로", () => {
    const v = judge(m1({ action: "new", applicationDate: "2027-03-02", rentalRegion: "서울", dsrRatio: 41, countClaims: [{ scope: "household", count: 1 }] }));
    expect(v.verdict).toBe("불허");
    expect(v.questions.every((q) => q.startsWith("(참고)"))).toBe(true);
  });
  it("한도 2억원 초과도 같은 원칙: 8.13 심사위 사유가 있어도 신청 금액 그대로는 불허", () => {
    const v = judge(m1({ action: "new", applicationDate: "2027-03-02", targetAsserted: true, exception: "other_inevitable", rentalRegion: "경기", newLoanAmount: 230_000_000 }));
    expect(v.verdict).toBe("불허");
    expect(v.conditions.join(" ")).toContain("심사위");
  });
  it("신규 경과조치: 기준일까지 전산 접수를 마쳤으면 다른 날짜가 늦어도 종전 한도", () => {
    const v = judge(m1({ action: "new", houses: [{ region: "서울", isApt: true, owner: "self" }], everLived: true, rentalRegion: "서울", newLoanAmount: 230_000_000, intakeDate: "2025-09-05", leaseDepositDate: "2025-09-09" }));
    expect(v.verdict).not.toBe("불허");
    expect(v.conditions.join(" ")).toContain("경과조치");
  });
  it("정책 목적 전세대출이면 DSR 미적용, 일반 상품이라고 하면 적용", () => {
    const b = { action: "new" as const, applicationDate: "2027-03-02", houses: [{ region: "서울", isApt: true, owner: "self" as const }], everLived: true, rentalRegion: "서울", dsrRatio: 45 };
    expect(judge(m1({ ...b, policyLoan: true })).verdict).not.toBe("불허");
    expect(judge(m1({ ...b, policyLoan: false })).verdict).toBe("불허");
  });
  it("대상자·예외 없음이 확인된 증액 연장은 묻는 그대로 불허, '증액 없이 연장'은 대안", () => {
    const v = judge(m1({ action: "renewal", targetAsserted: true, exception: "none", increase: true, maturityDate: "2026-12-20", loanAmount: 100_000_000, newLoanAmount: 120_000_000 }));
    expect(v.verdict).toBe("불허");
    expect(v.conditions.join(" ")).toContain("증액 없이");
  });
  it("범위 붙은 수('부부 1주택')라도 그 집이 산정 예외(상속)면 8.13 주택 수는 0", () => {
    const c = m1({ action: "renewal", maturityDate: "2027-03-01", houses: [{ region: "서울", isApt: true, tags: ["inheritance"] }], countClaims: [{ scope: "couple", count: 1 }] });
    expect(n(c, "R813")).toBe(0);
    expect(n(c, "R907")).toBe(1);
  });
  it("'유주택자'(1채 이상)는 한도 2억원에는 쓰고, 정확히 1채인지 보는 규제에는 모름", () => {
    const c = m1({ countClaims: [{ scope: "couple", count: 1, atLeast: true }] });
    expect(n(c, "R907")).toBe(1);
    expect(n(c, "R813")).toBeUndefined();
  });
  it("4.1: 담보 주택 자체가 예외 주택(상속)이면 세대 주택 수와 관계없이 그 담보 대출은 제한 대상 아님", () => {
    const v = judge({ module: "M2", kb: "v2", asOf, houseCount: 3, collateral: { region: "서울", isApt: true, tags: ["inheritance"] }, maturityDate: "2026-12-20" });
    expect(v.verdict).toBe("허용");
    expect(v.trace.some((t) => t.step.startsWith("T1 담보 주택 예외"))).toBe(true);
  });
  it("4.1: 담보가 증여 취득이면 예외 아님(주택 수대로 판단)", () => {
    const v = judge({ module: "M2", kb: "v2", asOf, houseCount: 3, collateral: { region: "서울", isApt: true, tags: ["gift"] }, maturityDate: "2026-12-20" });
    expect(v.verdict).toBe("불허");
  });
  it("8.13: '26.12.31까지 신규 신청(또는 전산 접수)이면 임대·실거주(대상 요건)를 묻지 않고 종전 규정", () => {
    const v = judge(m1({ action: "new", applicationDate: "2026-12-10", houses: [{ region: "서울", isApt: true, owner: "self" }] }));
    expect(v.verdict).toBe("조건부");
    expect(v.questions.join(" ")).not.toMatch(/임대|실거주/);
  });
  it("전 배우자 등 '그 밖의 사람' 명의 주택은 어느 범위에도 세지 않는다", () => {
    const c = m1({ houses: [{ region: "서울", isApt: true, owner: "other" }, { region: "서울", isApt: true, owner: "self" }] });
    expect(n(c, "R813")).toBe(1);
    expect(n(c, "RDSR")).toBe(1);
  });
  it("실거주했다는데 증빙이 정해지지 않은 서류뿐이면 보류(인정 기준 G-01)", () => {
    const v = judge(m1({ action: "new", applicationDate: "2027-02-01", houses: [{ region: "서울", isApt: true, owner: "self" }], leasedOut: true, tenantIsFamily: false, livedEvidence: "unverified_docs" }));
    expect(v.verdict).toBe("보류");
    expect(v.gaps).toContain("G-01");
  });
  it("세대 범위 두 해석의 결론이 같으면 확정: 부부 무주택 + 같은 세대 조모 3채 → 넣든(3) 빼든(0) 1주택자 아님", () => {
    const fam = { region: "경기", isApt: false, owner: "household" as const };
    const v = judge(m1({ action: "new", applicationDate: "2027-02-01", houses: [fam, fam, fam], houseCount: 0, rentalRegion: "서울", newLoanAmount: 150_000_000, dsrRatio: 45 }));
    expect(v.verdict).not.toBe("보류");
    expect(v.conditions.join(" ")).toContain("넣든");
  });
  it("4.1: 같은 세대 자녀(세대원) 명의 주택을 넣어 2채 → 다주택자(F401-20), 관계 확인 서류 표시", () => {
    const v = judge({ module: "M2", kb: "v2", asOf, houses: [{ region: "서울", isApt: true, owner: "self" }, { region: "경기", isApt: true, owner: "household" }], collateral: { region: "서울", isApt: true }, maturityDate: "2026-12-20" });
    expect(v.verdict).toBe("불허");
    expect(v.facts).toContain("F401-20");
    expect(v.conditions.join(" ")).toContain("주민등록등본");
    expect(v.documents.join(" ")).toContain("주민등록등본");
  });
  it("4.1: 같은 세대 가족 주택을 빼도 2채 이상이면 확정(다주택자)", () => {
    const v = judge({ module: "M2", kb: "v2", asOf, houses: [{ region: "서울", isApt: true, owner: "self" }, { region: "부산", isApt: true, owner: "spouse" }, { region: "경기", isApt: true, owner: "household" }], collateral: { region: "서울", isApt: true }, maturityDate: "2026-12-20" });
    expect(v.verdict).toBe("불허");
  });
  it("4.1: 보유 목록에서 담보로 표시한 주택(isCollateral)이 예외 주택(인구감소지역·기준시가 이하)이면 담보 대출은 제한 제외", () => {
    const v = judge({ module: "M2", kb: "v2", asOf, houseCount: 3, houses: [{ region: "강원", sigungu: "평창군", isApt: true, baseValueAtAcq: 300_000_000, isCollateral: true }], collateral: { region: "강원", isApt: true, regulated: true }, maturityDate: "2026-12-20" });
    expect(v.verdict).toBe("허용");
    expect(v.trace.some((t) => t.step.startsWith("T1 담보 주택 예외"))).toBe(true);
  });
  it("4.1: 담보가 아닌 다른 보유 주택의 예외는 담보 대출을 제외하지 않는다(주택 수에서만 빠짐)", () => {
    const v = judge({ module: "M2", kb: "v2", asOf, houseCount: 3, houses: [{ region: "강원", sigungu: "평창군", isApt: true, baseValueAtAcq: 300_000_000 }], collateral: { region: "서울", isApt: true }, maturityDate: "2026-12-20" });
    expect(v.verdict).toBe("불허");
  });
  it("4.1 등록임대 의무임대기간 종료 후(401FAQ Ⅲ-9): 4개월 이내 종료 계약의 갱신청구권 → 갱신계약 종료일까지", () => {
    const v = judge({ module: "M2", kb: "v2", asOf, houseCount: 3, borrowerType: "individual", collateral: { region: "서울", isApt: true }, maturityDate: "2026-12-10", registeredRental: { mandatoryEnd: "2026-07-31" }, tenant: { contractValidAt0401: true, originalEnd: "2026-10-15", renewal: "claim", renewedEnd: "2028-10-15" } });
    expect(["허용", "조건부"]).toContain(v.verdict); // 1년 주기 연장·재심사(401FAQ Ⅲ-8)면 조건부
    expect(v.headline).toContain("28.10.15");
  });
  it("의무임대기간 종료 후: 종료일이 4개월 넘게 남은 계약의 갱신청구권은 기존 계약 종료일까지만", async () => {
    const { afterMandatory } = await import("@/lib/rules/m2_renewal");
    const r = afterMandatory({ originalEnd: "2027-03-01", renewal: "claim", renewedEnd: "2029-03-01" }, "2026-07-31");
    expect(r.end).toBe("2027-03-01");
  });
  it("의무임대기간 종료 후: '26.4.17 이후 묵시적 갱신은 기존 계약 종료일까지만, 4.16까지면 갱신계약 종료일", async () => {
    const { afterMandatory } = await import("@/lib/rules/m2_renewal");
    expect(afterMandatory({ originalEnd: "2026-06-01", renewal: "implicit", renewalDate: "2026-05-01", renewedEnd: "2028-06-01" }, "2026-04-01").end).toBe("2026-06-01");
    expect(afterMandatory({ originalEnd: "2026-06-01", renewal: "implicit", renewalDate: "2026-04-10", renewedEnd: "2028-06-01" }, "2026-04-01").end).toBe("2028-06-01");
  });
  it("의무임대기간 종료일 전에 맺은 계약이 그날을 덮으면 그 계약이 기준 계약(종료일까지), 그날 뒤에 맺은 계약은 아님", async () => {
    const { afterMandatory } = await import("@/lib/rules/m2_renewal");
    expect(afterMandatory({ contractValidAt0401: false, renewalDate: "2026-04-02", renewedEnd: "2028-04-01" }, "2026-11-21").end).toBe("2028-04-01");
    expect(afterMandatory({ originalEnd: "2026-05-01", renewalDate: "2026-04-20", renewedEnd: "2028-04-30" }, "2026-11-21").end).toBe("2028-04-30");
    // 기준일 뒤에 맺은 계약만 있으면 기준 계약을 모른다 → 묻는다
    expect(afterMandatory({ renewalDate: "2026-12-01", renewedEnd: "2028-11-30" }, "2026-11-21").ask).toBeTruthy();
  });
  it("안전장치: 주택 수 없이 보유 목록에 담보 주택만 있으면 1주택으로 보지 않는다(잘못된 허용 방지 — 11/22 회귀 A12)", () => {
    const v = judge({ module: "M2", kb: "v2", asOf, houses: [{ region: "서울", isApt: true, isCollateral: true }], collateral: { region: "서울", isApt: true }, loanPurpose: "commercial" });
    expect(v.verdict).not.toBe("허용");
    const w = judge({ module: "M2", kb: "v2", asOf, houses: [{ region: "서울", isApt: true, isCollateral: true }], collateral: { region: "서울", isApt: true }, maturityDate: "2026-12-20" });
    expect(w.verdict).not.toBe("허용");
  });
});

describe("갈림길 답(역질문일 때 값마다 규칙 엔진 결론)", () => {
  it("임대 여부만 모르면 '세를 주지 않음 → 허용 / 세를 줌 → 불허'를 함께 보여 주고 판정 코드는 역질문 그대로", () => {
    const v = judge({ module: "M1", kb: "v2", asOf: "2026-11-21", action: "renewal", maturityDate: "2027-03-10", houses: [{ region: "서울", isApt: true }], houseCount: 1, everLived: false });
    expect(v.verdict).toBe("역질문");
    expect(v.branches?.on).toContain("세 줬는지");
    expect(v.branches?.options.map((o) => o.verdict)).toEqual(["허용", "불허"]);
  });
  it("확정 판정에는 갈림길이 없다", () => {
    const v = judge({ module: "M2", kb: "v2", asOf: "2026-11-21", houseCount: 3, collateral: { region: "서울", isApt: true }, maturityDate: "2026-12-20" });
    expect(v.branches).toBeUndefined();
  });
});

describe("주택보유 확인 동의 거부(F828-08)", () => {
  it("예외 사유(신뢰보호)를 주장해도 동의서 제출을 거부하면 불허", () => {
    const v = judge({ module: "M2", kb: "v2", asOf: "2026-11-21", houseCount: 2, collateral: { region: "서울", isApt: true }, maturityDate: "2026-12-13", notifiedBy0401: true, notifiedProof: "record", consentRefused: true });
    expect(v.verdict).toBe("불허");
    expect(v.facts).toContain("F828-08");
  });
  it("토지거래허가 신청 접수(허가 전) 매도계약으로 1주택이 되면 조건부(추후 허가 검증)", () => {
    const v = judge({ module: "M2", kb: "v2", asOf: "2026-11-21", houses: [{ label: "지방 주택", region: "경북", tags: ["landPermitPending"] }], countClaims: [{ scope: "household", count: 2 }], collateral: { region: "서울", isApt: true }, maturityDate: "2026-12-13" });
    expect(v.verdict).toBe("조건부");
    expect(v.headline + v.conditions.join(" ")).toContain("허가");
  });
  it("공익 목적 예외는 통상 1년 주기 연장·재심사 → 조건부", () => {
    const v = judge({ module: "M2", kb: "v2", asOf: "2026-11-21", borrowerType: "corporate_landlord", landlordMainBusiness: "rental", houseCount: 4, collateral: { region: "서울", isApt: true }, maturityDate: "2026-12-24", publicInterest: true });
    expect(v.verdict).toBe("조건부");
    expect(v.facts).toContain("F401-13");
  });
});

describe("질문의 '세대 N주택'이 세대원이 아닌 가족 명의 주택까지 센 수면 목록으로 다시 센다(F401-20)", () => {
  const hh: M1Case = { module: "M1", action: "new", applicationDate: "2027-08-13", houses: [{ label: "손자", owner: "household" }, { label: "친동생", owner: "other" }], houseCount: 0, countClaims: [{ scope: "household", count: 2 }], rentalRegion: "수도권", newLoanAmount: 173_000_000, dsrRatio: 43.6, lenderSector: "bank", asOf: "2026-11-21", kb: "v2" };
  it("세대 2주택이라 했지만 1채는 형제자매 명의 → 세대 1주택, DSR 40% 초과 불허", () => {
    const sc = countFor(hh, "RDSR", ctx);
    expect(sc.count).toBe(1);
    expect(sc.parts).toContain("질문은 세대 기준 2채");
    expect(judge(hh).verdict).toBe("불허");
  });
  it("질문의 수가 목록보다 많으면(목록에 없는 주택이 있을 수 있음) 질문의 수를 그대로 쓴다", () => {
    expect(n({ ...hh, countClaims: [{ scope: "household", count: 3 }] }, "RDSR")).toBe(3);
  });
  it("목록이 모두 세대원 명의면 질문의 수를 그대로 쓴다", () => {
    expect(n({ ...hh, houses: [{ owner: "household" }, { owner: "household" }] }, "RDSR")).toBe(2);
  });
  it("부부합산 수에는 적용하지 않는다(명의 추출 오류 위험)", () => {
    const c: M1Case = { ...hh, houses: [{ owner: "self" }, { owner: "other" }], houseCount: undefined, countClaims: [{ scope: "couple", count: 2 }] };
    expect(n(c, "R813")).toBe(2);
  });
});
