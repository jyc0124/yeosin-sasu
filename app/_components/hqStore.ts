"use client";
// 본점 질의·FAQ 저장소(데모용): 보는 사람 브라우저(localStorage)에 둔다. 같은 브라우저의 지점·본점 탭은 실시간 동기화.
// 여러 기기에서 공유하려면 서버 저장소(Vercel KV 등)로 바꿔야 한다 — 저장 접근은 이 파일로 모아 둠.
import { useEffect, useState } from "react";
import type { FaqEntry, Inquiry } from "@/lib/hq/faq";
import type { InquiryDraft } from "@/lib/hq/inquiry";
import { SEED_FAQS } from "@/lib/hq/seed";
import { committeeDocs, nextMeeting, type CommitteeResult } from "@/lib/hq/committee";

const KEY = "loandesk.hq.v1";
const EVT = "loandesk:hq";
const VERSION = 2;

export interface HqState {
  version: number;
  seq: { q: number; faq: number }; // 번호는 '데모 데이터 지우기' 뒤에도 이어서(다른 탭의 옛 번호와 겹치지 않게)
  inquiries: Inquiry[];
  faqs: FaqEntry[];
}
const EMPTY: HqState = { version: VERSION, seq: { q: 0, faq: 0 }, inquiries: [], faqs: [] };
let memory: HqState | undefined; // 이 탭에서 마지막으로 쓴 값(저장 실패 대비)

const isStr = (v: unknown) => typeof v === "string";
const isInquiry = (q: unknown): q is Inquiry => {
  const x = q as Inquiry;
  return !!x && isStr(x.id) && isStr(x.question) && isStr(x.verdict) && isStr(x.key) && isStr(x.dueDate) && Array.isArray(x.policies) && Array.isArray(x.issues) && Array.isArray(x.asks) && Array.isArray(x.summary) && Array.isArray(x.followUps) && !!x.case;
};
const isFaq = (f: unknown): f is FaqEntry => {
  const x = f as FaqEntry;
  return !!x && isStr(x.id) && isStr(x.key) && isStr(x.approvedAt) && isStr(x.answer) && isStr(x.hqConclusion) && isStr(x.kb) && Array.isArray(x.facts) && !!x.case;
};

/** 저장값 파싱: 항목별로 검사해 손상·구버전 항목은 버린다(화면 전체가 깨지지 않게) */
function parse(raw: string | null): HqState | undefined {
  if (!raw) return undefined;
  try {
    const s = JSON.parse(raw) as Partial<HqState>;
    const inquiries = Array.isArray(s.inquiries) ? s.inquiries.filter(isInquiry) : [];
    const faqs = Array.isArray(s.faqs) ? s.faqs.filter(isFaq) : [];
    const maxN = (ids: string[]) => ids.reduce((m, id) => Math.max(m, Number(id.split("-")[1]) || 0), 0);
    const seq = {
      q: Math.max(Number(s.seq?.q) || 0, maxN(inquiries.map((i) => i.id))),
      faq: Math.max(Number(s.seq?.faq) || 0, maxN(faqs.map((f) => f.id))),
    };
    return { version: VERSION, seq, inquiries, faqs };
  } catch {
    return undefined;
  }
}

export function readHq(): HqState {
  if (memory) return memory;
  try {
    return parse(localStorage.getItem(KEY)) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}

/** 저장. 실패하면 false(화면은 메모리 값으로 유지) */
function write(s: HqState): boolean {
  memory = s;
  let ok = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    ok = false;
  }
  window.dispatchEvent(new CustomEvent(EVT));
  return ok;
}

const id = (prefix: string, n: number) => `${prefix}-${String(n).padStart(4, "0")}`;

export function submitInquiry(draft: InquiryDraft, branchNote: string): { inquiry: Inquiry; saved: boolean } {
  const s = readHq();
  const n = s.seq.q + 1;
  const q: Inquiry = { ...draft, id: id("Q", n), createdAt: new Date().toISOString(), branchNote: branchNote.trim(), status: "pending" };
  const saved = write({ ...s, seq: { ...s.seq, q: n }, inquiries: [q, ...s.inquiries] });
  return { inquiry: q, saved };
}

/** 회신 승인 → FAQ 등록. 이미 회신된 질의(다른 탭·중복 클릭)는 다시 등록하지 않는다. */
export function approveFaq(
  inquiryId: string,
  answer: { answer: string; hqConclusion: string; approver: string; approvedAt: string; committee?: boolean },
): FaqEntry | undefined {
  // 다른 탭이 먼저 승인했을 수 있으니 저장소를 다시 읽는다. 저장에 실패해 메모리에만 있던 질의면 메모리 값을 쓴다.
  const mem = memory;
  memory = undefined;
  let s = readHq();
  if (!s.inquiries.some((i) => i.id === inquiryId) && mem) s = mem;
  const q = s.inquiries.find((i) => i.id === inquiryId);
  if (!q || (q.status !== "pending" && q.status !== "external")) return undefined;
  const n = s.seq.faq + 1;
  const f: FaqEntry = {
    id: id("FAQ", n),
    inquiryId: q.id,
    title: q.title,
    question: q.question,
    answer: answer.answer.trim(),
    hqConclusion: answer.hqConclusion.trim(),
    approver: answer.approver.trim() || "본점 여신기획부",
    approvedAt: answer.approvedAt,
    kb: q.kb,
    verdictAtApproval: q.verdict,
    facts: q.policies.map((p) => p.id),
    gaps: q.gaps ?? [],
    key: q.key,
    case: q.case,
    ...(q.external ? { viaExternal: q.external.agencies } : {}),
  };
  write({
    ...s,
    seq: { ...s.seq, faq: n },
    inquiries: s.inquiries.map((i) =>
      i.id === q.id
        ? {
            ...i,
            status: "answered",
            faqId: f.id,
            ...(answer.committee ? { committee: { stage: "docs" as const, docs: committeeDocs(q), requestedAt: answer.approvedAt } } : {}),
          }
        : i,
    ),
    faqs: [f, ...s.faqs],
  });
  return f;
}

/** 외부기관 문의 등록(지침 제6조 5항): 본점 검토 → 외부기관 회신 대기. 지점에는 중간 안내 문구를 남긴다. */
export function postExternal(inquiryId: string, agencies: string[], postedAt: string): boolean {
  const mem = memory;
  memory = undefined;
  let s = readHq();
  if (!s.inquiries.some((i) => i.id === inquiryId) && mem) s = mem;
  const q = s.inquiries.find((i) => i.id === inquiryId);
  if (!q || q.status !== "pending" || agencies.length === 0) return false;
  const interimNotice = `${agencies.join(", ")}에 해석을 문의했습니다. 회신 전까지 고객에게는 "관계기관 확인 후 안내드리겠습니다"라고 안내하고 가능·불가를 단정하지 마세요(지침 제7조 2항).`;
  write({ ...s, inquiries: s.inquiries.map((i) => (i.id === q.id ? { ...i, status: "external", external: { agencies, postedAt, interimNotice } } : i)) });
  return true;
}

/** 다른 탭이 바꿨을 수 있으니 저장소를 다시 읽고 질의 하나를 고친다 */
function updateInquiry(inquiryId: string, fn: (q: Inquiry) => Inquiry | undefined): boolean {
  const mem = memory;
  memory = undefined;
  let s = readHq();
  if (!s.inquiries.some((i) => i.id === inquiryId) && mem) s = mem;
  const q = s.inquiries.find((i) => i.id === inquiryId);
  const next = q && fn(q);
  if (!next) return false;
  write({ ...s, inquiries: s.inquiries.map((i) => (i.id === inquiryId ? next : i)) });
  return true;
}

/** 지점: 상정 서류 접수 완료 → 본점이 안건 등록, 개최일은 지침 제3조 4항으로 계산 */
export function receiveCommitteeDocs(inquiryId: string, receivedAt: string): boolean {
  return updateInquiry(inquiryId, (q) =>
    q.committee?.stage === "docs" ? { ...q, committee: { ...q.committee, stage: "submitted", receivedAt, ...nextMeeting(receivedAt) } } : undefined,
  );
}

/** 본점: 심사 결과 입력 → 지점에 알림 */
export function decideCommittee(inquiryId: string, result: CommitteeResult, resultNote: string, decidedAt: string): boolean {
  return updateInquiry(inquiryId, (q) =>
    q.committee?.stage === "submitted" ? { ...q, committee: { ...q.committee, stage: "decided", result, resultNote: resultNote.trim(), decidedAt } } : undefined,
  );
}

/** 본점이 할 일이 남은 질의: 회신 전이거나 심사 결과 입력 대기 */
export const hqTodo = (q: Inquiry) => q.status !== "answered" || q.committee?.stage === "submitted";

/** 지점이 확인할 소식의 상태 표시(회신·외부문의·상정 단계가 바뀌면 새 소식) */
export const branchStamp = (q: Inquiry) => (q.committee ? `${q.status}:${q.committee.stage}` : q.status);

/** 질의·FAQ를 지우되 번호는 이어 간다 */
export function resetHq() {
  const s = readHq();
  write({ ...EMPTY, seq: s.seq });
}

/** 화면용: 저장된 FAQ 뒤에 시연용 예시 FAQ를 붙인다(예시는 저장하지 않음) */
const withSeeds = (s: HqState): HqState => ({ ...s, faqs: [...s.faqs, ...SEED_FAQS] });

export function useHq(): HqState {
  const [s, set] = useState<HqState>(() => withSeeds(EMPTY));
  useEffect(() => {
    set(withSeeds(readHq()));
    const on = () => set(withSeeds(readHq()));
    const onStorage = (e: StorageEvent) => {
      // 다른 탭이 바꿨거나 저장소 전체가 지워짐(key === null)
      if (e.key === KEY || e.key === null) {
        memory = undefined;
        on();
      }
    };
    window.addEventListener(EVT, on);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return s;
}

// ── 지점 '내 질의' 회신 도착 알림: 지점이 마지막으로 본 질의 상태(이 브라우저 기준) ──
const SEEN_KEY = "loandesk.branch.seen.v1";
const SEEN_EVT = "loandesk:branch-seen";

function readSeen(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}");
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** 지점이 아직 확인하지 않은 본점 진행(회신 완료·외부기관 문의 중간 안내) */
export function useBranchUpdates(): Inquiry[] {
  const hq = useHq();
  const [seen, setSeen] = useState<Record<string, string>>({});
  useEffect(() => {
    const on = () => setSeen(readSeen());
    on();
    window.addEventListener(SEEN_EVT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(SEEN_EVT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return hq.inquiries.filter((q) => q.status !== "pending" && seen[q.id] !== branchStamp(q));
}

/** '내 질의'를 열면 지금 상태를 확인한 것으로 기록 */
export function markBranchSeen(inquiries: Inquiry[]) {
  try {
    const cur = readSeen();
    const next = { ...cur, ...Object.fromEntries(inquiries.map((q) => [q.id, branchStamp(q)])) };
    if (JSON.stringify(next) === JSON.stringify(cur)) return;
    localStorage.setItem(SEEN_KEY, JSON.stringify(next));
  } catch {
    // 저장이 막혀도 화면은 동작(알림만 남음)
  }
  window.dispatchEvent(new Event(SEEN_EVT));
}
