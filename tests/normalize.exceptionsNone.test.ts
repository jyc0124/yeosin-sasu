// 정리 단계: '예외 사유 없음'은 네 가지가 모두 명시적으로 없을 때만 표시한다(하나라도 빈 값이면 표시하지 않음)
import { describe, expect, it } from "vitest";
import { normalize } from "@/lib/extract/normalize";

const m2 = (over: Record<string, unknown>) =>
  ({
    module: "M2",
    m2: { houses: [], houseCount: 2, houseCountIsMinimum: true, collateral: { region: "서울", isApt: true, tags: [] }, tenant: { mentioned: true, absent: true }, registeredRental: { mentioned: false }, legalObligation: false, notifiedBy0401: false, otherException: false, countClaims: [], ...over },
  }) as never;

describe("exceptionsNone", () => {
  it("네 가지 모두 없음 → 표시", () => {
    const n = normalize(m2({})) as unknown as { case?: Record<string, unknown> };
    expect(n.case?.exceptionsNone).toBe(true);
  });
  it("통보 여부가 빈 값이면 표시하지 않음", () => {
    const n = normalize(m2({ notifiedBy0401: null })) as unknown as { case?: Record<string, unknown> };
    expect(n.case?.exceptionsNone).toBeUndefined();
  });
  it("임차인 없음 표시가 없으면 표시하지 않음", () => {
    const n = normalize(m2({ tenant: { mentioned: false, absent: null } })) as unknown as { case?: Record<string, unknown> };
    expect(n.case?.exceptionsNone).toBeUndefined();
  });
  it("임차인 사정이 있고 다른 세 가지가 모두 없음 → 표시(다른 예외 사유 없음)", () => {
    const n = normalize(m2({ tenant: { mentioned: true, contractValidAt0401: true, originalEnd: "2026-06-30", renewal: "agreed", renewalDate: "2026-05-10", renewedEnd: "2028-06-30" } })) as unknown as { case?: Record<string, unknown> };
    expect(n.case?.tenant).toBeDefined();
    expect(n.case?.exceptionsNone).toBe(true);
  });
});
