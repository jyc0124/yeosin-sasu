// 보증기관(HUG·HF·SGI) 전세대출 보증 공개 문서 조사(현장 피드백 11/22 ③). Liner Search API만 사용(1회 $0.001).
// 판정 근거로 쓰지 않는다 — '기관 확인 자료'로 연결할 공식 문서가 있는지 확인하는 조사.
import { writeFileSync } from "node:fs";
import { linerSearch } from "../../lib/liner/search";

const Q = [
  "HUG 전세자금대출 특약보증 보증한도 소득 금융비용부담률",
  "주택도시보증공사 전세자금대출 특약보증 상품 안내",
  "HUG 안심전세 전세자금보증 무주택 보증한도",
  "주택도시보증공사 전세자금보증 연장 보증금 증액 추가 대출",
  "khug.or.kr 전세자금대출 특약보증 보증대상 보증한도",
  "한국주택금융공사 전세자금보증 보증한도 소득 기준",
  "한국주택금융공사 일반전세지킴보증 전세자금보증 상품",
  "주택금융공사 전세자금보증 연장 증액 보증",
  "hf.go.kr 전세자금보증 주택보유수 기준",
  "주택금융공사 전세자금보증 세대원 주택 보유 확인",
  "SGI서울보증 전세자금대출 보증 개인임차 보증한도",
  "서울보증보험 전세금 보장 신용보험 전세자금대출 보증 상품 안내",
  "버팀목 전세자금대출 연장 추가대출 HUG HF 차이",
  "주택도시기금 버팀목 전세자금 증액 연장 기준",
  "전세대출 보증 유주택자 보증 제한 HUG HF SGI 2억원",
  "HUG 전세자금대출 특약보증 개정 2025",
  "한국주택금융공사 전세자금보증 개정 시행 2026",
  "주택도시보증공사 보증규정 전세자금 특약보증 세칙",
];
(async () => {
  const out: Record<string, unknown> = {};
  for (const q of Q) {
    try {
      const r = await linerSearch(q, { maxResults: 8 });
      out[q] = r.map((x) => ({ t: x.title, u: x.url, h: x.hostname, tier: x.tier, d: x.description?.slice(0, 220), date: x.date }));
    } catch (e) {
      out[q] = { error: (e as Error).message };
    }
  }
  writeFileSync("data/research_guarantor/search_1123.json", JSON.stringify(out, null, 1));
  for (const [q, r] of Object.entries(out)) {
    console.log(`\n## ${q}`);
    if (Array.isArray(r)) for (const x of r as { t: string; h: string; u: string; tier: number }[]) console.log(` [${x.tier}] ${x.h} | ${x.t.slice(0, 60)} | ${x.u.slice(0, 110)}`);
    else console.log(r);
  }
})();
