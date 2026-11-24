// 보증기관 자료 2차 조사(빈 곳 3곳): SGI 공식 상품요약서·약관, HUG 특약보증 규정·세칙, 주택도시기금 버팀목 업무처리지침.
// Liner Search API만(1회 $0.001). 원문은 공식 사이트에서 직접 받아 확인한다.
import { writeFileSync } from "node:fs";
import { linerSearch } from "../../lib/liner/search";

const Q = [
  "SGI서울보증 공시실 전세자금대출 보증보험 상품요약서",
  "SGI서울보증 개인임차 전세자금대출 보증 약관 pdf",
  "서울보증보험 전세대출 신용보험 보험약관 공시",
  "sgic.co.kr 상품공시 전세자금 보증보험 약관",
  "SGI서울보증 우량전세 전세자금대출 보증 유주택자 기준 변경",
  "주택도시보증공사 내규 전세자금대출특약보증 규정",
  "주택도시보증공사 개인보증 업무처리기준 전세자금대출특약보증 세칙",
  "alio 주택도시보증공사 내규 보증규정",
  "주택도시보증공사_보증상품별 약관 전세자금대출특약보증",
  "HUG 전세자금대출 특약보증 보증한도 유주택자 1주택",
  "주택도시기금 버팀목전세자금 업무처리지침",
  "nhuf.molit.go.kr 기금대출 업무처리지침 전세자금",
  "주택도시기금 업무처리지침 전세자금 증액 추가대출 연장",
  "버팀목 전세자금대출 기한연장 추가대출 기준 주택도시기금",
  "주택도시기금 대출 업무처리지침 개정 2026",
];
(async () => {
  const out: Record<string, unknown> = {};
  for (const q of Q) {
    try {
      out[q] = (await linerSearch(q, { maxResults: 8 })).map((x) => ({ t: x.title, u: x.url, h: x.hostname, tier: x.tier, d: x.description?.slice(0, 200) }));
    } catch (e) {
      out[q] = { error: (e as Error).message };
    }
  }
  writeFileSync("data/research_guarantor/search_1123b.json", JSON.stringify(out, null, 1));
  for (const [q, r] of Object.entries(out)) {
    console.log(`\n## ${q}`);
    if (Array.isArray(r)) for (const x of r as { t: string; h: string; u: string; tier: number }[]) if (/sgic|khug|molit|alio|data\.go|hf\.go|korea\.kr|law\.go/.test(x.h)) console.log(` [${x.tier}] ${x.h} | ${x.t.slice(0, 60)} | ${x.u.slice(0, 120)}`);
  }
})();
