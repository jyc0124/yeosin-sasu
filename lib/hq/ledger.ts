// 쟁점 대장: 정부 발표 자료에 기준이 없는 쟁점이 생기고 → 조사·회신되고 → 닫히는 흐름을 한곳에 모은다.
// 저장소를 새로 두지 않고 기존 데이터(원문 공백 목록·지점 질의·본점 FAQ·Liner 조사 결과)에서 매번 계산한다.
// 판정 코드는 바꾸지 않는다(CLAUDE.md 원칙 1). '해소'는 근거 자료(factsheet)에 정부 문서가 들어갔을 때만이다.
import type { GapRef } from "@/lib/kb";
import type { Case, KbVersion } from "@/lib/rules/types";
import { reviewFaq, type FaqEntry, type Inquiry } from "./faq";

/** 진행 단계(위에서부터 우선) */
export type IssueStatus =
  | "resolved" // 정부 후속 문서로 기준이 생김(근거 자료 반영) → 해소됨
  | "review" // 본점 해석이 있었지만 근거 자료가 바뀌어 다시 확인해야 함 → 진행 중
  | "hq" // 정부 기준은 없고 본점 해석(사례 FAQ)으로 운영 중
  | "candidate" // Liner가 새 공식 문서 후보를 찾음 → 원문 대조 필요
  | "waiting" // 지점 질의가 본점 회신을 기다림
  | "researched" // Liner로 조사했지만 공식 기준 없음
  | "open"; // 아직 아무 처리 없음

export type IssueTab = "active" | "hq" | "resolved";
export const TAB_OF: Record<IssueStatus, IssueTab> = {
  resolved: "resolved",
  hq: "hq",
  review: "active",
  candidate: "active",
  waiting: "active",
  researched: "active",
  open: "active",
};

export interface IssueResearch {
  at: string; // YYYY-MM-DD 또는 ISO
  official: number;
  newDocs: number;
  verified: boolean; // 원문 대조까지 마친 기록인지
}

export interface LedgerIssue {
  id: string; // G-04, 또는 G-09에서 갈라진 새 쟁점은 G-09-<n>
  gapId: string; // 조사·외부기관 문의에 쓰는 원문 공백 ID
  topic: string;
  origin: "factsheet" | "inquiry"; // 개발하며 정리하며 정한 쟁점 / 지점 질의로 새로 생긴 쟁점
  status: IssueStatus;
  inquiries: { id: string; question: string; status: Inquiry["status"]; createdAt: string }[];
  faqs: { id: string; conclusion: string; needsReview: boolean }[];
  research?: IssueResearch;
  firstSeen?: string; // 처음 질의가 들어온 시각(새 쟁점)
}

/** G-09(규칙에 없는 사실)로 들어온 질의에서 '어떤 사실인지'를 뽑는다. 같은 사실끼리 한 쟁점으로 묶는다. */
export function unmodeledFacts(c: Case): string[] {
  const out = new Set<string>();
  for (const u of (c as Case & { unmodeled?: string[] }).unmodeled ?? []) {
    const t = u.trim();
    if (t) out.add(t);
  }
  for (const h of (c as Case & { houses?: { kind?: string }[] }).houses ?? []) {
    if (h.kind === "officetel") out.add("주거용 오피스텔");
    if (h.kind === "mixed_use") out.add("상가주택");
  }
  return [...out];
}

/** 쟁점 이름: 추출된 사실이 고객 말 그대로일 수 있어("분양권도 하나 있어요") 끝의 수량·보유 표현과 조사를 걷어 낸다 */
export function cleanFact(s: string): string {
  let t = s.trim().replace(/[.?!~…]+$/g, "").trim();
  const tail = /\s*(을|를|도|은|는|이|가)?\s*(하나|한\s?개|한\s?채|두\s?개|[0-9]+\s?(개|건|채|곳))?\s*(있어요|있습니다|있음|있다|있고|보유(하고\s?있어요|하고\s?있음|중|함)?|소유(하고\s?있어요|중)?|가지고\s?있어요|갖고\s?있어요)?$/;
  for (let i = 0; i < 3; i++) t = t.replace(tail, "").trim();
  return t || s.trim();
}

/** 묶음 키: 다듬은 이름에서 띄어쓰기를 빼서 "분양권 1개"·"분양권도 하나 있어요"·"분양권"을 같은 쟁점으로 본다 */
export const factKey = (s: string) => cleanFact(s).replace(/\s+/g, "");

function statusOf(i: Omit<LedgerIssue, "status">, resolved: boolean): IssueStatus {
  if (resolved) return "resolved";
  if (i.faqs.some((f) => f.needsReview)) return "review";
  if (i.faqs.length) return "hq";
  if (i.research && i.research.newDocs > 0) return "candidate";
  if (i.inquiries.some((q) => q.status !== "answered")) return "waiting";
  if (i.research) return "researched";
  return "open";
}

export interface LedgerInput {
  gaps: GapRef[];
  inquiries: Inquiry[];
  faqs: FaqEntry[];
  kb: KbVersion;
  /** 원문 대조를 마친 조사 기록(data/kb/gap_research.json) */
  history: (gapId: string) => { date: string; official: number } | undefined;
  /** 이 브라우저에서 돌린 Liner 조사(공식 출처 목록만) */
  live: (gapId: string) => { at: string; official: number; newDocs: number } | undefined;
}

export function buildLedger({ gaps, inquiries, faqs, kb, history, live }: LedgerInput): LedgerIssue[] {
  const research = (gapId: string): IssueResearch | undefined => {
    const l = live(gapId);
    const h = history(gapId);
    // 더 최근 것을 쓴다(같은 날이면 원문 대조를 마친 기록)
    if (l && (!h || l.at.slice(0, 10) > h.date)) return { at: l.at, official: l.official, newDocs: l.newDocs, verified: false };
    if (h) return { at: h.date, official: h.official, newDocs: 0, verified: true };
    return undefined;
  };
  const faqOf = (f: FaqEntry) => ({ id: f.id, conclusion: f.hqConclusion, needsReview: reviewFaq(f, kb).status === "review" });
  const inqOf = (q: Inquiry) => ({ id: q.id, question: q.question, status: q.status, createdAt: q.createdAt });
  const faqById = new Map(faqs.map((f) => [f.id, f]));

  const issues: LedgerIssue[] = [];
  for (const g of gaps) {
    const resolved = g.resolved && kb === "v2";
    const linked = inquiries.filter((q) => q.gaps.includes(g.id));

    if (g.id !== "G-09") {
      const fs = faqs.filter((f) => f.gaps.includes(g.id));
      const base = { id: g.id, gapId: g.id, topic: g.topic, origin: "factsheet" as const, inquiries: linked.map(inqOf), faqs: fs.map(faqOf), research: research(g.id) };
      issues.push({ ...base, status: statusOf(base, resolved) });
      continue;
    }

    // G-09는 '규칙에 없는 사실' 묶음이다. 실제 업무에서는 사실마다 다른 쟁점이므로 질의(또는 FAQ)가 들어오면 사실별로 새 쟁점을 연다.
    const groups = new Map<string, { label: string; qs: Inquiry[]; fs: Map<string, FaqEntry>; first?: string }>();
    const group = (f: string) => {
      const k = factKey(f);
      const grp = groups.get(k) ?? { label: cleanFact(f), qs: [], fs: new Map<string, FaqEntry>() };
      groups.set(k, grp);
      return grp;
    };
    const rest: Inquiry[] = [];
    for (const q of [...linked].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const facts = unmodeledFacts(q.case);
      if (!facts.length) rest.push(q);
      for (const f of facts) {
        const grp = group(f);
        grp.qs.push(q);
        grp.first ??= q.createdAt;
        if (q.faqId && faqById.has(q.faqId)) grp.fs.set(q.faqId, faqById.get(q.faqId)!);
      }
    }
    const restFaqs: FaqEntry[] = [];
    for (const f of faqs.filter((x) => x.gaps.includes("G-09"))) {
      const facts = unmodeledFacts(f.case);
      if (!facts.length) restFaqs.push(f);
      for (const x of facts) group(x).fs.set(f.id, f);
    }
    const r9 = research("G-09");
    const base9 = { id: "G-09", gapId: "G-09", topic: g.topic, origin: "factsheet" as const, inquiries: rest.map(inqOf), faqs: restFaqs.map(faqOf), research: r9 };
    issues.push({ ...base9, status: statusOf(base9, resolved) });
    let n = 0;
    for (const grp of groups.values()) {
      n += 1;
      const base = {
        id: `G-09-${n}`,
        gapId: "G-09",
        topic: `"${grp.label}"을(를) 주택 수·규제 대상·예외 판단에 어떻게 반영하는지`,
        origin: "inquiry" as const,
        inquiries: grp.qs.map(inqOf),
        faqs: [...grp.fs.values()].map(faqOf),
        research: r9,
        firstSeen: grp.first,
      };
      issues.push({ ...base, status: statusOf(base, resolved) });
    }
  }
  return issues;
}

export const STATUS_LABEL: Record<IssueStatus, { label: string; tone: string; next: string }> = {
  open: { label: "열림", tone: "bg-zinc-100 text-zinc-700 ring-zinc-200", next: "Liner로 새 공식 자료가 있는지 조사" },
  researched: { label: "조사함 · 공식 기준 없음", tone: "bg-teal-50 text-teal-800 ring-teal-200", next: "지점 질의가 오면 본점 해석으로 회신, 필요하면 외부기관 문의" },
  waiting: { label: "지점 질의 회신 대기", tone: "bg-amber-50 text-amber-800 ring-amber-200", next: "질의 처리에서 회신(조사 결과 참고)" },
  candidate: { label: "새 공식 문서 후보", tone: "bg-orange-50 text-orange-800 ring-orange-200", next: "① 후속 문서 감시로 원문 대조 후 근거 자료에 반영" },
  review: { label: "본점 해석 재확인 필요", tone: "bg-rose-50 text-rose-800 ring-rose-200", next: "근거 자료가 바뀌었습니다. 질의 처리에서 FAQ를 다시 확인" },
  hq: { label: "본점 해석으로 운영 중", tone: "bg-violet-50 text-violet-700 ring-violet-200", next: "정부 기준이 나오면 해소(정책 감시가 계속 추적)" },
  resolved: { label: "해소 · 정부 기준", tone: "bg-green-50 text-green-700 ring-green-200", next: "정부 후속 문서가 근거 자료에 반영됨" },
};
