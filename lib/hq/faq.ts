// F3 본점 FAQ: 승인된 회신의 재사용과 재검토 표시. 판정 코드는 바꾸지 않는다(참고 해석으로만 표시).
import { judge } from "@/lib/rules";
import type { Case, KbVersion, Verdict, VerdictCode } from "@/lib/rules/types";
import { faqKey, INQUIRY_VERDICTS, type InquiryDraft } from "./inquiry";
import type { Committee } from "./committee";

export interface Inquiry extends InquiryDraft {
  id: string; // Q-0001
  createdAt: string; // ISO 시각
  branchNote: string; // 지점이 덧붙인 의견
  /** pending: 본점 검토 · external: 외부기관 회신 대기(지침 제6조 5항) · answered: 회신·FAQ 등록 */
  status: "pending" | "external" | "answered";
  faqId?: string;
  /** 외부기관 문의 기록 */
  external?: { agencies: string[]; postedAt: string; interimNotice: string };
  /** 본점이 회신하며 여신심사위 상정을 결정한 경우(지침 제3조) */
  committee?: Committee;
}

export interface FaqEntry {
  id: string; // FAQ-0001
  inquiryId: string;
  title: string;
  question: string;
  answer: string; // 본점 회신
  hqConclusion: string; // 본점 결론 한 줄
  approvedAt: string; // YYYY-MM-DD
  approver: string;
  kb: KbVersion; // 승인 당시 지식 버전
  verdictAtApproval: VerdictCode; // 승인 당시 규칙 엔진 판정
  facts: string[];
  gaps: string[];
  key: string;
  case: Case;
  /** 외부기관 회신을 거친 해석이면 그 기관 */
  viaExternal?: string[];
  /** 시연용 예시(lib/hq/seed.ts) */
  example?: boolean;
}

export interface FaqReview {
  status: "valid" | "review";
  reason?: string;
  verdictNow?: VerdictCode;
}

/** 지식 버전이 바뀐 뒤 같은 사례를 다시 판정해 결론이 달라지면 재검토 대상 (A은행 지침 제6조 4항) */
export function reviewFaq(f: FaqEntry, kbNow: KbVersion): FaqReview {
  if (f.kb === kbNow) return { status: "valid" };
  // 승인 당시 기준일로 다시 판정해 날짜가 아니라 지식 버전 차이만 본다
  const now = judge({ ...f.case, asOf: f.case.asOf ?? f.approvedAt, kb: kbNow });
  if (now.verdict !== f.verdictAtApproval) {
    return {
      status: "review",
      verdictNow: now.verdict,
      reason: `승인 당시(${f.kb}) 판정 '${f.verdictAtApproval}' → 현재 지식 버전(${kbNow}) '${now.verdict}'. 지식 버전이 바뀌어 회신 내용을 다시 확인해야 합니다.`,
    };
  }
  return { status: "valid", verdictNow: now.verdict, reason: `지식 버전은 바뀌었지만(${f.kb}→${kbNow}) 이 사례의 판정은 같습니다.` };
}

/** 새 판정과 같은 쟁점·같은 결론의 승인 FAQ. 본점 질의 대상 판정(보류·심사위·내부지침)에만 붙인다. */
export function findFaq(faqs: FaqEntry[], c: Case, v: Pick<Verdict, "module" | "verdict" | "trace" | "gaps">): FaqEntry | undefined {
  if (!INQUIRY_VERDICTS.includes(v.verdict)) return undefined;
  const key = faqKey(c, v);
  return faqs
    .filter((f) => f.key === key && f.verdictAtApproval === v.verdict)
    .sort((a, b) => b.approvedAt.localeCompare(a.approvedAt))[0];
}

/**
 * 승인된 본점 해석이 있을 때 창구 화면이 한 방향으로 말하게 한다.
 * 판정 코드·근거는 그대로 두고, '본점에 질의하라'는 지시만 '본점 해석대로 처리'로 바꾼다.
 * 심사위 판정은 해석이 있어도 상정이 필요하므로 바꾸지 않는다(undefined).
 */
export interface FaqGuide {
  id: string;
  conclusion: string;
  headline: string; // 본점 질의 지시 문장을 뺀 결론
  action: string; // '다음 할 일'
  conditions: string[];
  script?: string; // 회신의 '창구 안내' 따옴표 문장(고객에게 그대로 말할 문장)
}

const ASKS_HQ = /본점(에)? ?(질의|확인)/;

export function faqGuide(faq: FaqEntry | undefined, v: Pick<Verdict, "verdict" | "headline" | "conditions" | "kb">): FaqGuide | undefined {
  if (!faq || v.verdict === "심사위" || reviewFaq(faq, v.kb).status !== "valid") return undefined;
  const sentences = v.headline.split(/(?<=[.다요])\s+/);
  const kept = sentences.filter((x) => !ASKS_HQ.test(x));
  return {
    id: faq.id,
    conclusion: faq.hqConclusion,
    headline: kept.length ? kept.join(" ") : v.headline,
    action: `본점 해석(${faq.id})대로 처리`,
    conditions: v.conditions.map((c) => (ASKS_HQ.test(c) ? `${c} → 본점 회신 있음(${faq.id})` : c)),
    script: faq.answer.match(/창구 안내:\s*["“]([^"”]+)["”]/)?.[1],
  };
}
