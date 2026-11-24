// 현장 질문 세트 v1(data/field_questions_v1.md, 2026-11-21 수신) 기준 성적 측정.
// 이어지는 질문(1-2, 1-3, 4-2, 5-2)은 앞 질문을 followUps로 넘겨 대화 맥락을 흉내 낸다.
// 실행: OUT=결과.json npx tsx --env-file=.env scripts/eval-field.ts [FQ1-1 ...] [--set=variants]
//   --set=variants: 같은 유형을 바꿔 쓴 처음 보는 질문(data/eval/field_v1_variants.json, 기대값을 결과 전에 고정)
import { readFileSync, writeFileSync } from "node:fs";
import { extractCase } from "../lib/extract";
import { judge } from "../lib/rules";
import { answerBasis } from "../lib/basis";
import { tally, tallyText } from "../lib/eval/direction";
import variants from "../data/eval/field_v1_variants.json";
import { FIELD_EXAMPLES } from "../app/_components/fieldExamples";
import codexDev from "../data/eval/codex/codex_v1_dev.json";
import codexHold from "../data/eval/codex/codex_v1_holdout.json";
import codexV2 from "../data/eval/codex/codex_v2_test.json";
import codexV3 from "../data/eval/codex/codex_v3_test.json";

type CodexCase = { id: string; category: string; question: string; followUps: string[]; expected: string; acceptable: string[]; mustSay: string[]; mustNotSay: string[]; factIds: string[]; why: string };
const fromCodex = (cs: CodexCase[]): T[] => cs.map((c) => ({ id: c.id, q: c.question, f: c.followUps, expect: [...new Set([c.expected, ...c.acceptable])].join("|"), must: c.mustSay, mustNot: c.mustNotSay }));

type T = { id: string; q: string; f?: string[]; expect?: string; must?: string[]; mustNot?: string[] };
type R = T & { got?: string; module?: string; error?: string; grade?: string; case?: unknown; also?: unknown; assumptions?: string[]; headline?: string; basis?: string[]; gaps?: string[]; related?: string[]; conditions?: string[]; questions?: string[]; documents?: string[]; trace?: string[] };
const Q11 = "비거주 1주택자 전세대출 제한 대상입니다. 대출 만기는 2026년 12월 20일이고, 갱신하면서 보증금만 3억원에서 3억 3천만원으로 오릅니다. 차액은 자기자금으로 내고 대출 2억원은 그대로 연장합니다. 증액 연장에 해당하나요? 적용 근거도 알려주세요.";
const Q41 = "상속받은 집 때문에 집이 두 채가 됐습니다. 다주택자 주담대 만기연장 제한에서 상속주택을 제외할 수 있나요? 제외 조건과 확인할 서류, 근거를 알려주세요.";
const Q51 = "다주택자 주담대 만기연장 여부를 확인하는데, 같은 주민등록등본에 있는 자녀·자녀의 배우자·손자의 주택도 합산하나요? 주택 수 산정 대상과 조회 동의 대상을 구분해 주세요.";
const F12 = "위 사례에서 보증금 증가분을 자기자금으로 내지 않고, 전세대출도 2억원에서 2억 3천만원으로 늘리면 적용 기준이 어떻게 달라지나요?";
const tests: T[] = [
  { id: "FQ1-1", q: Q11 },
  { id: "FQ1-2", q: Q11, f: [F12] },
  { id: "FQ1-3", q: Q11, f: [F12, "다시 1-1처럼 대출금 증액 없이 연장하는 조건입니다. 만기가 2026년 12월 20일이 아니라 2027년 1월 20일이면 판단이 달라지나요? 어떤 날짜를 기준으로 규정을 적용하나요?"] },
  { id: "FQ2", q: "1주택자의 기존 전세대출을 그대로 연장하는 경우와, 대출금을 늘리기 위해 대환하는 경우는 적용 기준이 어떻게 다른가요? 종전 기준을 적용할 조건과 현재 기준으로 다시 심사할 조건을 구분해 주세요. 필요한 정보가 빠졌다면 먼저 물어봐 주세요." },
  { id: "FQ3", q: "저는 집이 한 채 있고 부모님도 집이 한 채 있습니다. 이번에 전셋집에서 부모님과 함께 살려고 합니다. 전세대출 심사에서는 2주택으로 보나요? 주택 수를 누구까지 합산하는지, 보증기관이나 적용 규제에 따라 달라지는지 알려주세요." },
  { id: "FQ4-1", q: Q41 },
  { id: "FQ4-2", q: Q41, f: ["주담대 만기연장 심사에서 상속주택이 주택 수에서 제외된다면, 전세대출이나 새 집 구입자금 대출에서도 똑같이 제외하나요? 적용 범위를 구분해 주세요."] },
  { id: "FQ5-1", q: Q51 },
  { id: "FQ5-2", q: Q51, f: ["앞선 질문을 공개 근거만으로 확정하기 어렵다면, 확인된 기준과 남은 쟁점을 구분하고 본점에 보낼 질의서 초안을 작성해 주세요."] },
  { id: "FQ6", q: "HUG 전세대출을 연장하면서 보증금만 늘고 대출금은 그대로입니다. 증액 보증금 납부 증빙도 받아야 하나요? HF·SGI도 같은 기준인지 구분해 주세요." },
  { id: "FQ7", q: "전세대출의 '잔금일 후 3개월 이내'는 대출 신청·보증 신청·보증서 발급·대출 실행 중 어느 단계까지를 뜻하나요? 버팀목과 은행재원 전세대출, 보증기관별 차이를 공식 근거로 설명해 주세요." },
  { id: "FQ8", q: "HUG 전세대출을 연장할 때 임차보증금이 줄면, 줄어든 보증금만큼 대출을 전부 상환해야 하나요? 상환액을 계산하려면 어떤 정보가 필요한가요?" },
  { id: "FQ9", q: "전세대출 승인 후 실행 전에 신용대출을 추가로 받으면 어떤 항목을 다시 심사하나요? 전세대출 신규와 연장, 보증기관에 따라 구분해 주세요." },
  { id: "FQ10", q: "전세대출 만기 전에 연장 심사와 약정을 미리 할 수 있나요? 실제 연장 처리일까지 앞당길 수 있는지는 별개인가요? 보증기관별 절차와 규제 적용 기준일을 구분해 주세요." },
];
const ASOF = process.env.ASOF ?? "2026-11-21";
const run = async (t: T): Promise<R> => {
  const ex = await extractCase({ question: t.q, followUps: t.f ?? [], asOf: ASOF }, { useCache: false });
  const meta = { ms: ex.ms, warnings: ex.warnings };
  const show = (v: ReturnType<typeof judge>) => ({ headline: v.headline, conditions: v.conditions, questions: v.questions, documents: v.documents, basis: (v.basis ?? []).map((b) => `${b.label}: ${b.text} [${b.facts.join(",")}]`), gaps: v.gaps, trace: v.trace.map((x) => `${x.step} — ${x.result} [${x.facts.join(",")}]`) });
  if (ex.module === "Q" && ex.basis) {
    const b = await answerBasis(ex.basis, { kb: "v2", asOf: ASOF, useCache: false });
    const rej = b.subs.flatMap((x) => x.rejected.map((r) => `✗ ${r.text} ← ${r.reasons.join(",")}`));
    return { ...t, ...meta, got: b.card.verdict, module: "Q", case: ex.basis, assumptions: [...ex.assumptions, ...rej], ...show(b.card) };
  }
  if (ex.asksCriteria && ex.basis && ex.case) {
    // 기준 자체를 묻는 질문: 주 카드 = 기준 답변, 고객 건 판정은 조건에 함께
    const b = await answerBasis(ex.basis, { kb: "v2", asOf: ASOF, useCache: false });
    const v = judge({ ...ex.case, kb: "v2" });
    const s = show(b.card);
    const rej = b.subs.flatMap((x) => (x.passed ? [] : [`(미답: ${x.q})`, ...x.rejected.map((r) => `✗ ${r.text} ← ${r.reasons.join(",")}`)]));
    return { ...t, ...meta, got: b.card.verdict, module: `${ex.module}+기준`, case: { ...ex.case, basis: ex.basis }, assumptions: [...ex.assumptions, ...rej], ...s, conditions: [...(s.conditions ?? []), `[같은 고객 건 ${v.module} ${v.verdict}] ${v.headline}`] };
  }
  if (ex.module === "OUT" || !ex.case) {
    const related = (ex.related ?? []).map((topic) => { const v = judge({ module: "M0", topic, asOf: ASOF, kb: "v2" }); return `${topic}: [${v.verdict}] ${v.headline}`; });
    if (!related.length && ex.basis) {
      const b = await answerBasis(ex.basis, { kb: "v2", asOf: ASOF, useCache: false, context: [t.q, ...(t.f ?? [])].join("\n") });
      for (const x of b.card.basis ?? []) if (!x.note) related.push(`근거 조회: ${x.label} — ${x.text}`);
    }
    return { ...t, ...meta, got: "OUT", module: ex.module, assumptions: ex.assumptions, related };
  }
  const v0 = judge({ ...ex.case, kb: "v2" });
  // 같은 고객 건의 두 규제 판정: 채점은 더 제한적인 쪽(불허 > 보류 > 역질문 > 심사위 > 내부지침 > 조건부 > 허용 > 안내)
  const ORDER = ["불허", "보류", "역질문", "심사위", "내부지침", "조건부", "허용", "안내"];
  const w = ex.also ? judge({ ...ex.also, kb: "v2" }) : undefined;
  const v = w && ORDER.indexOf(w.verdict) < ORDER.indexOf(v0.verdict) ? { ...w, conditions: [...w.conditions, `[주 판정 ${v0.module} ${v0.verdict}] ${v0.headline}`] } : w ? { ...v0, conditions: [...v0.conditions, `[함께 ${w.module} ${w.verdict}] ${w.headline}`] } : v0;
  return { ...t, ...meta, got: v.verdict, module: ex.module, case: ex.case, ...(ex.also ? { also: ex.also } : {}), assumptions: ex.assumptions, headline: v.headline, conditions: v.conditions, questions: v.questions, documents: v.documents, basis: (v.basis ?? []).map((b) => `${b.label}: ${b.text} [${b.facts.join(",")}]`), gaps: v.gaps, ...(v.branches ? { branches: v.branches } : {}), trace: v.trace.map((x) => `${x.step} — ${x.result} [${x.facts.join(",")}]`) };
};
const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith("--"));
// --set=codex:<이름> : data/eval/codex/<이름>.json(고정 세트)을 실행 시점에 읽는다(새 세트를 import 없이 추가)
const named = args.find((a) => a.startsWith("--set=codex:"))?.slice("--set=codex:".length);
const pool: T[] = named
  ? fromCodex(JSON.parse(readFileSync(`data/eval/codex/${named}.json`, "utf8")).cases as CodexCase[])
  : args.includes("--set=examples") // 화면의 현장 질문 예시(문장 그대로), expect = 화면 배지
  ? FIELD_EXAMPLES.map((e) => ({ id: e.id, q: e.question, expect: e.expect }))
  : args.includes("--set=variants")
  ? (variants.cases as T[])
  : args.includes("--set=codex-dev")
    ? fromCodex(codexDev.cases as CodexCase[])
    : args.includes("--set=codex-holdout")
      ? fromCodex(codexHold.cases as CodexCase[])
      : args.includes("--set=codex-v2")
        ? fromCodex(codexV2.cases as CodexCase[])
        : args.includes("--set=codex-v3")
          ? fromCodex(codexV3.cases as CodexCase[])
          : tests;
const list = pool.filter((t) => !only.length || only.includes(t.id));
const grade = (r: R) => {
  if (!r.expect) return "";
  const text = [r.headline, ...(r.basis ?? []), ...(r.conditions ?? []), ...(r.related ?? [])].filter(Boolean).join(" ");
  const miss = [
    ...(r.expect.split("|").includes(r.got ?? "") ? [] : [`판정 ${r.got}≠${r.expect}`]),
    ...(r.must ?? []).filter((m: string) => !text.includes(m)).map((m: string) => `없음 '${m}'`),
    ...(r.mustNot ?? []).filter((m: string) => text.includes(m)).map((m: string) => `있음 '${m}'`),
  ];
  return miss.length ? ` MISS ${miss.join(" · ")}` : " OK";
};
async function main() {
  const res: R[] = new Array(list.length); let i = 0;
  await Promise.all(Array.from({ length: 5 }, async () => { while (i < list.length) { const k = i++; res[k] = await run(list[k]).catch((e) => ({ ...list[k], error: String(e) })); } }));
  for (const r of res) {
    r.grade = grade(r);
    console.log(`\n### ${r.id} → ${r.got ?? "ERROR"} (${r.module ?? "-"})${r.grade}`);
    if (r.error) { console.log("ERROR", r.error); continue; }
    if (r.case) console.log(`case: ${JSON.stringify(r.case)}`);
    if (r.assumptions?.length) console.log(`가정: ${r.assumptions.join(" / ")}`);
    if (r.headline) console.log(`→ ${r.headline}`);
    for (const x of r.basis ?? []) console.log(`  기준: ${x}`);
    if (r.gaps?.length) console.log(`  쟁점: ${r.gaps.join(", ")}`);
    for (const x of r.related ?? []) console.log(`  범위 안 부분: ${x}`);
    for (const x of r.conditions ?? []) console.log(`  조건: ${x}`);
    for (const x of r.questions ?? []) console.log(`  질문: ${x}`);
    for (const x of r.documents ?? []) console.log(`  서류: ${x}`);
    for (const x of r.trace ?? []) console.log(`  과정: ${x}`);
  }
  const graded = res.filter((r) => r.expect);
  if (graded.length) {
    // 판정 일치는 판정 코드로 직접 센다(채점 문구에 '판정'이라는 말이 든 필수 문구가 있어도 틀리게 세지 않게 — 11/22 집계 버그 수정)
    const okV = graded.filter((r) => r.expect!.split("|").includes(r.got ?? "")).length;
    console.log(`\n== 판정 코드 허용 범위 ${okV}/${graded.length} · 판정+필수 문구 모두 ${graded.filter((r) => r.grade === " OK").length}/${graded.length}`);
    console.log(`== ${tallyText(tally(graded))}`);
  }
  // 규칙 밖 사실 처리 지표(코드로 셈): 보류로 이어진 건, 참고로만 둔 건(판정 단계 전 결론), '기준을 찾지 못함' 단정 건
  const tr = (r: R) => (r.trace ?? []).filter((x) => x.startsWith("판정 범위"));
  const held = res.filter((r) => r.got === "보류" && tr(r).some((x) => x.includes("반영하지 못한 사실")));
  const noted = res.filter((r) => tr(r).some((x) => x.includes("쓰이지 않는 사실")));
  const notFound = res.filter((r) => (r.conditions ?? []).some((x) => x.includes("기준을 찾지 못했습니다") || x.includes("정부 발표 자료에 기준이 없어")));
  console.log(`== 규칙 밖 사실: 보류 ${held.length} · 참고로만 ${noted.length} · '기준 못 찾음/없음' 문구 ${notFound.length}`);
  writeFileSync(process.env.OUT ?? "/dev/null", JSON.stringify(res, null, 1));
}
main();
