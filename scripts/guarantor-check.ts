// 보증기관 자료 개정 확인(Liner 비용 0): npm run guarantor:check [-- --baseline]
// --baseline: 지금 받은 값을 기준값으로 저장(본점이 발췌·기준일을 검토·갱신한 뒤에만 쓴다)
import { writeFileSync } from "node:fs";
import { checkAll } from "../lib/guarantor/check";

(async () => {
  const rs = await checkAll();
  for (const r of rs) console.log(`${r.status === "same" ? "✓" : r.status === "changed" ? "⚠" : r.status === "skipped" ? "·" : "✗"} ${r.id} ${r.title} — ${r.detail}${r.observed ? ` ${JSON.stringify(r.observed)}` : ""}`);
  if (process.argv.includes("--baseline")) {
    const base = Object.fromEntries(rs.filter((r) => r.observed && !Object.values(r.observed).some((v) => v.startsWith("("))).map((r) => [r.id, r.observed]));
    writeFileSync("data/guarantor/baseline.json", `${JSON.stringify({ _note: "보증기관 공식 페이지의 비교 기준값(lib/guarantor/check). 본점 검토 후 --baseline으로만 갱신", checkedAt: new Date().toISOString().slice(0, 10), ...base }, null, 1)}\n`);
    console.log("기준값 저장: data/guarantor/baseline.json");
  }
})();
