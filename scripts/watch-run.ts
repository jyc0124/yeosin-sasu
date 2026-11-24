// 정책 감시 파이프라인을 콘솔에서 실행: npm run watch:run [-- --fresh]
// --fresh: 검색·Router 캐시를 쓰지 않음(실제 호출)
import { discover } from "../lib/watch/discover";
import { fetchOriginal, getOriginal } from "../lib/watch/original";
import { structureClauses } from "../lib/watch/structure";
import { impact } from "../lib/watch/impact";

async function main() {
  const fresh = process.argv.includes("--fresh");
  const t0 = Date.now();
  const { runs, docs } = await discover({ ttlMs: fresh ? 1 : undefined });
  console.log("① 감시 질의");
  for (const r of runs) console.log(`  ${r.tool.padEnd(12)} ${r.trusted}/${r.total} 신뢰 출처 ${r.ms}ms ${r.error ?? ""} | ${r.q}`);
  console.log(`② 문서 ${docs.length}건`);
  for (const d of docs) console.log(`  [${d.status}] T${d.tier} ${d.date ?? "날짜 미상"} ${d.title.slice(0, 50)}${d.originalId ? ` ← 원문 ${d.originalId}` : ""}${d.knownAs ? ` (= ${d.knownAs})` : ""}`);

  const target = docs.find((d) => d.status === "new" && d.originalId);
  if (!target) {
    console.log("새 공식 문서 중 원문이 등록된 것이 없습니다.");
    return;
  }
  const original = getOriginal(target.originalId!)!;
  const orig = await fetchOriginal(original, target.url);
  console.log(`③ 원문 ${orig.download.ok ? `${orig.download.bytes}B ${orig.download.ms}ms` : orig.download.error} 해시일치=${orig.hashMatch} 섹션 ${orig.sections.length}개`);

  const s = await structureClauses(original, orig.sections, { useCache: !fresh });
  console.log(`④⑤ 조항 ${s.clauses.length}개 (${s.ms}ms, ${s.models.join("+")})`);
  for (const c of s.clauses)
    console.log(`  [${c.diff}] ${c.policy} ${c.topic} ${c.verified ? "원문✓" : "원문✗"} ${c.match ? `${c.match.id}(${c.match.score})` : "-"} | ${c.quote.slice(0, 70)}`);

  const im = impact();
  console.log(`⑥ 판정이 바뀌는 문항 ${im.changed.length}/${im.total}: ${im.changed.map((c) => `${c.id} ${c.v1}→${c.v2}`).join(", ")}`);
  console.log(`총 ${Date.now() - t0}ms`);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
