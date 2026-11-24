// 저장된 평가 결과(eval-field OUT json)에 갈림길 답(branches)을 규칙 엔진으로 채운다($0, Liner 없음).
// 사용: npx tsx scripts/add-branches.ts <run.json>
import { readFileSync, writeFileSync } from "node:fs";
import { judge, type Case } from "../lib/rules";
const f = process.argv[2];
const rows = JSON.parse(readFileSync(f, "utf8")) as { got?: string; case?: Record<string, unknown>; module?: string; branches?: unknown }[];
let n = 0;
for (const r of rows) {
  if (r.got !== "역질문" || !r.case?.module || (r.module !== "M1" && r.module !== "M2")) continue;
  const { basis: _b, ...c } = r.case; void _b;
  const v = judge({ ...(c as unknown as Case), kb: "v2" });
  if (v.verdict === "역질문" && v.branches) { r.branches = v.branches; n++; }
}
writeFileSync(f, JSON.stringify(rows, null, 1));
console.log(`갈림길 답 ${n}건 추가`);
