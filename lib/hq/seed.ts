// 시연용 예시 FAQ: 본점이 이미 회신·승인한 사례를 미리 쌓아 둔다(가상 A은행 내부 해석).
// C10(규제지역 해제)은 예시 FAQ를 두지 않는다(수도권이면 불허로 확정, 수도권 밖이면 최신 지정 현황 확인). C01·C10은 11/19 정답이 불허로 바뀜
// 판정·키는 테스트셋 정답 입력을 규칙 엔진에 넣어 만든다(LLM 없음). 회신 내용은 가상 A은행 지침 조항과 원문 공백(G-xx) 범위에서만 쓴다.
import gold from "@/data/eval/cases.slots.json";
import { judge } from "@/lib/rules";
import type { Case, KbVersion } from "@/lib/rules/types";
import type { FaqEntry } from "./faq";
import { faqKey } from "./inquiry";

const ASOF = "2026-11-13"; // 테스트셋 기준일

interface Seed {
  caseId: string;
  kb: KbVersion;
  question: string;
  approvedAt: string;
  hqConclusion: string;
  answer: string;
}

const SEEDS: Seed[] = [
  {
    caseId: "C05",
    kb: "v2",
    question: "집 사고 들어가려 했는데 계약 직후 지방 발령 나서 한 번도 못 살았대요. 이건 봐주죠?",
    approvedAt: "2026-11-05",
    hqConclusion: "근무지 변경으로 실거주하지 못한 건은 서류를 받아 여신심사위에 상정, 지점 확답 금지",
    answer:
      "판단 근거: 813FAQ의 인정 예시와 같은 유형이지만 인정 여부는 여신심사위원회가 정합니다(A은행 지침 제3조).\n받을 서류: 매매계약서, 발령 공문 또는 재직·근무지 증명, 매매계약일과 발령일의 선후를 보여 주는 자료.\n창구 안내: \"여신심사위원회 심사 후 결과를 안내드리겠습니다.\" 가능 여부를 약속하지 않습니다.",
  },
  {
    caseId: "C02",
    kb: "v2",
    question: "다주택 고객이 집 하나 팔기로 하고 가계약금만 넣었대요. 매도계약 예외 되나요?",
    approvedAt: "2026-11-06",
    hqConclusion: "가계약금만 보낸 건은 정부 해석이 나올 때까지 매도계약 예외로 처리하지 않음",
    answer:
      "판단 근거: 4.1 방안의 매도계약 예외에는 가계약 인정 여부가 없습니다(정부 발표 자료에 없음, G-03). A은행은 정부 해석이 나올 때까지 정식 매매계약서가 있는 경우만 예외로 검토합니다(A은행 지침 제5조 3항).\n창구 안내: \"정식 매매계약서가 확인되어야 예외 여부를 검토할 수 있습니다.\" 가계약만으로 된다고 답하지 않습니다.",
  },
  {
    caseId: "C06",
    kb: "v2",
    question: "고객이 옆 은행에서는 된다고 했대요. 우리도 해 주면 되죠?",
    approvedAt: "2026-11-11",
    hqConclusion: "다른 은행의 승인 사례는 근거로 쓰지 않고 A은행 심사 절차로 진행",
    answer:
      "판단 근거: 불가피성 인정은 금융회사가 스스로 판단하는 사항이라 은행마다 다를 수 있습니다(정부 발표 자료에 없음, G-05). A은행은 다른 금융회사의 승인 사례를 판단 근거로 쓰지 않습니다(A은행 지침 제3조 5항).\n창구 안내: \"은행마다 심사 기준이 달라 다른 은행 결과로 안내드릴 수 없습니다. A은행 심사 절차로 확인해 드리겠습니다.\"",
  },
  {
    // 판정 근거 자료 v1 시절의 회신. v2(8.28 행정지도 반영)에서는 판정이 바뀌어 '재검토 필요'로 표시된다.
    caseId: "B02",
    kb: "v1",
    question: "비거주 1주택 해당하는 고객인데 전세 만기가 올해 12/20이에요. 이번 연장도 막혀요?",
    approvedAt: "2026-09-15",
    hqConclusion: "정부 후속 지침이 나올 때까지 12월 만기 연장의 적용 기준 시점을 단정하지 않음",
    answer:
      "판단 근거: 보도자료·FAQ에는 시행일만 있고 이 건에 어느 시점 기준을 적용할지 없습니다(정부 발표 자료에 없음, G-02).\n창구 안내: \"정부 후속 지침을 확인한 뒤 안내드리겠습니다.\" 연장 가능·불가를 단정하지 않습니다.",
  },
];

const G = gold as unknown as Record<string, Case>;

/** 시연용 예시 FAQ(저장소가 아니라 코드에 있어 '데모 데이터 지우기'로 지워지지 않는다) */
export const SEED_FAQS: FaqEntry[] = SEEDS.map((s, i) => {
  const c = { ...G[s.caseId], asOf: ASOF } as Case;
  const v = judge({ ...c, kb: s.kb });
  return {
    id: `FAQ-E${i + 1}`,
    inquiryId: "예시",
    title: `[${v.verdict}] ${v.headline.slice(0, 40)}${v.headline.length > 40 ? "…" : ""}`,
    question: s.question,
    answer: s.answer,
    hqConclusion: s.hqConclusion,
    approvedAt: s.approvedAt,
    approver: "본점 여신기획부",
    kb: s.kb,
    verdictAtApproval: v.verdict,
    facts: v.facts,
    gaps: v.gaps,
    key: faqKey(c, v),
    case: c,
    example: true,
  };
});
