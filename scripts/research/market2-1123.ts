// 2금융권 시장 규모(기관·점포 수, 가계대출 잔액) 공식 통계 조사(기획서 §4 확장: 1금융권 → 2금융권). Liner Search API만 사용(1회 $0.001).
import { writeFileSync } from "node:fs";
import { linerSearch } from "../../lib/liner/search";

const Q = [
  "저축은행 수 점포 수 2025 금융감독원",
  "상호금융 조합 수 농협 수협 신협 산림조합 2025 금융감독원",
  "새마을금고 수 2025 행정안전부",
  "신협 조합 수 2025",
  "지역농협 조합 수 2025 농협",
  "비은행 예금취급기관 가계대출 잔액 2026 한국은행",
  "상호금융 가계대출 잔액 2025 금융감독원",
  "저축은행 가계대출 잔액 2025",
  "보험사 주택담보대출 잔액 2025 금융감독원",
  "제2금융권 가계대출 잔액 2026 금융위원회",
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
  writeFileSync("data/research_market/search2_1123.json", JSON.stringify(out, null, 1));
  for (const [q, r] of Object.entries(out)) {
    console.log(`\n## ${q}`);
    if (Array.isArray(r)) for (const x of r as { t: string; h: string; u: string; tier: number; d?: string; date?: string }[]) console.log(` [${x.tier}] ${x.date ?? ""} ${x.h} | ${x.t.slice(0, 60)}\n     ${(x.d ?? "").slice(0, 220)}`);
    else console.log(r);
  }
})();
