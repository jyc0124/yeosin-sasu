// 해석 쟁점(원문 공백 G-ID)별 Liner 사전 조사 이력. 클라이언트·서버 공용(데이터만 읽는다).
// 이력은 원문 대조까지 마친 조사만 담는다(data/liner_spike/interpret_1119/REPORT.md).
import data from "@/data/kb/gap_research.json";

export interface ResearchRun {
  date: string;
  method: string;
  sources: number; // 훑은 출처 수(중복 제거)
  official: number; // 그중 공식 출처(1등급) 수
  result: string; // 원문 대조 후 결론
  files: string[];
}
interface GapResearch {
  queries: string[];
  runs: ResearchRun[];
}

const GAPS = (data as { gaps: Record<string, GapResearch> }).gaps;

/** 가장 최근 조사 */
export const lastResearch = (gapId: string): ResearchRun | undefined => GAPS[gapId]?.runs.at(-1);

/** '지금 다시 조사'에 쓰는 검색 질의(이력이 없는 공백은 공백 주제로 만든다) */
export const researchQueries = (gapId: string, topic: string): string[] => GAPS[gapId]?.queries ?? [topic.replace(/[()「」"“”]/g, " ").slice(0, 60)];

const fmt = (d: string) => `${d.slice(5, 7).replace(/^0/, "")}.${d.slice(8, 10).replace(/^0/, "")}`;

/** 화면용 한 줄: "Liner 사전 조사(11.19): 공식 출처 30건 확인 · 공식 근거 없음" */
export const researchLine = (r: ResearchRun) => `Liner 사전 조사(${fmt(r.date)}): 공식 출처 ${r.official}건 확인 · ${r.result}`;
