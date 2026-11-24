// 판정만 다시 하기(Liner 호출 없음, $0): 저장된 평가 결과(eval-field OUT json)의 추출 결과(case)로 규칙 엔진만 다시 돌린다.
// 규칙 엔진 코드(lib/rules)만 바꿨을 때 쓴다. 추출 프롬프트·스키마를 바꿨으면 이걸로는 확인할 수 없다(Liner 재추출 필요).
// 기준 질문(Q)·기준 답변(+기준)·범위 밖은 Liner 문장 생성이 필요해 저장된 판정을 그대로 둔다(표시: 재사용).
// 사용: npx tsx scripts/rejudge.ts data/eval/runs/<결과>.json [--diff]
import { readFileSync } from "node:fs";
import { judge, type Case } from "../lib/rules";
import { tally, tallyText } from "../lib/eval/direction";

type R = { id: string; expect?: string; got?: string; module?: string; case?: Record<string, unknown>; also?: Record<string, unknown>; headline?: string; conditions?: string[] };
// 같은 고객 건의 두 규제는 더 제한적인 쪽으로 채점(eval-field와 같은 순서)
const ORDER = ["불허", "보류", "역질문", "심사위", "내부지침", "조건부", "허용", "안내"];
const file = process.argv[2];
// eval-field 결과(배열)와 eval-novel·eval-extract 결과({rows}: accept[] 또는 expected/got의 v2)를 같은 모양으로 맞춘다
type Raw = Omit<R, "got" | "module"> & { accept?: string[]; expected?: { v2?: string }; got?: string | { v2?: string }; module?: string | { got?: string } };
const raw = JSON.parse(readFileSync(file, "utf8")) as Raw[] | { rows: Raw[] };
const rows: R[] = (Array.isArray(raw) ? raw : raw.rows).map((r) => ({
  ...r,
  expect: r.expect ?? (r.accept ? r.accept.join("|") : r.expected?.v2),
  got: typeof r.got === "string" || r.got === undefined ? r.got : r.got.v2,
  module: typeof r.module === "object" ? r.module.got : r.module,
}));
const after: { expect?: string; got?: string }[] = [];
let ok = 0, okBefore = 0, graded = 0, changed = 0, reused = 0;
for (const r of rows) {
  // 두 번째 규제(also)를 함께 판정한 결과인데 그 사례가 저장되지 않은 예전 결과는 다시 판정할 수 없다(저장값 재사용)
  const legacyAlso = !r.also && (r.conditions ?? []).some((x) => x.startsWith("[주 판정") || x.startsWith("[함께"));
  const plain = !legacyAlso && r.case && (r.module === "M1" || r.module === "M2") && (r.case as { module?: string }).module;
  let got = r.got;
  if (plain) {
    const { basis: _b, ...c } = r.case as Record<string, unknown>;
    void _b;
    got = judge({ ...(c as unknown as Case), kb: "v2" }).verdict;
    if (r.also) {
      const w = judge({ ...(r.also as unknown as Case), kb: "v2" }).verdict;
      if (ORDER.indexOf(w) < ORDER.indexOf(got)) got = w;
    }
  } else reused++;
  after.push({ expect: r.expect, got });
  if (r.expect) {
    graded++;
    const exp = r.expect.split("|");
    if (exp.includes(got ?? "")) ok++;
    if (exp.includes(r.got ?? "")) okBefore++;
  }
  if (got !== r.got) {
    changed++;
    if (process.argv.includes("--diff")) console.log(`${r.id}: ${r.got} → ${got} (기대 ${r.expect ?? "-"})`);
  }
}
console.log(`판정만 다시: 허용 범위 ${okBefore}/${graded} → ${ok}/${graded} · 바뀐 문항 ${changed} · Liner가 필요한 문항(저장값 재사용) ${reused}`);
console.log(`이전 ${tallyText(tally(rows))}`);
console.log(`이후 ${tallyText(tally(after))}`);
