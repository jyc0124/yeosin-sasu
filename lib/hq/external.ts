// F3 외부기관 문의(가상 A은행 지침 제6조 5항): 본점도 원문으로 답할 수 없는 쟁점을 정부·보증기관에 묻는 단계.
// 현장 관찰(현직 지점 직원, 2026-11-17): 가장 오래 걸리는 건 본점이 외부기관(HUG, 국토부 등) 문의 게시판에 글을 올리고 기다릴 때.
// 그래서 (1) 외부에 물을 쟁점과 물을 필요 없는 쟁점(금융회사 자체 판단)을 코드로 가르고,
// (2) 고객 정보 없이 쟁점·원문 조항만 담은 질의문을 결정적으로 만들고(LLM 없음),
// (3) 같은 쟁점으로 이미 외부 문의 중이면 새로 올리지 않고 묶는다.
import { resolveGaps } from "@/lib/kb";
import { lastResearch, researchLine } from "@/lib/research/history";
import type { InquiryDraft } from "./inquiry";

export interface ExternalTarget {
  agency: string; // 문의 기관
  channel: string; // 문의 경로
  gapIds: string[];
  basis: string; // 이 기관에 묻는 이유(원문 근거)
}

export interface ExternalPlan {
  needed: boolean;
  targets: ExternalTarget[];
  /** 외부 문의 대상이 아닌 공백: 정책이 금융회사 자체 판단에 맡긴 것 */
  internal: { gapId: string; topic: string; reason: string }[];
  /** 외부기관에 보낼 질의문(고객 정보 없음). needed가 false면 빈 문자열 */
  text: string;
  /** 외부 문의가 필요 없을 때 이유 */
  noneReason?: string;
}

type Route = { agency: string; channel: string; basis: string } | { internal: string };

const FSC_PORTAL = "금융규제·법령해석포털 법령해석 질의(better.fsc.go.kr)";

/** 원문 공백별 문의처. 문서 발행 기관 = 해석 권한이 있는 곳 (data/factsheet.md 출처 표·Part 4) */
export const GAP_ROUTES: Record<string, Route> = {
  "G-01": { agency: "금융위원회", channel: FSC_PORTAL, basis: "8.28 행정지도가 실거주 이력 증빙을 차주 의무로 정했으나 인정 서류를 정하지 않음(F828-03)" },
  "G-02": { agency: "금융위원회", channel: FSC_PORTAL, basis: "8.13 대책 보도자료·FAQ에 전세대출 경과조치 기준 시점이 없음" },
  "G-03": { agency: "금융위원회", channel: FSC_PORTAL, basis: "4.1 FAQ 매도계약 예외에 가계약 인정 여부 언급 없음" },
  "G-04": { agency: "금융위원회", channel: FSC_PORTAL, basis: "소득 감소 시 DSR 산정 세부 가이드라인 미발표" },
  "G-05": { internal: "8.13 FAQ가 불가피성 판단을 금융회사 여신심사위원회에 맡김 → A은행 지침 제3조·심사위로 결정" },
  "G-06": { internal: "4.1 FAQ가 '주된 영업' 판단을 금융회사에 맡김 → A은행 지침 제2조로 결정" },
  "G-07": { agency: "국토교통부", channel: "규제지역 지정 공고 확인 후, 없으면 국토교통부 민원 질의", basis: "규제지역(조정대상지역·투기과열지구) 지정은 시점에 따라 바뀜" },
  "G-09": { agency: "금융위원회", channel: FSC_PORTAL, basis: "정부 발표 자료가 이 사실(분양권·입주권·오피스텔 등)을 주택 수·규제 대상·예외 판단에 어떻게 반영할지 정하지 않음" },
  "G-10": { agency: "금융위원회", channel: FSC_PORTAL, basis: "4.1 예외 ➊ '임차인이 있는 경우'가 담보 주택의 임차인만인지 정하지 않음(F401-06)" },
  "G-11": { agency: "금융위원회", channel: FSC_PORTAL, basis: "4.1 임대차계약종료일 정의의 묵시적 갱신 '체결' 시점을 정하지 않음(F401-06)" },
  "G-12": { agency: "금융위원회", channel: FSC_PORTAL, basis: "8.28 행정지도 경과조치가 증액 시 변경 규정 적용 범위(전체·증액분)를 정하지 않음(F828-01)" },
  "G-13": { agency: "금융위원회", channel: FSC_PORTAL, basis: "세대 범위는 은행업감독규정 <별표6>으로 확인(F401-20). 남은 것: HOMS 조회 동의 대상, 비은행 업권 정의, 부부 공동명의 1채 산정(F401-01·F828-08)" },
  "G-14": { agency: "전세대출 보증기관(HUG·HF·SGI)", channel: "보증기관 업무 문의 게시판", basis: "보증기관 내규의 주택 수 산정 가족 범위(동거 부모·세대원)가 공개 자료에 없음(정부 자료는 규제별 기준만: F813-01·F828-09·F828-11)" },
  "G-15": { agency: "금융위원회", channel: FSC_PORTAL, basis: "8.28 행정지도가 만기연장(만기도래 기준)과 신규(신청일 기준)만 구분하고 증액 목적 대환의 분류를 정하지 않음(F828-01·F828-02)" },
  "G-08": { agency: "행정안전부", channel: "인구감소지역 지정 고시 확인 후, 없으면 행정안전부 민원 질의", basis: "4.1 예외 ➏은 인구감소(관심)지역을 행정안전부 지정에 맡김" },
};

/** 8.13 전세 규제는 보증기관 내규 개정으로 시행된다(F813-09). 8.13 전세 쟁점(G-01 실거주, G-02 시행 시점)은 금융위 해석과 함께 보증기관 내규도 확인한다. */
const GUARANTOR_GAPS = ["G-01", "G-02", "G-12", "G-15"];
const GUARANTOR: Omit<ExternalTarget, "gapIds"> = {
  agency: "전세대출 보증기관(HUG 등)",
  channel: "보증기관 업무 문의 게시판",
  basis: "8.13 전세대출 제한은 행정지도·보증기관 내규 개정으로 시행(F813-09)",
};

/** 질의서에서 아직 열린 공백(v2에서 해소된 공백은 제외 — buildInquiry와 같은 기준) */
function openGaps(d: Pick<InquiryDraft, "gaps" | "kb">) {
  return resolveGaps(d.gaps).filter((g) => !(g.resolved && d.kb === "v2"));
}

export function planExternal(d: InquiryDraft): ExternalPlan {
  const gaps = openGaps(d);
  const byAgency = new Map<string, ExternalTarget>();
  const internal: ExternalPlan["internal"] = [];
  for (const g of gaps) {
    const r = GAP_ROUTES[g.id];
    if (!r) continue;
    if ("internal" in r) {
      internal.push({ gapId: g.id, topic: g.topic, reason: r.internal });
      continue;
    }
    const t = byAgency.get(r.agency) ?? { agency: r.agency, channel: r.channel, gapIds: [], basis: r.basis };
    if (!t.gapIds.includes(g.id)) t.gapIds.push(g.id);
    byAgency.set(r.agency, t);
  }
  const targets = [...byAgency.values()];
  const gGaps = targets.flatMap((t) => t.gapIds).filter((id) => GUARANTOR_GAPS.includes(id));
  if (gGaps.length > 0) targets.push({ ...GUARANTOR, gapIds: gGaps });

  const needed = targets.length > 0;
  let noneReason: string | undefined;
  if (!needed) {
    if (internal.length > 0) noneReason = "정책이 금융회사 자체 판단에 맡긴 사항이라 외부기관에 물어도 답이 오지 않습니다. 본점이 A은행 지침·여신심사위로 결정합니다.";
    else if (d.verdict === "심사위") noneReason = "여신심사위원회 상정 사항입니다. 외부기관 문의 없이 본점·심사위가 결정합니다.";
    else if (d.verdict === "내부지침") noneReason = "A은행 내부 기준 사항입니다. 외부기관 문의 없이 본점이 기준을 정합니다.";
    else noneReason = "정부 발표 자료가 후속 발표를 예고한 사항입니다. 외부 문의 대신 정책 감시(Liner)로 발표를 기다립니다.";
  }
  return { needed, targets, internal, noneReason, text: needed ? externalText(d, gaps.filter((g) => targets.some((t) => t.gapIds.includes(g.id)))) : "" };
}

const MODULE_LABEL: Record<string, string> = {
  M0: "8.13·4.1 대책",
  M1: "8.13 비거주 1주택자 전세대출 제한",
  M2: "4.1 다주택자 주담대 만기연장 제한",
};

/** 외부기관 질의문: 고객 상황 원문·지점 의견·일정은 넣지 않는다(외부 게시판은 공개될 수 있음). */
function externalText(d: InquiryDraft, gaps: { id: string; topic: string; note: string }[]): string {
  const facts = d.policies.map((p) => `- ${p.source} (${p.id}): ${p.text}`);
  const lines = [
    `[해석 요청] ${MODULE_LABEL[d.module] ?? d.module} — ${gaps.map((g) => g.topic).join(" / ")}`,
    "",
    "1. 질의 요지",
    ...gaps.map((g, i) => `  ${i + 1}) ${g.topic}에 대한 해석을 요청합니다.`),
    // G-09: 어떤 사실이 기준에 없는지 구체적으로(질문 원문 전체가 아니라 그 사실만)
    ...("unmodeled" in d.case && d.case.unmodeled?.length ? [`  - 판정 기준이 확인되지 않는 사실: ${d.case.unmodeled.join(", ")}`] : []),
    "",
    "2. 관련 정부 발표 자료 조항",
    ...facts,
    "",
    "3. 정부 발표 자료에서 확인되지 않는 부분",
    // 외부에 묻기 전에 공개 자료를 먼저 확인했다는 기록(Liner 사전 조사, 원문 대조 완료분)이 있으면 그것을 쓴다
    ...gaps.map((g) => {
      const r = lastResearch(g.id);
      return r ? `- ${g.topic}: ${researchLine(r)}. 공개된 공식 자료에서 기준을 찾지 못해 문의합니다.` : `- ${g.topic}: ${g.note.split("·")[0].trim()}`;
    }),
    "",
    "4. 요청 사항",
    "- 위 쟁점에 대한 판단 기준(인정 서류·적용 시점 등)과 그 근거",
    "- 기준이 정해지기 전 금융회사 창구의 안내 방법",
    "",
    "※ 개별 고객 정보는 포함하지 않았습니다. 가상 A은행 본점 여신기획부.",
  ];
  return lines.join("\n");
}

/** 같은 쟁점(FAQ 키)으로 이미 외부기관 회신을 기다리는 질의 */
export function findOpenExternal<T extends { id: string; key: string; status: string }>(inquiries: T[], key: string, exceptId?: string): T | undefined {
  return inquiries.find((q) => q.key === key && q.status === "external" && q.id !== exceptId);
}
