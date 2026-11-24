// F3 본점 질의·FAQ(결정적 로직). 테스트셋 정답 입력으로 검증한다.
import { describe, expect, it } from "vitest";
import gold from "@/data/eval/cases.slots.json";
import { faqGuide, findFaq, reviewFaq, type FaqEntry } from "@/lib/hq/faq";
import { addBusinessDays, buildInquiry, faqKey, INQUIRY_VERDICTS, RECHECK_VERDICTS } from "@/lib/hq/inquiry";
import { findAvoidance, findPii } from "@/lib/hq/guard";
import { findOpenExternal, planExternal } from "@/lib/hq/external";
import { resolveFacts, resolveGaps } from "@/lib/kb";
import { judge, type Case, type KbVersion } from "@/lib/rules";

// C10은 경기도(수도권)라 '불허'로 확정된다. 규제지역 지정 현황(G-07)이 필요한 보류 흐름은 수도권 밖 변형(C10x, 부산)으로 본다
const G0 = gold as unknown as Record<string, Case>;
const G: Record<string, Case> = { ...G0, C10x: { ...G0.C10, region: "부산" } as Case };
const ASOF = "2026-11-13"; // 금요일
const card = (id: string, kb: KbVersion) => {
  const v = judge({ ...G[id], asOf: ASOF, kb });
  return { ...v, factRefs: resolveFacts(v.facts), gapRefs: resolveGaps(v.gaps) };
};
const draftOf = (id: string, kb: KbVersion, question = id) =>
  buildInquiry({ question, followUps: [], asOf: ASOF, case: { ...G[id], asOf: ASOF }, caseRows: [], card: card(id, kb) });

const faqFrom = (id: string, kb: KbVersion): FaqEntry => {
  const d = draftOf(id, kb);
  return {
    id: "FAQ-0001",
    inquiryId: "Q-0001",
    title: d.title,
    question: d.question,
    answer: "회신",
    hqConclusion: "결론",
    approvedAt: ASOF,
    approver: "본점 여신기획부",
    kb,
    verdictAtApproval: d.verdict,
    facts: d.policies.map((p) => p.id),
    gaps: [],
    key: d.key,
    case: d.case,
  };
};

describe("영업일·긴급 표시 (A은행 지침 제6조 3항)", () => {
  it("금요일 + 3영업일 = 다음 주 수요일", () => {
    expect(addBusinessDays("2026-11-13", 3)).toBe("2026-11-18");
    expect(addBusinessDays("2026-11-13", 5)).toBe("2026-11-20");
  });
  it("만기가 5영업일 안이면 긴급", () => {
    const d = buildInquiry({
      question: "q",
      followUps: [],
      asOf: ASOF,
      case: { ...G.B02, asOf: ASOF, maturityDate: "2026-11-19" } as Case,
      caseRows: [],
      card: card("B02", "v1"),
    });
    expect(d.urgent).toBe(true);
    expect(draftOf("B02", "v1").urgent).toBe(false); // 만기 12.20
  });
});

describe("질의서 내용", () => {
  it("KB v1의 B02(보류): 쟁점에 시행 기준 시점 공백 G-02, 요청 판단은 본점 해석", () => {
    const d = draftOf("B02", "v1");
    expect(d.verdict).toBe("보류");
    expect(d.issues.join(" ")).toContain("G-02");
    expect(d.asks[0]).toContain("본점 해석");
    expect(d.schedule).toEqual(["대출 만기 26.12.20"]);
    expect(d.dueDate).toBe("2026-11-18");
    expect(d.policies.length).toBeGreaterThan(0);
  });
  it("C05(심사위): 상정 여부를 묻고 G-05를 쟁점으로", () => {
    const d = draftOf("C05", "v2");
    expect(d.verdict).toBe("심사위");
    expect(d.asks.join(" ")).toContain("상정");
    expect(d.issues.join(" ")).toContain("G-05");
  });
  it("질의 대상 판정은 보류·심사위·내부지침", () => {
    expect(INQUIRY_VERDICTS).toEqual(["보류", "심사위", "내부지침"]);
  });
  it("확정 판정(A01 조건부)은 재확인 요청: 판정을 그대로 적용해도 되는지 묻고 지점 의견을 쟁점으로", () => {
    const d = draftOf("A01", "v2");
    expect(d.verdict).toBe("조건부");
    expect(d.kind).toBe("recheck");
    expect(d.title.startsWith("[재확인·조건부]")).toBe(true);
    expect(d.asks[0]).toContain("그대로 적용");
    expect(d.issues.join(" ")).toContain("지점 의견");
  });
  it("확정 불가 판정은 escalate, 재확인 대상은 허용·불허·조건부(역질문 제외)", () => {
    expect(draftOf("C05", "v2").kind).toBe("escalate");
    expect(RECHECK_VERDICTS).toEqual(["허용", "불허", "조건부"]);
  });
});

describe("FAQ 재사용·재검토 (지침 제6조 4항)", () => {
  it("같은 쟁점(v1에서 시행 기준 시점 공백)의 다른 질문에 같은 FAQ가 붙는다", () => {
    const f = faqFrom("B02", "v1");
    const a20 = judge({ ...G.A20, asOf: ASOF, kb: "v1" });
    expect(findFaq([f], G.A20, a20)?.id).toBe("FAQ-0001");
    const a01 = judge({ ...G.A01, asOf: ASOF, kb: "v1" });
    expect(findFaq([f], G.A01, a01)).toBeUndefined();
  });
  it("KB v2 승인 후 B02 FAQ는 재검토 필요(보류 → 조건부)", () => {
    const rv = reviewFaq(faqFrom("B02", "v1"), "v2");
    expect(rv).toMatchObject({ status: "review", verdictNow: "조건부" });
  });
  it("만기가 이미 지났으면 긴급", () => {
    const d = buildInquiry({ question: "q", followUps: [], asOf: ASOF, case: { ...G.B02, asOf: ASOF, maturityDate: "2026-11-01" } as Case, caseRows: [], card: card("B02", "v1") });
    expect(d.urgent).toBe(true);
  });
  it("판정이 그대로인 FAQ는 지식 버전이 바뀌어도 유효", () => {
    expect(reviewFaq(faqFrom("C05", "v1"), "v2").status).toBe("valid");
    expect(reviewFaq(faqFrom("B02", "v1"), "v1").status).toBe("valid");
  });
  it("M0 질문은 주제로 묶는다", () => {
    const v = judge({ ...G.C03, kb: "v2" });
    expect(faqKey(G.C03, v)).toBe("M0:보류:dsr_parental_leave");
  });
});

describe("리뷰 회귀: 결론이 다른 판정에 FAQ가 붙지 않는다(높음-1)", () => {
  const M2 = (o: Partial<Case>) => ({ module: "M2", asOf: ASOF, ...o }) as Case;
  const M1 = (o: Partial<Case>) => ({ module: "M1", asOf: ASOF, ...o }) as Case;
  const similarM2 = M2({ houseCount: 2, houses: [{ region: "경기", sigungu: "수원시", tags: ["similar"] }] });
  const faqOf = (c: Case): FaqEntry => {
    const v = judge({ ...c, kb: "v2" });
    const d = buildInquiry({ question: "q", followUps: [], asOf: ASOF, case: c, caseRows: [], card: { ...v, factRefs: resolveFacts(v.facts), gapRefs: resolveGaps(v.gaps) } });
    return { ...faqFrom("C05", "v2"), key: d.key, case: c, verdictAtApproval: d.verdict, kb: "v2" };
  };
  const hit = (f: FaqEntry, c: Case) => findFaq([f], c, judge({ ...c, kb: "v2" }));

  it("M2 '그 밖에 준하는 경우' 심사위 회신은 1주택 허용·주택 수 모름 역질문에 붙지 않는다", () => {
    const f = faqOf(similarM2);
    expect(f.verdictAtApproval).toBe("심사위");
    expect(hit(f, M2({ houseCount: 1 }))).toBeUndefined();
    expect(hit(f, M2({}))).toBeUndefined();
    expect(hit(f, similarM2)?.id).toBe(f.id); // 같은 쟁점에는 붙는다
  });
  it("M1 심사위 회신은 다주택 불허에 붙지 않는다", () => {
    const sim = M1({ houses: [{ region: "서울", isApt: true, tags: ["similar"] }] });
    const f = faqOf(sim);
    expect(hit(f, M1({ houses: [{ region: "서울", isApt: true }, { region: "서울", isApt: true }] }))).toBeUndefined();
  });
  it("같은 G-03이어도 보류(가계약)와 심사위는 다른 키", () => {
    const prov = M2({ houseCount: 2, houses: [{ region: "서울", tags: ["saleProvisional"] }] });
    const both = M2({ houseCount: 3, houses: [{ region: "경기", tags: ["similar"] }, { region: "서울", tags: ["saleProvisional"] }] });
    const a = judge({ ...prov, kb: "v2" });
    const b = judge({ ...both, kb: "v2" });
    expect([a.verdict, b.verdict]).toEqual(["보류", "심사위"]);
    expect(faqKey(prov, a)).not.toBe(faqKey(both, b));
  });
  it("질의서 쟁점은 마지막 주택이 아니라 판정을 막은 주택을 가리킨다(중간-1)", () => {
    const c = M2({ houseCount: 3, houses: [{ label: "가계약 주택", region: "서울", tags: ["saleProvisional"] }, { label: "증여 주택", region: "서울", tags: ["gift"] }] });
    const v = judge({ ...c, kb: "v2" });
    const d = buildInquiry({ question: "q", followUps: [], asOf: ASOF, case: c, caseRows: [], card: { ...v, factRefs: resolveFacts(v.facts), gapRefs: resolveGaps(v.gaps) } });
    const decided = d.issues.find((x) => x.startsWith("판정 단계"));
    expect(decided).toContain("주택 수 결정");
    expect(decided).not.toContain("증여");
  });
});

describe("입력 점검(지침 제6조 2항·제7조 1항)", () => {
  it("개인정보로 보이는 값을 찾는다", () => {
    expect(findPii("홍길동 010-1234-5678")).toEqual(["휴대전화 번호"]);
    expect(findPii("900101-1234567")).toContain("주민등록번호");
    expect(findPii("a@b.com")).toEqual(["이메일"]);
  });
  it("날짜·금액은 개인정보로 보지 않는다", () => {
    expect(findPii("만기 2026-12-20, 기준시가 100000000원, 26.12.20")).toEqual([]);
  });
  it("규제 회피로 읽힐 표현을 찾는다", () => {
    expect(findAvoidance("12월에 미리 연장하면 됩니다")).toEqual(["조기·앞당긴 연장"]);
    expect(findAvoidance("본점 확인 후 안내")).toEqual([]);
  });
});

describe("외부기관 문의 (A은행 지침 제6조 5항)", () => {
  it("v1 B02(시행 시점 공백 G-02): 금융위원회 + 전세대출 보증기관에 문의", () => {
    const p = planExternal(draftOf("B02", "v1"));
    expect(p.needed).toBe(true);
    expect(p.targets.map((t) => t.agency)).toEqual(["금융위원회", "전세대출 보증기관(HUG 등)"]);
    expect(p.targets[0].gapIds).toEqual(["G-02"]);
  });
  it("v2에서 G-02가 해소된 B02는 질의 대상 판정이 아니고, 해소된 공백은 외부 문의 쟁점에서 빠진다", () => {
    const d = draftOf("B02", "v1");
    expect(planExternal({ ...d, kb: "v2" }).needed).toBe(false);
  });
  it("C02(가계약 G-03)는 금융위원회만, 수도권 밖 규제지역 해제(G-07)는 국토교통부", () => {
    expect(planExternal(draftOf("C02", "v2")).targets.map((t) => t.agency)).toEqual(["금융위원회"]);
    expect(planExternal(draftOf("C10x", "v2")).targets.map((t) => t.agency)).toEqual(["국토교통부"]);
  });
  it("금융회사 자체 판단 사항(G-05 불가피성, G-06 주된 영업)은 외부에 묻지 않는다", () => {
    for (const id of ["C06", "B15"]) {
      const p = planExternal(draftOf(id, "v2"));
      expect(p.needed).toBe(false);
      expect(p.internal.length).toBe(1);
      expect(p.noneReason).toContain("자체 판단");
    }
  });
  it("심사위(C05)·발표 예정 보류(C09)는 외부 문의 없음, 이유가 다르다", () => {
    expect(planExternal(draftOf("C05", "v2")).noneReason).toContain("여신심사위원회");
    expect(planExternal(draftOf("C09", "v2")).noneReason).toContain("정책 감시");
  });
  it("질의문에는 고객 질문·일정이 들어가지 않고 원문 조항과 쟁점만 들어간다", () => {
    const d = buildInquiry({
      question: "고객 홍길동 010-1234-5678 가계약만 했는데요",
      followUps: ["추가 확인 답변"],
      asOf: ASOF,
      case: { ...G.C02, asOf: ASOF },
      caseRows: [["보유 주택", "3채"]],
      card: card("C02", "v2"),
    });
    const t = planExternal(d).text;
    expect(t).toContain("가계약");
    expect(t).not.toContain("홍길동");
    expect(t).not.toContain("추가 확인 답변");
    expect(t).not.toContain("3채");
    expect(findPii(t)).toEqual([]);
    expect(findAvoidance(t)).toEqual([]);
    for (const p of d.policies) expect(t).toContain(p.id);
  });
  it("같은 쟁점으로 외부 회신 대기 중인 질의를 찾는다(자기 자신·다른 상태는 제외)", () => {
    const list = [
      { id: "Q-0001", key: "k", status: "external" },
      { id: "Q-0002", key: "k", status: "pending" },
      { id: "Q-0003", key: "x", status: "external" },
    ];
    expect(findOpenExternal(list, "k")?.id).toBe("Q-0001");
    expect(findOpenExternal(list, "k", "Q-0001")).toBeUndefined();
    expect(findOpenExternal(list, "y")).toBeUndefined();
  });
});

describe("규칙에 없는 사실(G-09) → 외부기관 문의", () => {
  it("분양권처럼 기준이 없는 사실로 보류되면 금융위원회 문의 대상이고, 질의문에 그 사실을 적는다", () => {
    const c: Case = { module: "M2", houseCount: 1, asOf: ASOF, unmodeled: ["분양권 1개"] };
    const v = judge(c);
    expect(v.verdict).toBe("보류");
    const d = buildInquiry({ question: "서울 아파트 1채랑 분양권 하나", followUps: [], asOf: ASOF, case: c, caseRows: [], card: { ...v, factRefs: resolveFacts(v.facts), gapRefs: resolveGaps(v.gaps) } });
    const p = planExternal(d);
    expect(p.needed).toBe(true);
    expect(p.targets.map((t) => t.agency)).toContain("금융위원회");
    expect(p.text).toContain("분양권 1개");
  });
});

describe("시연용 예시 FAQ (lib/hq/seed.ts)", () => {
  it("예시 4건: v2 3건은 같은 쟁점 판정 카드에 붙고, v1 시절 B02는 재검토 대상", async () => {
    const { SEED_FAQS } = await import("@/lib/hq/seed");
    expect(SEED_FAQS).toHaveLength(4);
    for (const id of ["C05", "C02", "C06"]) {
      const c = card(id, "v2");
      expect(findFaq(SEED_FAQS, { ...G[id], asOf: ASOF }, c)?.example, id).toBe(true);
    }
    const b02 = SEED_FAQS.find((f) => f.question.includes("12/20"))!;
    expect(reviewFaq(b02, "v2").status).toBe("review");
    expect(reviewFaq(b02, "v1").status).toBe("valid");
  });
  it("규제지역 해제 질문: 수도권(C10)은 불허로 확정, 수도권 밖(C10x)은 FAQ 없이 '보류'로 남는다", async () => {
    const { SEED_FAQS } = await import("@/lib/hq/seed");
    for (const kb of ["v1", "v2"] as const) {
      expect(card("C10", kb).verdict).toBe("불허");
      expect(card("C10x", kb).verdict).toBe("보류");
      expect(findFaq(SEED_FAQS, { ...G.C10x, asOf: ASOF }, card("C10x", kb))).toBeUndefined();
    }
  });
  it("본점 해석이 붙은 판정 카드는 '본점에 질의/확인' 지시를 남기지 않는다(정합성)", async () => {
    const { SEED_FAQS } = await import("@/lib/hq/seed");
    const G2 = gold as unknown as Record<string, Case>;
    for (const kb of ["v1", "v2"] as const) {
      for (const id of Object.keys(G2).filter((k) => !k.startsWith("_"))) {
        const c = card(id, kb);
        const f = findFaq(SEED_FAQS, { ...G2[id], asOf: ASOF }, c);
        const g = faqGuide(f, c);
        if (!f || !g) continue;
        expect(g.headline, `${kb} ${id}`).not.toMatch(/본점(에)? ?(질의|확인)/);
        expect(g.action).toContain(f.id);
        for (const x of g.conditions) if (/본점 ?질의/.test(x)) expect(x).toContain(f.id);
      }
    }
    // C02(가계약): 결론 문장은 남기고 '본점 확인이 필요합니다'만 뺀다
    const c02 = card("C02", "v2");
    const g = faqGuide(findFaq(SEED_FAQS, { ...G.C02, asOf: ASOF }, c02), c02)!;
    expect(g.headline).toContain("정부 발표 자료에 없습니다");
    expect(g.script).toContain("정식 매매계약서");
  });
  it("심사위 판정은 본점 해석이 있어도 카드 지시를 바꾸지 않는다(상정 필요)", async () => {
    const { SEED_FAQS } = await import("@/lib/hq/seed");
    const c05 = card("C05", "v2");
    expect(faqGuide(findFaq(SEED_FAQS, { ...G.C05, asOf: ASOF }, c05), c05)).toBeUndefined();
  });
  it("예시 회신에 개인정보·회피 표현이 없다", async () => {
    const { SEED_FAQS } = await import("@/lib/hq/seed");
    for (const f of SEED_FAQS) {
      expect(findPii(f.answer, f.hqConclusion)).toEqual([]);
      expect(findAvoidance(`${f.answer} ${f.hqConclusion}`)).toEqual([]);
    }
  });
});
