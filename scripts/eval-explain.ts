// 설명 문장 검증 평가: 45문항 판정 카드(KB v2, 정답 입력)로 안내 문구를 만들고 원문 대조 통과율·탈락 사유를 본다.
// 실행: npm run eval:explain [-- --no-cache] [--verbose]
// 결과: data/eval/runs/explain_<timestamp>.json
import { promises as fs } from "node:fs";
import path from "node:path";
import testset from "../data/eval/testset.json";
import gold from "../data/eval/cases.slots.json";
import { explain } from "../lib/explain";
import { judge, type Case } from "../lib/rules";

const G = gold as unknown as Record<string, Case>;

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const useCache = !args.includes("--no-cache");
  const rows = await pool(testset.cases, 4, async (tc) => {
    const c = { ...G[tc.id], asOf: testset.base_date };
    const card = judge({ ...c, kb: "v2" });
    try {
      const e = await explain({ question: tc.question, card }, { useCache });
      return { id: tc.id, verdict: card.verdict, all: e.all, ms: e.ms };
    } catch (err) {
      return { id: tc.id, verdict: card.verdict, all: [], ms: 0, error: (err as Error).message };
    }
  });

  const sentences = rows.flatMap((r) => r.all.map((s) => ({ id: r.id, verdict: r.verdict, ...s })));
  const passed = sentences.filter((s) => s.ok).length;
  const cardsWithText = rows.filter((r) => r.all.some((s) => s.ok)).length;
  const reasons = new Map<string, number>();
  for (const s of sentences) for (const r of s.reasons) reasons.set(r.replace(/\(.*\)/, ""), (reasons.get(r.replace(/\(.*\)/, "")) ?? 0) + 1);

  for (const s of sentences.filter((x) => !x.ok || args.includes("--verbose")))
    console.log(`${s.ok ? " ok" : "REJ"} ${s.id} [${s.verdict}] ${s.text} {${s.facts.join(",")}} ${s.reasons.join("; ")}`);
  console.log(
    `\n문장 ${sentences.length}개 중 통과 ${passed} (${((100 * passed) / Math.max(1, sentences.length)).toFixed(1)}%) · 안내 문구가 1문장 이상 남은 카드 ${cardsWithText}/${rows.length} · 오류 ${rows.filter((r) => r.error).length}`,
  );
  console.log("탈락 사유:", Object.fromEntries(reasons));

  const dir = path.join(process.cwd(), "data", "eval", "runs");
  const at = new Date().toISOString();
  await fs.writeFile(
    path.join(dir, `explain_${at.replace(/[:.]/g, "-").slice(0, 19)}.json`),
    JSON.stringify({ at, summary: { sentences: sentences.length, passed, cardsWithText, cards: rows.length, reasons: Object.fromEntries(reasons) }, rows }, null, 1),
  );
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
