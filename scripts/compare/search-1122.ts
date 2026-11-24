// 검색 발견력 비교(data/compare/search_1122/PLAN.md): 같은 검색어로 Liner Search API·MCP search_legal·Search Agent 실행.
// 실행: LOANDESK_CACHE_DIR=<빈 폴더> npx tsx --env-file=.env scripts/compare/search-1122.ts
import { writeFileSync } from "node:fs";
import { linerSearch } from "../../lib/liner/search";
import { linerAgent, linerDomainSearch } from "../../lib/liner/mcp";

const S: [string, string][] = [
  ["S1", "주택담보대출에 대한 리스크 관리 기준 행정지도 금융위원회"],
  ["S2", "비거주 1주택자 전세대출 경과조치 행정지도"],
  ["S3", "부동산 시장 안정을 위한 금융 종합대책 후속 행정지도 2026"],
  ["S4", "비거주 1주택자 전세대출 제한, 2026년 12월에 만기가 오는 전세대출을 연장하면 종전 규정이 적용되나요?"],
  ["S5", "8.13 대책 이후 전세대출을 연장하면서 대출금을 증액하면 바뀐 규정이 적용되나요?"],
  ["S6", "유주택자 전세대출 한도 2억원, 기존 집에 계속 살면서 연장하면 종전 한도가 유지되나요?"],
];
type Hit = { title?: string; url: string; tier?: number };
const isDoc = (r: Hit) => /postNo=4918/.test(r.url) || (/(^|\.)fsc\.go\.kr/.test(new URL(r.url).hostname) && /리스크\s?관리\s?기준/.test(r.title ?? ""));
const sum = (rs: Hit[]) => ({ n: rs.length, found: rs.some(isDoc), rank: rs.findIndex(isDoc) + 1 || null, official: rs.filter((r) => r.tier === 1).length });

async function timed<T>(f: () => Promise<T>) { const t = Date.now(); const v = await f(); return { v, ms: Date.now() - t }; }

async function main() {
  const out: Record<string, unknown>[] = [];
  for (const [id, q] of S) {
    const web = await timed(() => linerSearch(q, { maxResults: 10 }));
    const legal = await timed(() => linerDomainSearch("search_legal", q, 10));
    const row: Record<string, unknown> = { id, q, web: { ms: web.ms, ...sum(web.v), results: web.v }, legal: { ms: legal.ms, ...sum(legal.v), results: legal.v } };
    if (["S4", "S5", "S6"].includes(id)) {
      const ag = await timed(() => linerAgent(q));
      row.agent = { ms: ag.ms, ...sum(ag.v.references), text: ag.v.text, references: ag.v.references };
    }
    out.push(row);
    const a = row.agent as { found: boolean; n: number; official: number; ms: number } | undefined;
    console.log(id, "web", sum(web.v), `${web.ms}ms`, "| legal", sum(legal.v), `${legal.ms}ms`, a ? `| agent found=${a.found} refs=${a.n} official=${a.official} ${a.ms}ms` : "");
  }
  writeFileSync("data/compare/search_1122/liner.json", JSON.stringify(out, null, 1));
}
main();
