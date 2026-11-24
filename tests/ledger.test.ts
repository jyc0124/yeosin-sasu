// 쟁점 대장: 질의·FAQ·조사 결과로 쟁점 상태가 바뀌고, G-09(규칙에 없는 사실)는 사실별 새 쟁점으로 갈라진다.
import { describe, expect, it } from "vitest";
import { allGaps } from "@/lib/kb";
import { buildLedger, cleanFact, factKey, TAB_OF } from "@/lib/hq/ledger";
import { SEED_FAQS } from "@/lib/hq/seed";
import type { FaqEntry, Inquiry } from "@/lib/hq/faq";
import type { Case } from "@/lib/rules/types";

const none = () => undefined;
const inq = (id: string, gaps: string[], extra: Partial<Inquiry> = {}, c: Partial<Case> = {}): Inquiry =>
  ({ id, question: `질문 ${id}`, status: "pending", createdAt: `2026-11-19T0${id.slice(-1)}:00:00Z`, gaps, case: { module: "M2", ...c } as Case, ...extra }) as Inquiry;
const base = { gaps: allGaps(), inquiries: [] as Inquiry[], faqs: [] as FaqEntry[], kb: "v2" as const, history: none, live: none };
const byId = (l: ReturnType<typeof buildLedger>, id: string) => l.find((i) => i.id === id)!;

describe("쟁점 대장", () => {
  it("아무 처리가 없으면 15개 쟁점(11.21 G-14·G-15 추가), v2에서 G-02·G-08만 해소", () => {
    const l = buildLedger(base);
    expect(l).toHaveLength(15);
    expect(l.filter((i) => i.status === "resolved").map((i) => i.id)).toEqual(["G-02", "G-08"]);
    expect(buildLedger({ ...base, kb: "v1" }).filter((i) => i.status === "resolved")).toHaveLength(0);
  });

  it("조사 기록이 있으면 '조사함', 새 문서 후보가 있으면 '새 공식 문서 후보'", () => {
    const l = buildLedger({
      ...base,
      history: (g) => (g === "G-10" ? { date: "2026-11-19", official: 30 } : undefined),
      live: (g) => (g === "G-01" ? { at: "2026-11-20T01:00:00Z", official: 2, newDocs: 1 } : undefined),
    });
    expect(byId(l, "G-10").status).toBe("researched");
    expect(byId(l, "G-01").status).toBe("candidate");
    expect(byId(l, "G-01").research?.verified).toBe(false);
  });

  it("지점 질의가 걸리면 '회신 대기', 승인 FAQ가 있으면 '본점 해석으로 운영 중'(본점 탭)", () => {
    const l = buildLedger({ ...base, inquiries: [inq("Q-0001", ["G-04"])], faqs: SEED_FAQS });
    expect(byId(l, "G-04").status).toBe("waiting");
    expect(byId(l, "G-04").inquiries).toHaveLength(1);
    expect(byId(l, "G-03").status).toBe("hq");
    expect(TAB_OF[byId(l, "G-03").status]).toBe("hq");
  });

  it("근거 자료가 바뀌어 FAQ 판정이 달라지면 '본점 해석 재확인 필요'로 진행 중에 돌아온다", () => {
    const e4 = SEED_FAQS.find((f) => f.kb === "v1")!; // v1에서 승인, v2에서 판정이 바뀌는 예시
    const moved = { ...e4, id: "FAQ-T1", gaps: ["G-01"] };
    expect(byId(buildLedger({ ...base, faqs: [moved] }), "G-01").status).toBe("review");
    expect(byId(buildLedger({ ...base, kb: "v1", faqs: [moved] }), "G-01").status).toBe("hq");
  });

  it("G-09로 들어온 질의는 사실별 새 쟁점으로 열리고, 같은 사실은 한 쟁점으로 묶인다", () => {
    const l = buildLedger({
      ...base,
      inquiries: [
        inq("Q-0001", ["G-09"], {}, { unmodeled: ["분양권 1개"] } as Partial<Case>),
        inq("Q-0002", ["G-09"], {}, { unmodeled: ["분양권"] } as Partial<Case>),
        inq("Q-0003", ["G-09"], {}, { unmodeled: ["입주권 보유"] } as Partial<Case>),
      ],
    });
    const news = l.filter((i) => i.origin === "inquiry");
    expect(news.map((i) => i.inquiries.length)).toEqual([2, 1]);
    expect(news[0].topic).toContain("분양권");
    expect(news[0].status).toBe("waiting");
    expect(news[0].firstSeen).toBe("2026-11-19T01:00:00Z");
    expect(byId(l, "G-09").inquiries).toHaveLength(0);
  });

  it("새 쟁점의 질의에 본점이 회신·승인하면 '본점 해석으로 운영 중'으로 옮겨진다", () => {
    const c = { module: "M2", unmodeled: ["분양권도 하나 있어요"] } as unknown as Case;
    const faq = { ...SEED_FAQS[1], id: "FAQ-0001", kb: "v2", gaps: ["G-09"], case: c } as FaqEntry;
    const l = buildLedger({ ...base, inquiries: [inq("Q-0001", ["G-09"], { status: "answered", faqId: "FAQ-0001" }, c)], faqs: [faq] });
    const issue = l.find((i) => i.origin === "inquiry")!;
    expect(issue.topic).toContain('"분양권"');
    expect(issue.faqs.map((f) => f.id)).toEqual(["FAQ-0001"]);
    expect(issue.status).toBe("hq");
  });

  it("묶음 키는 띄어쓰기·수량·보유 표현을 무시한다", () => {
    expect(factKey("분양권 1개")).toBe(factKey("분양권"));
    expect(factKey("입주권 보유")).toBe(factKey("입주권"));
    expect(factKey("분양권")).not.toBe(factKey("입주권"));
    expect(factKey("분양권도 하나 있어요")).toBe(factKey("분양권"));
  });

  it("쟁점 이름은 고객 말투를 걷어 낸 사실 이름", () => {
    expect(cleanFact("분양권도 하나 있어요")).toBe("분양권");
    expect(cleanFact("입주권 1개 보유")).toBe("입주권");
    expect(cleanFact("오피스텔을 가지고 있어요.")).toBe("오피스텔");
    expect(cleanFact("보유 주택 경매 진행 중")).toBe("보유 주택 경매 진행 중");
  });
});
