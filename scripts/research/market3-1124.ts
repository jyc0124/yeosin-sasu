// 2금융권 주택담보대출·전세대출 규모 확인(11/24, 외부 조사 내용 검증용). Liner Search API만 사용(1회 $0.001).
import { writeFileSync } from "node:fs";
import { linerSearch } from "../../lib/liner/search";

const Q = [
  "2026년 10월 가계대출 동향 제2금융권 주택담보대출 금융위원회",
  "보험연구원 제2금융권 주택담보대출 잔액 161조",
  "비은행 예금취급기관 주택담보대출 잔액 한국은행 2026",
  "제2금융권 전세자금대출 잔액 비중 업권별",
  "상호금융 주택담보대출 잔액 2025 금융감독원",
];
(async () => {
  const out: Record<string, unknown> = {};
  for (const q of Q) {
    try {
      const r = await linerSearch(q, { maxResults: 8 });
      out[q] = r.map((x) => ({ t: x.title, u: x.url, h: x.hostname, tier: x.tier, d: x.description?.slice(0, 400), date: x.date }));
    } catch (e) {
      out[q] = { error: (e as Error).message };
    }
  }
  writeFileSync("data/research_market/search3_1124.json", JSON.stringify(out, null, 1));
  for (const [q, r] of Object.entries(out)) {
    console.log(`\n## ${q}`);
    if (Array.isArray(r)) for (const x of r as { t: string; h: string; tier: number; d?: string; date?: string }[]) console.log(` [${x.tier}] ${x.date ?? ""} ${x.h} | ${x.t.slice(0, 60)}\n     ${(x.d ?? "").slice(0, 300)}`);
    else console.log(r);
  }
})();
