// 여신심사위 상정 일정(가상 A은행 지침 제3조 4항): 둘째·넷째 주 수요일, 마감은 개최일 3영업일 전
import { describe, expect, it } from "vitest";
import { committeeDocs, committeeNotice, nextMeeting, subBusinessDays } from "@/lib/hq/committee";

describe("심사위 개최일", () => {
  it("2026년 11월 개최일은 11.11·11.25(둘째·넷째 수)", () => {
    expect(nextMeeting("2026-11-02")).toEqual({ meeting: "2026-11-11", deadline: "2026-11-06" });
    expect(nextMeeting("2026-11-07")).toEqual({ meeting: "2026-11-25", deadline: "2026-11-20" });
  });
  it("마감 당일 접수는 그 회차, 마감이 지나면 다음 회차", () => {
    expect(nextMeeting("2026-11-20").meeting).toBe("2026-11-25");
    expect(nextMeeting("2026-11-21").meeting).toBe("2026-12-09");
  });
  it("연말을 넘기면 다음 해 1월 회차", () => {
    expect(nextMeeting("2026-12-21")).toEqual({ meeting: "2027-01-13", deadline: "2027-01-08" });
  });
  it("영업일 빼기는 주말을 건너뜀", () => {
    expect(subBusinessDays("2026-11-25", 3)).toBe("2026-11-20");
    expect(subBusinessDays("2026-11-09", 1)).toBe("2026-11-06");
  });
});

describe("상정 서류·안내", () => {
  it("판정 카드의 징구 서류를 쓰고, 없으면 공적 서류 기본값", () => {
    expect(committeeDocs({ documents: ["매매계약서", "발령 공문"] })).toEqual(["매매계약서", "발령 공문"]);
    expect(committeeDocs({})).toEqual(["사유를 객관적으로 보여 주는 공적 서류"]);
  });
  it("결과 전에는 가능 여부를 약속하지 않게 안내", () => {
    expect(committeeNotice({ stage: "docs", docs: [], requestedAt: "2026-11-19" })).toContain("약속하지 마세요");
    expect(committeeNotice({ stage: "submitted", docs: [], requestedAt: "2026-11-19", meeting: "2026-11-25" })).toContain("11월 25일");
  });
});
