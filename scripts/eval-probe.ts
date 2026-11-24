// 사용자 랜덤 점검 25문항(질문 15 + 후속 답변 10, 2026-11-19). 실행: OUT=결과.json npx tsx --env-file=.env scripts/eval-probe.ts [Q01 F01 ...]
import { writeFileSync } from "node:fs";
import { extractCase } from "../lib/extract";
import { judge } from "../lib/rules";
import { explain } from "../lib/explain";
type T = { id: string; q: string; f?: string[]; expect: string };
type Res = T & { got?: string; error?: string; case?: unknown; assumptions?: string[]; headline?: string; conditions?: string[]; questions?: string[]; documents?: string[]; trace?: string[]; explain?: string[] };
const Q2 = "다주택 고객인데 집 하나가 경기 동두천 아파트예요. 2022년에 기준시가 2억일 때 샀대요. 서울 아파트 주담대 만기 12월 연장되죠?";
const Q14 = "전세대출 연장하려는 고객이 집이 한 채 있대요. 괜찮아요?";
const RE = "다주택 고객인데 세입자 계약이 26.6.30 종료였고 5/10에 재계약했대요. 서울 아파트 주담대 만기 12월인데 연장 되나요?";
const tests: T[] = [
  { id: "Q01", q: "아내 명의 부산 해운대 아파트 하나, 남편 명의 서울 빌라 하나예요. 서울 빌라 담보 대출 만기 연장 돼요?", expect: "허용" },
  { id: "Q02", q: Q2, expect: "조건부" },
  { id: "Q03", q: "비거주 1주택 해당 고객이 같은 단지 다른 집으로 이사하면서 전세대출을 새로 받는대요. 신청은 내년 3월이에요.", expect: "불허" },
  { id: "Q04", q: "다주택 고객 서울 아파트 주담대 만기가 올해 4월 15일이었는데 그때 연장했어요. 다음 만기 때도 괜찮죠?", expect: "불허" },
  { id: "Q05", q: "다주택 고객 서울 아파트 주담대 만기가 내년 2월인데, 세입자가 이번 달 말에 나간대요. 연장 되나요?", expect: "불허" },
  { id: "Q06", q: "각자 집이 한 채씩 있던 두 사람이 결혼해서 2주택이 됐어요. 서울 아파트 주담대 만기 연장은요?", expect: "보류|심사위" },
  { id: "Q07", q: "서울 아파트 1채를 한 번도 안 살고 세 줬는데, 세입자가 고객 처제예요. 비거주 1주택 규제 대상이에요?", expect: "불허" },
  { id: "Q08", q: "집 없는 고객이 경기도에서 전세 얻으면 내년부터 보증비율 몇 %예요?", expect: "허용" },
  { id: "Q09", q: "다주택 고객 서울 아파트 주담대인데, 3월 말에 우리 은행이 연장해 주겠다고 전화했대요. 기록은 없다고 하고요.", expect: "조건부|불허" },
  { id: "Q10", q: "공익법인 고객인데 서울 아파트 담보 대출 만기 연장 돼요?", expect: "허용|조건부" },
  { id: "Q11", q: "개인사업자 대출 금리인하요구권 쓸 수 있어요?", expect: "OUT" },
  { id: "Q12", q: "남편 명의 집을 아내한테 증여하면 각자 1주택이라 규제 피할 수 있죠?", expect: "불허" },
  { id: "Q13", q: "개인 임대사업자인데 올해 개업해서 작년 신고서가 없어요. 임대사업자로 봐요?", expect: "내부지침" },
  { id: "Q14", q: Q14, expect: "역질문" },
  { id: "Q15", q: "서울 아파트 사서 들어가려 했는데 부모님 병간호 때문에 지방에서 살게 돼 한 번도 못 살았대요. 전세대출 연장이 필요해요.", expect: "심사위" },
  // 후속 답변(답변 반영)
  { id: "F01", q: Q2, f: ["2채예요"], expect: "허용" },
  { id: "F02", q: Q2, f: ["동두천 집 포함해서 3채예요"], expect: "불허" },
  { id: "F03", q: Q14, f: ["서울 아파트이고 남한테 세 줬어요"], expect: "역질문" },
  { id: "F04", q: Q14, f: ["서울 아파트이고 남한테 세 줬어요", "본인도 배우자도 거기 산 적 없어요. 전세 만기는 내년 3월이에요"], expect: "불허" },
  { id: "F05", q: Q14, f: ["서울 아파트이고 남한테 세 줬어요", "결혼하고 2년 살다가 이사했어요"], expect: "허용" },
  { id: "F06", q: RE, f: ["세입자가 갱신청구권을 썼대요. 새 계약은 28.6.30까지예요"], expect: "조건부|허용" },
  { id: "F07", q: RE, f: ["집주인이랑 합의해서 재계약했대요"], expect: "불허" },
  { id: "F08", q: "다주택 고객 집 하나가 인천 강화군 주택이래요. 인구감소지역이면 빠지죠?", f: ["취득할 때 기준시가 3억이었어요"], expect: "조건부" },
  { id: "F09", q: "서울 아파트 1채를 한 번도 안 살고 세 줬는데, 세입자가 고객 처제예요. 비거주 1주택 규제 대상이에요?", f: ["지금 사는 전세 만기는 올해 12월 20일이에요"], expect: "조건부" },
  { id: "F10", q: "다주택 고객 서울 아파트 주담대인데, 3월 말에 우리 은행이 연장해 주겠다고 전화했대요. 기록은 없다고 하고요.", f: ["찾아보니 3월 28일 상담 기록이 있어요. 27년 3월까지 연장해 준다고 돼 있어요"], expect: "조건부" },
];
const only = process.argv.slice(2);
const run = async (t: T) => {
  const ex = await extractCase({ question: t.q, followUps: t.f ?? [], asOf: "2026-11-19" }, { useCache: false });
  if (ex.module === "OUT" || !ex.case) return { ...t, got: "OUT", assumptions: ex.assumptions };
  const v = judge({ ...ex.case, kb: "v2" });
  let lines: string[] = [];
  try { const e = await explain({ question: [t.q, ...(t.f ?? [])].join("\n"), card: v }); lines = e.all.map((s) => `${s.ok ? "✓" : "✗"} ${s.text}${s.ok ? "" : "  ← " + s.reasons.join(",")}`); } catch (e) { lines = ["explain error " + (e as Error).message]; }
  return { ...t, got: v.verdict, case: ex.case, assumptions: ex.assumptions, headline: v.headline, conditions: v.conditions, questions: v.questions, documents: v.documents, trace: v.trace.map((x) => `${x.step} — ${x.result} [${x.facts.join(",")}]`), explain: lines };
};
const list = tests.filter((t) => !only.length || only.includes(t.id));
async function main() {
const res: Res[] = new Array(list.length); let i = 0;
await Promise.all(Array.from({ length: 5 }, async () => { while (i < list.length) { const k = i++; res[k] = await run(list[k]).catch((e) => ({ ...list[k], error: String(e) })); } }));
for (const r of res) {
  const ok = r.expect.split("|").includes(r.got ?? "");
  console.log(`\n### ${r.id} ${ok ? "OK" : "MISS"} 기대 ${r.expect} / 결과 ${r.got}\nQ: ${r.q}${r.f ? "\n답: " + r.f.join(" / ") : ""}`);
  if (r.error) { console.log("ERROR", r.error); continue; }
  console.log(`case: ${JSON.stringify(r.case)}`);
  if (r.assumptions?.length) console.log(`가정: ${r.assumptions.join(" / ")}`);
  console.log(`→ ${r.headline}`);
  for (const x of r.conditions ?? []) console.log(`  조건: ${x}`);
  for (const x of r.questions ?? []) console.log(`  질문: ${x}`);
  for (const x of r.documents ?? []) console.log(`  서류: ${x}`);
  for (const x of r.trace ?? []) console.log(`  과정: ${x}`);
  for (const x of r.explain ?? []) console.log(`  안내 ${x}`);
}
writeFileSync(process.env.OUT ?? "/dev/null", JSON.stringify(res, null, 1));
}
main();
