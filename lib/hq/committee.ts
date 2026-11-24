// 여신심사위원회 상정(가상 A은행 지침 제3조): 본점이 상정을 결정하면 지점은 서류만 받고, 안건 등록·개최일은 본점이 맡는다.
// 날짜 계산은 결정적 코드로 한다(LLM 없음). 공휴일은 반영하지 않는다(주말만 제외).
import type { InquiryDraft } from "./inquiry";

export type CommitteeStage = "docs" | "submitted" | "decided";
export type CommitteeResult = "승인" | "부결";

export interface Committee {
  /** docs: 지점 서류 접수 대기 · submitted: 안건 등록(개최 대기) · decided: 심사 결과 나옴 */
  stage: CommitteeStage;
  docs: string[];
  requestedAt: string; // 본점 상정 결정일
  receivedAt?: string; // 지점 서류 접수 완료일
  meeting?: string; // 개최일(둘째·넷째 주 수요일)
  deadline?: string; // 상정 마감(개최일 3영업일 전)
  result?: CommitteeResult;
  resultNote?: string;
  decidedAt?: string;
}

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

/** 주말을 건너뛰고 n영업일 전 */
export function subBusinessDays(iso: string, n: number): string {
  const d = toDate(iso);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() - 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) left--;
  }
  return toIso(d);
}

/** 그 달의 둘째·넷째 주 수요일 */
function wednesdays(year: number, month0: number): string[] {
  const first = new Date(Date.UTC(year, month0, 1));
  const offset = (3 - first.getUTCDay() + 7) % 7; // 첫 수요일까지
  return [8, 22].map((add) => toIso(new Date(Date.UTC(year, month0, 1 + offset + add - 1))));
}

/** 지침 제3조 4항: 서류를 받은 날(from) 기준으로 상정 마감이 지나지 않은 가장 이른 개최일 */
export function nextMeeting(from: string): { meeting: string; deadline: string } {
  const d = toDate(from);
  for (let i = 0; i < 3; i++) {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + i;
    for (const meeting of wednesdays(y + Math.floor(m / 12), m % 12)) {
      const deadline = subBusinessDays(meeting, 3);
      if (deadline >= from) return { meeting, deadline };
    }
  }
  throw new Error(`개최일 계산 실패: ${from}`);
}

/** 상정 서류: 판정 카드의 징구 서류. 없으면 지침 제3조 3항의 '그 밖의 불가피성' 기본값 */
export function committeeDocs(q: Pick<InquiryDraft, "documents">): string[] {
  const docs = (q.documents ?? []).filter(Boolean);
  return docs.length ? docs : ["사유를 객관적으로 보여 주는 공적 서류"];
}

/** 단계별 창구 안내 문구(지침 제3조 2항: 결과를 약속하지 않는다) */
export function committeeNotice(c: Committee): string {
  if (c.stage === "docs") return "고객에게는 \"여신심사위원회 심사 후 결과를 안내드리겠습니다\"라고 하고 가능 여부를 약속하지 마세요(지침 제3조 2항).";
  if (c.stage === "submitted") return `본점이 안건으로 올렸습니다. 고객에게는 "${c.meeting ? fmtKo(c.meeting) : "다음"} 여신심사위원회 심사 후 결과를 안내드리겠습니다"라고 하세요.`;
  return c.result === "승인" ? "심사위가 승인했습니다. 회신 조건대로 처리하고 고객에게 결과를 안내하세요." : "심사위가 인정하지 않았습니다. 고객에게 결과와 사유를 안내하세요.";
}

const fmtKo = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
