// F3 본점 질의서: 판정 카드에서 결정적으로 만든다(LLM 없음). 항목은 가상 A은행 지침 제6조를 따른다.
import type { FactRef, GapRef } from "@/lib/kb";
import type { Case, KbVersion, ModuleId, Verdict, VerdictCode } from "@/lib/rules/types";

/** 본점 질의 대상 판정 (A은행 지침 제6조 1항) */
export const INQUIRY_VERDICTS: VerdictCode[] = ["보류", "심사위", "내부지침"];
/** 지점이 확정할 수 있는 판정이지만, 직원이 고객 상황과 맞지 않는다고 볼 때 본점에 재확인을 요청할 수 있다. 역질문은 답부터 받는다. */
export const RECHECK_VERDICTS: VerdictCode[] = ["허용", "불허", "조건부"];

export interface InquiryInput {
  question: string;
  followUps: string[];
  asOf: string;
  case: Case;
  caseRows: [string, string][]; // 화면 표기용 추출 조건
  card: Verdict & { factRefs: FactRef[]; gapRefs: GapRef[] };
}

export interface InquiryDraft {
  /** escalate = 지점이 확정할 수 없는 판정(제6조 1항), recheck = 확정 판정에 대한 지점의 재확인 요청 */
  kind?: "escalate" | "recheck";
  title: string;
  module: ModuleId;
  kb: KbVersion;
  asOf: string;
  verdict: VerdictCode;
  question: string;
  followUps: string[];
  summary: [string, string][]; // 고객 상황 요약(추출 조건)
  policies: { id: string; source: string; text: string }[]; // 관련 정책·조항
  branchOpinion: string; // 지점 의견(규칙 엔진 판정)
  /** 정부 발표 자료로 이미 확인된 기준(규제별). 본점이 쟁점만 보면 되도록 나눠 적는다 */
  confirmed?: string[];
  issues: string[]; // 확인이 필요한 쟁점
  asks: string[]; // 본점에 요청하는 판단
  schedule: string[]; // 고객 일정
  documents?: string[]; // 판정 카드의 징구 서류(심사위 상정 서류 목록에 쓴다)
  gaps: string[]; // 카드에 걸린 원문 공백 ID
  dueDate: string; // 회신 기한(3영업일)
  urgent: boolean; // 만기가 5영업일 안
  key: string; // FAQ 대응 키
  case: Case;
}

/** 주말만 건너뛴 영업일 더하기(공휴일은 반영하지 않음) */
export function addBusinessDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

const fmt = (d: string) => `${d.slice(2, 4)}.${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;

/**
 * FAQ 대응 키: 같은 쟁점에서 같은 결론이 난 질문끼리 묶는다.
 * 판정 코드 + (M0 = 주제 / M1·M2 = 결정 단계 + 걸린 원문 공백).
 * 주택 수 단계는 엔진이 막힌 주택을 '주택 수 결정' 단계로 마지막에 남긴다.
 */
export function faqKey(c: Case, v: Pick<Verdict, "module" | "verdict" | "trace" | "gaps">): string {
  if (c.module === "M0") return `M0:${v.verdict}:${c.topic}`;
  const step = v.trace[v.trace.length - 1]?.step ?? "-";
  return `${v.module}:${v.verdict}:${step}:${[...v.gaps].sort().join(",")}`;
}

const ASKS: Partial<Record<VerdictCode, string[]>> = {
  보류: ["정부 발표 자료에 기준이 없는 쟁점에 대한 본점 해석", "해석이 나오기 전 창구 안내 문구(단정 금지, A은행 지침 제7조 2항)"],
  안내: ["정부 발표 자료에 기준이 없는 쟁점에 대한 본점 해석", "해석이 나오기 전 창구 안내 문구(단정 금지, A은행 지침 제7조 2항)"],
  심사위: ["여신심사위원회 상정 여부", "상정 시 추가로 받아야 할 서류"],
  내부지침: ["A은행 지침에 없는 이 사례의 적용 기준"],
};

export function buildInquiry(input: InquiryInput): InquiryDraft {
  const { card, asOf } = input;
  const c = input.case as Case & { maturityDate?: string; applicationDate?: string; plannedRenewalDate?: string };

  const schedule: string[] = [];
  if (c.maturityDate) schedule.push(`대출 만기 ${fmt(c.maturityDate)}`);
  if (c.applicationDate) schedule.push(`신청(예정)일 ${fmt(c.applicationDate)}`);
  if (c.plannedRenewalDate) schedule.push(`연장 희망일 ${fmt(c.plannedRenewalDate)}`);
  // 이미 지난 만기도 긴급(가장 급함). 날짜 형식이 아니면 무시
  const iso = (d?: string): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const urgent = [c.maturityDate, c.applicationDate].filter(iso).some((d) => d <= addBusinessDays(asOf, 5));

  // facts.json의 resolved는 KB v2(후속 문서) 기준이다. v1 카드에서는 아직 열린 공백이므로 쟁점으로 남긴다.
  const issues: string[] = card.gapRefs.filter((g) => !(g.resolved && card.kb === "v2")).map((g) => `${g.topic} (${g.id})`);
  const decided = card.trace[card.trace.length - 1];
  if (decided) issues.push(`판정 단계 ${decided.step}: ${decided.result}`);
  if (card.verdict === "심사위") issues.push("여신심사위원회 인정 여부(불가피성 판단은 금융회사 자체 기준, G-05)");
  const openGapCount = card.gapRefs.filter((g) => !(g.resolved && card.kb === "v2")).length;
  // 안내 카드는 남은 쟁점이 있으면 질의(escalate), 없으면 재확인 요청
  const recheck = !INQUIRY_VERDICTS.includes(card.verdict) && !(card.verdict === "안내" && openGapCount > 0);
  if (recheck) issues.push("지점이 이 판정을 고객 상황에 그대로 적용하기 어렵다고 본 이유(지점 의견 참조)");

  return {
    kind: recheck ? "recheck" : "escalate",
    title: `[${recheck ? `재확인·${card.verdict}` : card.verdict}] ${card.headline.slice(0, 40)}${card.headline.length > 40 ? "…" : ""}`,
    module: card.module,
    kb: card.kb,
    asOf,
    verdict: card.verdict,
    question: input.question,
    followUps: input.followUps,
    summary: input.caseRows,
    policies: card.factRefs.map((f) => ({ id: f.id, source: f.source, text: f.text })),
    branchOpinion: `여신 사수 판정 '${card.verdict}': ${card.headline}`,
    ...(card.basis?.length ? { confirmed: card.basis.map((b) => `${b.label}: ${b.text} (${b.facts.join("·")})`) } : {}),
    issues: [...new Set(issues)],
    asks: recheck
      ? [`이 고객 상황에 '${card.verdict}' 판정을 그대로 적용해도 되는지`, "다르게 봐야 한다면 그 기준과 창구 안내 문구"]
      : (ASKS[card.verdict] ?? ["판정 기준 확인"]),
    schedule,
    documents: [...card.documents],
    gaps: [...card.gaps],
    dueDate: addBusinessDays(asOf, 3),
    urgent,
    key: faqKey(input.case, card),
    case: input.case,
  };
}
