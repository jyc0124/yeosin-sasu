// 새 상황 평가: 테스트셋 45개에 없는 사실관계(data/eval/novel_v0.json)로 추출+규칙 엔진 일반화 확인.
// 실행: npx tsx --env-file=.env scripts/eval-novel.ts [--no-cache] [--set=holdout|holdout2]
//   --set=holdout: 수정 전에 고정한 검증 세트(data/eval/novel_v1_holdout.json)
// 결과: data/eval/runs/novel_<timestamp>.json, 콘솔 요약
import { promises as fs } from "node:fs";
import path from "node:path";
import novel0 from "../data/eval/novel_v0.json";
import holdout from "../data/eval/novel_v1_holdout.json";
import holdout2 from "../data/eval/novel_v2_holdout.json";
import { extractCase } from "../lib/extract";
import { judge } from "../lib/rules";

async function main() {
  const useCache = !process.argv.includes("--no-cache");
  const set = process.argv.includes("--set=holdout2") ? "holdout2" : process.argv.includes("--set=holdout") ? "holdout" : "novel";
  const novel = set === "holdout2" ? holdout2 : set === "holdout" ? holdout : novel0;
  const rows = [];
  for (const c of novel.cases) {
    const row: Record<string, unknown> = { id: c.id, question: c.question, accept: c.accept, why: c.why };
    try {
      const ex = await extractCase({ question: c.question, asOf: novel.base_date }, { useCache });
      row.module = ex.module;
      row.assumptions = ex.assumptions;
      row.warnings = ex.warnings;
      row.case = ex.case;
      if (ex.module === "OUT" || !ex.case) {
        row.got = "OUT";
      } else {
        const v = judge({ ...ex.case, kb: "v2" });
        row.got = v.verdict;
        row.headline = v.headline;
        row.conditions = v.conditions;
        row.questions = v.questions;
        row.facts = v.facts;
        row.trace = v.trace.map((t) => `${t.step}: ${t.result}`);
      }
    } catch (e) {
      row.error = (e as Error).message;
    }
    row.ok = c.accept.includes(row.got as string);
    rows.push(row);
    console.log(`${row.ok ? "✓" : "✗"} ${c.id} 기대 ${c.accept.join("/")} → ${row.got ?? "오류"}${row.headline ? ` | ${row.headline}` : ""}${row.error ? ` | ${row.error}` : ""}`);
  }
  const ok = rows.filter((r) => r.ok).length;
  console.log(`\n정답 ${ok}/${rows.length}`);
  const out = path.join("data/eval/runs", `${set}_${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await fs.writeFile(out, JSON.stringify({ ok, total: rows.length, rows }, null, 2));
  console.log(out);
}

main();
