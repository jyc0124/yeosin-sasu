// 해석 쟁점 Liner 사전 조사: 이력 표시와 실시간 조사 분류(Search API는 가짜 응답으로 대신한다)
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/liner", () => ({
  linerSearch: vi.fn(async () => [
    // 근거 자료 v2에 이미 있는 8.28 행정지도 원문
    {
      title: "주택담보대출에 대한 리스크 관리 기준",
      url: "https://better.fsc.go.kr/fsc_new/file/displayFile.do?filePath=/2026/08/28&orgFileName=260813_%EC%A3%BC%ED%83%9D%EB%8B%B4%EB%B3%B4%EB%8C%80%EC%B6%9C%EC%97%90%20%EB%8C%80%ED%95%9C%20%EB%A6%AC%EC%8A%A4%ED%81%AC%20%EA%B4%80%EB%A6%AC%20%EA%B8%B0%EC%A4%80%20%ED%96%89%EC%A0%95%EC%A7%80%EB%8F%84.pdf&sysFileName=9150b4d6f5564462ab5cf218254697e9.pdf",
      hostname: "better.fsc.go.kr",
      tier: 1,
    },
    // 4.1 보도자료(근거 자료에 있음)
    { title: "가계부채 관리방안", url: "https://www.fsc.go.kr/no010101/86606", hostname: "www.fsc.go.kr", tier: 1, date: "2026-04-01" },
    // 8.13 이후 새 공식 문서 후보
    { title: "가계부채 관리방안 추가 FAQ", url: "https://www.fsc.go.kr/no010101/88001", hostname: "www.fsc.go.kr", tier: 1, date: "2026-11-10" },
    // 공식 아님(제외)
    { title: "블로그", url: "https://blog.naver.com/x/1", hostname: "blog.naver.com", tier: 3 },
  ]),
  linerDomainSearch: vi.fn(),
}));

import { lastResearch, researchLine } from "@/lib/research/history";
import { researchGap } from "@/lib/research/live";
import { planExternal } from "@/lib/hq/external";
import { buildInquiry } from "@/lib/hq/inquiry";
import { judge, type M2Case } from "@/lib/rules";

describe("조사 이력", () => {
  it("G-10~13·G-09는 원문 대조까지 마친 11.19 조사 이력이 있다", () => {
    for (const id of ["G-09", "G-10", "G-11", "G-12", "G-13"]) expect(lastResearch(id)?.result).toBe("공식 근거 없음");
    expect(researchLine(lastResearch("G-10")!)).toMatch(/^Liner 사전 조사\(11\.19\): 공식 출처 \d+건 확인 · 공식 근거 없음$/);
    expect(lastResearch("G-01")).toBeUndefined();
  });
});

describe("실시간 조사", () => {
  it("공식 출처만 모아 새 문서 후보 / 근거 자료에 있음으로 나눈다", async () => {
    const r = await researchGap("G-10", "임차인 예외", { kb: "v2" });
    expect(r.sources).toBe(4); // 질의 2개가 같은 결과를 돌려줘도 중복 제거
    expect(r.official).toBe(3);
    expect(r.docs.map((d) => d.kind)).toEqual(["new", "known", "known"]);
    expect(r.docs[0].url).toContain("88001");
    expect(r.docs.some((d) => d.hostname === "blog.naver.com")).toBe(false);
  });
});

describe("외부기관 질의문", () => {
  it("조사 이력이 있는 쟁점은 'Liner로 먼저 확인했지만 기준이 없다'를 함께 싣는다", () => {
    const c: M2Case = { module: "M2", houseCount: 2, collateral: { region: "서울", isApt: true }, maturityDate: "2026-12-20", tenant: { contractValidAt0401: true, renewal: "implicit" }, asOf: "2026-11-19" };
    const card = { ...judge(c), factRefs: [], gapRefs: [] };
    const d = buildInquiry({ question: "q", followUps: [], asOf: "2026-11-19", case: c, caseRows: [], card });
    const plan = planExternal(d);
    expect(plan.targets.some((t) => t.gapIds.includes("G-11"))).toBe(true);
    expect(plan.text).toContain("Liner 사전 조사(11.19)");
  });
});
