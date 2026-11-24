// 4.1 이전 통보(신뢰보호): 통보한 연장 기한은 조건 추출에 담을 칸이 없으므로 고객에게 묻지 않는다(묻고 못 쓰는 질문 방지, 11/23 화면 점검).
import { describe, expect, it } from "vitest";
import { judge } from "@/lib/rules";

describe("통보한 연장 기한은 묻지 않는다", () => {
  it("만기일을 모르면 만기일만 묻고, 통보 기한은 확인 조건으로", () => {
    const v = judge({ module: "M2", kb: "v2", asOf: "2026-11-23", houseCount: 2, collateral: { region: "서울", isApt: true }, notifiedBy0401: true, notifiedProof: "record" });
    expect(v.questions.some((q) => q.includes("통보한 연장 기한"))).toBe(false);
    expect(v.questions).toContain("대출 약정서상 만기일은 언제인가요?");
    expect(v.conditions.some((c) => c.includes("통보 기록") && c.includes("통보한 연장 기한"))).toBe(true);
  });
  it("자진말소 예정일은 추출 칸이 있어 그대로 묻는다", () => {
    const v = judge({ module: "M2", kb: "v2", asOf: "2026-11-23", houseCount: 2, collateral: { region: "서울", isApt: true }, registeredRental: { mentioned: true, voluntaryCancel: true } } as never);
    expect(v.questions.some((q) => q.startsWith("자진말소 예정일과 대출 약정서상 만기일"))).toBe(true);
  });
});

describe("다주택 만기연장: '예외 사유 모두 없음' 답은 다시 묻지 않는다(결론은 불허 그대로)", () => {
  const base = { module: "M2", kb: "v2", asOf: "2026-11-23", houseCount: 2, collateral: { region: "서울", isApt: true }, maturityDate: "2027-03-15" } as const;
  it("확인 전에는 예외 사유를 묻는다", () => {
    const v = judge({ ...base } as never);
    expect(v.verdict).toBe("불허");
    expect(v.questions.some((q) => q.startsWith("만기연장 예외 사유"))).toBe(true);
  });
  it("모두 없다고 확인하면 같은 결론, 질문 없음", () => {
    const v = judge({ ...base, exceptionsNone: true } as never);
    expect(v.verdict).toBe("불허");
    expect(v.questions.some((q) => q.startsWith("만기연장 예외 사유"))).toBe(false);
  });
});

describe("임차인 예외가 인정되지 않고 다른 예외 사유도 없다고 답한 건", () => {
  it("같은 '다른 예외 사유' 질문을 다시 묻지 않는다", async () => {
    const { judge } = await import("@/lib/rules");
    const base = { module: "M2", houseCount: 2, houseCountIsMinimum: true, collateral: { region: "서울", sigungu: "양천구", isApt: true }, maturityDate: "2026-12-15", tenant: { contractValidAt0401: true, originalEnd: "2026-06-30", renewal: "agreed", renewalDate: "2026-05-10", renewedEnd: "2028-06-30" }, asOf: "2026-11-23", kb: "v2" } as never;
    const before = judge(base);
    expect(before.verdict).toBe("불허");
    expect(before.questions.some((q: string) => q.startsWith("다른 만기연장 예외 사유"))).toBe(true);
    const after = judge({ ...(base as object), exceptionsNone: true } as never);
    expect(after.verdict).toBe("불허");
    expect(after.questions.some((q: string) => q.startsWith("다른 만기연장 예외 사유"))).toBe(false);
    expect(after.headline).toMatch(/다른 예외 사유.*없어/);
  });
});
