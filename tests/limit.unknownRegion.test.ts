// 한도 2억원 초과 금액인데 전셋집 소재지를 모르면, 가능 쪽 결론(허용·조건부)을 확정하지 않는다(답 하나로 불가가 될 수 있음, 11/23 실측 확인).
import { describe, expect, it } from "vitest";
import { judge } from "@/lib/rules";

const c = { module: "M1", kb: "v2", asOf: "2026-11-23", increase: true, maturityDate: "2027-02-10", houses: [{ label: "서울 송파구 아파트", region: "서울", sigungu: "송파구", isApt: true }], houseCount: 1, leasedOut: true, tenantIsFamily: false, everLived: true, loanAmount: 200_000_000, newLoanAmount: 230_000_000, sameHome: true, refinance: true } as const;

describe("한도 2억원 × 전셋집 소재지 미확인", () => {
  it("소재지를 모르면 고객 확인 필요(가능으로 두지 않음)", () => {
    const v = judge(c as never);
    expect(v.verdict).toBe("역질문");
    expect(v.headline).toContain("한도 2억원을 넘어 그대로는 취급할 수 없습니다");
    expect(v.questions.some((q) => q.includes("전셋집의 소재지"))).toBe(true);
  });
  it("서울이면 불가, 지방 비규제면 원래 결론", () => {
    expect(judge({ ...c, rentalRegion: "서울" } as never).verdict).toBe("불허");
    expect(judge({ ...c, rentalRegion: "전남" } as never).verdict).toBe("허용");
  });
});
