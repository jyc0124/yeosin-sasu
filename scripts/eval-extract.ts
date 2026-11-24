// 추출 정확도 평가: 질문 → Liner Router 추출 → 규칙 엔진 → 기대 판정(v2·v1)과 비교.
// 실행: npm run eval:extract [-- A01 B12 ...] [--no-cache] [--set=paraphrase]
//   --set=paraphrase: 표현만 바꾼 문항(data/eval/paraphrase_v0.json, 정답은 원 문항 것)으로 일반화 확인
// 결과: data/eval/runs/extract_<timestamp>.json, 콘솔 요약
import { promises as fs } from "node:fs";
import path from "node:path";
import testset from "../data/eval/testset.json";
import gold from "../data/eval/cases.slots.json";
import paraphrase from "../data/eval/paraphrase_v0.json";
import { extractCase, type Extraction } from "../lib/extract";
import { judge, type Case, type KbVersion } from "../lib/rules";

interface Row {
  id: string;
  of: string;
  question: string;
  expected: { v2: string; v1: string };
  got?: { v2: string; v1: string };
  ok: { v2: boolean; v1: boolean; module: boolean };
  module: { gold: string; got: string };
  slotDiff: string[];
  assumptions: string[];
  warnings: string[];
  case?: Case;
  ms: number;
  error?: string;
}

const G = gold as unknown as Record<string, Case>;

/** gold와 추출 결과의 항목 차이(경로: gold → got). asOf·kb는 비교하지 않는다. */
function diff(a: unknown, b: unknown, p = ""): string[] {
  if (Array.isArray(a) || Array.isArray(b)) {
    const A = (a ?? []) as unknown[];
    const B = (b ?? []) as unknown[];
    const n = Math.max(A.length, B.length);
    return Array.from({ length: n }, (_, i) => diff(A[i], B[i], `${p}[${i}]`)).flat();
  }
  if ((a && typeof a === "object") || (b && typeof b === "object")) {
    const A = (a ?? {}) as Record<string, unknown>;
    const B = (b ?? {}) as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(A), ...Object.keys(B)])].filter((k) => k !== "asOf" && k !== "kb" && k !== "label");
    return keys.flatMap((k) => diff(A[k], B[k], p ? `${p}.${k}` : k));
  }
  return a === b ? [] : [`${p}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`];
}

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
  const ids = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--set");
  const asOf = testset.base_date;
  const setIdx = args.indexOf("--set");
  const set = args.find((a) => a.startsWith("--set="))?.slice(6) ?? (setIdx >= 0 ? args[setIdx + 1] : "testset");
  if (set !== "testset" && set !== "paraphrase") throw new Error(`알 수 없는 세트: ${set}`);
  const byId = new Map(testset.cases.map((c) => [c.id, c]));
  const source =
    set === "paraphrase"
      ? paraphrase.cases.map((p) => {
          const orig = byId.get(p.of);
          if (!orig || !G[p.of]) throw new Error(`${p.id}: 원 문항 ${p.of}가 테스트셋·gold에 없음`);
          return { ...orig, id: p.id, of: p.of, question: p.question };
        })
      : testset.cases.map((c) => ({ ...c, of: c.id }));
  const cases = source.filter((c) => !ids.length || ids.includes(c.id));

  const rows = await pool(cases, 4, async (tc): Promise<Row> => {
    const base: Row = {
      id: tc.id,
      of: tc.of,
      question: tc.question,
      expected: { v2: tc.expected, v1: tc.expected_v1 },
      ok: { v2: false, v1: false, module: false },
      module: { gold: G[tc.of].module, got: "-" },
      slotDiff: [],
      assumptions: [],
      warnings: [],
      ms: 0,
    };
    let ex: Extraction;
    try {
      ex = await extractCase({ question: tc.question, asOf }, { useCache });
    } catch (e) {
      return { ...base, error: (e as Error).message };
    }
    base.module.got = ex.module;
    base.ok.module = ex.module === base.module.gold;
    base.assumptions = ex.assumptions;
    base.warnings = ex.warnings;
    base.ms = ex.ms;
    if (!ex.case) return base;
    const run = (kb: KbVersion) => judge({ ...ex.case!, kb }).verdict;
    let got: { v2: string; v1: string };
    try {
      got = { v2: run("v2"), v1: run("v1") };
    } catch (e) {
      return { ...base, case: ex.case, error: `엔진 오류: ${(e as Error).message}` };
    }
    return {
      ...base,
      case: ex.case,
      got,
      ok: { ...base.ok, v2: got.v2 === tc.expected, v1: got.v1 === tc.expected_v1 },
      slotDiff: diff(G[tc.of], ex.case),
    };
  });

  const n = rows.length;
  const cnt = (f: (r: Row) => boolean) => rows.filter(f).length;
  const pct = (k: number) => `${k}/${n} (${((100 * k) / n).toFixed(1)}%)`;
  const summary = {
    set,
    at: new Date().toISOString(),
    asOf,
    n,
    module: cnt((r) => r.ok.module),
    v2: cnt((r) => r.ok.v2),
    v1: cnt((r) => r.ok.v1),
    both: cnt((r) => r.ok.v2 && r.ok.v1),
    exactSlots: cnt((r) => r.ok.module && r.slotDiff.length === 0),
    errors: cnt((r) => !!r.error),
    avgMs: Math.round(rows.reduce((s, r) => s + r.ms, 0) / Math.max(1, cnt((r) => r.ms > 0))),
  };

  for (const r of rows) {
    const mark = r.error ? "ERR" : r.ok.v2 && r.ok.v1 ? " ok" : "MISS";
    const verdicts = r.got ? `v2 ${r.expected.v2}→${r.got.v2} · v1 ${r.expected.v1}→${r.got.v1}` : r.error ?? `module ${r.module.got}`;
    if (mark !== " ok" || args.includes("--verbose")) {
      console.log(`${mark} ${r.id}${r.id !== r.of ? `(${r.of})` : ""} [${r.module.gold}→${r.module.got}] ${verdicts}`);
      for (const d of r.slotDiff) console.log(`      · ${d}`);
      for (const a of r.assumptions) console.log(`      ~ ${a}`);
      for (const w of r.warnings) console.log(`      ! ${w}`);
    }
  }
  console.log(
    `\n모듈 ${pct(summary.module)} · 판정 v2 ${pct(summary.v2)} · v1 ${pct(summary.v1)} · 둘 다 ${pct(summary.both)} · 항목 완전일치 ${pct(summary.exactSlots)} · 오류 ${summary.errors} · 평균 ${summary.avgMs}ms`,
  );

  if (!ids.length) {
    const dir = path.join(process.cwd(), "data", "eval", "runs");
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `extract_${set}_${summary.at.replace(/[:.]/g, "-").slice(0, 19)}.json`);
    await fs.writeFile(file, JSON.stringify({ summary, rows }, null, 1));
    console.log(`저장: ${path.relative(process.cwd(), file)}`);
  }
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
