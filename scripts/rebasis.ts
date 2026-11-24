// 기준 답변만 다시 하기: 저장된 평가 결과의 기준 질문(module Q 또는 '+기준')에서 저장된 질의(subQuestions·regs·concepts)로
// lib/basis만 다시 돌린다. 추출(Liner 비용의 대부분)은 다시 하지 않는다 — 기준 답변 코드·절 데이터를 바꿨을 때 쓴다.
// 실행: npx tsx --env-file=.env scripts/rebasis.ts data/eval/runs/<결과>.json [--show]
import { readFileSync } from "node:fs";
import { answerBasis, type BasisQuery } from "../lib/basis";

type R = { id: string; expect?: string; got?: string; module?: string; case?: Record<string, unknown> };
const file = process.argv[2];
const raw = JSON.parse(readFileSync(file, "utf8")) as R[] | { rows: R[] };
const rows = Array.isArray(raw) ? raw : raw.rows;
const queryOf = (r: R): BasisQuery | undefined => {
  const c = r.case ?? {};
  if (r.module === "Q") return { subQuestions: (c.subQuestions as string[]) ?? [], regs: (c.regs as string[]) ?? [], concepts: (c.concepts as string[]) ?? [] };
  if (r.module?.endsWith("+기준") && c.basis) return c.basis as BasisQuery;
  return undefined;
};
async function main() {
  let before = 0, after = 0, n = 0;
  for (const r of rows) {
    const q = queryOf(r);
    if (!q) continue;
    n++;
    const b = await answerBasis(q, { kb: "v2", useCache: false });
    const exp = (r.expect ?? "").split("|");
    if (exp.includes(r.got ?? "")) before++;
    if (exp.includes(b.card.verdict)) after++;
    console.log(`${r.id}: ${r.got} → ${b.card.verdict} (기대 ${r.expect ?? "-"})`);
    if (process.argv.includes("--show")) {
      console.log(`  → ${b.card.headline}`);
      for (const x of b.card.basis ?? []) console.log(`    · ${x.label.slice(0, 40)} :: ${x.text} [${x.facts.join(",")}]`);
    }
  }
  console.log(`기준 질문 ${n}건 · 허용 범위 ${before} → ${after}`);
}
main();
