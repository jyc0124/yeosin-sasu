// 시장 규모(은행 수·점포 수·전세대출·주담대 잔액) 공식 통계 조사(기획서 §5 확장성). Liner Search API만 사용(1회 $0.001).
import { writeFileSync } from "node:fs";
import { linerSearch } from "../../lib/liner/search";

const Q = [
  "금융감독원 국내 은행 점포 수 현황 2025",
  "은행 영업점 수 감소 2025년말 금감원",
  "국내 은행 수 시중은행 지방은행 인터넷전문은행 특수은행 현황",
  "은행 전세자금대출 잔액 2025 한국은행",
  "전세대출 잔액 200조 2026",
  "은행 주택담보대출 잔액 2026 한국은행 금융시장 동향",
  "가계대출 잔액 2026년 10월 한국은행",
  "국내 은행 임직원 수 2025 금융감독원",
  "은행 가계대출 규제 6.27 대책 전세대출 보증 비율",
  "금융권 생성형 AI 도입 은행 내부 업무 2026",
];
(async () => {
  const out: Record<string, unknown> = {};
  for (const q of Q) {
    try {
      const r = await linerSearch(q, { maxResults: 8 });
      out[q] = r.map((x) => ({ t: x.title, u: x.url, h: x.hostname, tier: x.tier, d: x.description?.slice(0, 300), date: x.date }));
    } catch (e) {
      out[q] = { error: (e as Error).message };
    }
  }
  writeFileSync("data/research_market/search_1123.json", JSON.stringify(out, null, 1));
  for (const [q, r] of Object.entries(out)) {
    console.log(`\n## ${q}`);
    if (Array.isArray(r)) for (const x of r as { t: string; h: string; u: string; tier: number; d?: string; date?: string }[]) console.log(` [${x.tier}] ${x.date ?? ""} ${x.h} | ${x.t.slice(0, 60)}\n     ${(x.d ?? "").slice(0, 200)}`);
    else console.log(r);
  }
})();
