// F4 평가 결과표: 같은 45문항을 네 방식으로 판정해 비교한다.
//   ① LLM 단독        — baseline_bare (Router, 원문 없음)
//   ② LLM + 정책 원문   — baseline_docs (Router, KB v2 Fact 전체를 프롬프트에, 규칙 엔진 없음)
//   ③ 여신 사수 KB v1   — 질문 → Router 추출 → 규칙 엔진(보도자료·FAQ만, Liner 감시 없음)
//   ④ 여신 사수 KB v2   — ③ + Liner가 찾은 8.28 행정지도·10.20 재지정
// 정답 = 기준일(2026-11-13) 현재 올바른 판정(testset.expected).
// 입력: data/eval/runs의 최신 실행 결과(extract_testset·extract_paraphrase·baseline_*). 추출 결과는 현재 엔진으로 다시 판정한다.
// 실행: npm run eval:report  → data/eval/report.json, docs/EVAL.md
import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import testset from "../data/eval/testset.json";
import gold from "../data/eval/cases.slots.json";
import { judge, type Case, type KbVersion, type Verdict } from "../lib/rules";

type Code = string | null;
interface SysRow {
  id: string;
  verdict: Code;
  facts?: string[];
  ms?: number;
}
interface SysResult {
  key: string;
  label: string;
  desc: string;
  rows: SysRow[];
}

const RUNS = path.join(process.cwd(), "data", "eval", "runs");
const T = new Map(testset.cases.map((c) => [c.id, c]));
const G = gold as unknown as Record<string, Case>;
const PERMISSIVE = new Set(["허용", "조건부"]);

async function latest(prefix: string): Promise<string | undefined> {
  const files = (await fs.readdir(RUNS)).filter((f) => f.startsWith(prefix) && f.endsWith(".json") && !f.includes("baseline.json") && !f.endsWith("_baseline.json")).sort();
  return files.length ? path.join(RUNS, files[files.length - 1]) : undefined;
}
const readJson = async <X>(f: string) => JSON.parse(await fs.readFile(f, "utf8")) as X;

type ExtractRun = {
  summary: { at: string; avgMs: number };
  rows: { id: string; of: string; case?: Case; got?: { v2: string; v1: string }; ms: number; error?: string }[];
};

function engineRows(run: ExtractRun, kb: KbVersion): SysRow[] {
  return run.rows.map((r) => {
    if (!r.case) return { id: r.id, verdict: null, ms: r.ms };
    const v: Verdict = judge({ ...r.case, kb });
    return { id: r.id, verdict: v.verdict, facts: v.facts, ms: r.ms };
  });
}

function score(rows: SysRow[], expectedOf: (id: string) => string, subset?: (id: string) => boolean) {
  const rs = subset ? rows.filter((r) => subset(r.id)) : rows;
  const n = rs.length;
  const ok = (r: SysRow) => !!r.verdict && expectedOf(r.id).split("|").includes(r.verdict);
  const correct = rs.filter(ok).length;
  // 위험 오류: 정답이 허용·조건부가 아닌데 허용·조건부로 답함(창구가 안 되는 것을 된다고 안내)
  const dangerous = rs.filter((r) => r.verdict && PERMISSIVE.has(r.verdict) && !expectedOf(r.id).split("|").some((e) => PERMISSIVE.has(e))).map((r) => r.id);
  // 과잉 보수: 정답은 확정 가능한데 보류·역질문으로 넘김
  // 정답이 허용·조건부·불허(확정 가능)인데 보류·역질문으로 넘긴 건수
  const overCautious = rs.filter((r) => !ok(r) && (PERMISSIVE.has(expectedOf(r.id)) || expectedOf(r.id) === "불허") && (r.verdict === "역질문" || r.verdict === "보류")).length;
  // 조건 누락: 정답 조건부를 허용으로(조건·기간 제한을 빠뜨림)
  const conditionMissing = rs.filter((r) => expectedOf(r.id) === "조건부" && r.verdict === "허용").map((r) => r.id);
  return { n, correct, pct: n ? Math.round((1000 * correct) / n) / 10 : 0, dangerous, conditionMissing, overCautious };
}

const pctStr = (s: { correct: number; n: number; pct: number }) => `${s.correct}/${s.n} (${s.pct}%)`;

function gitRev(): string {
  try {
    const rev = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    const dirty = execSync("git status --porcelain -- lib/rules data/kb", { encoding: "utf8" }).trim() ? "+수정" : "";
    return rev + dirty;
  } catch {
    return "unknown";
  }
}

async function main() {
  const fExtract = await latest("extract_testset_");
  const fPara = await latest("extract_paraphrase_");
  const fBare = await latest("baseline_bare_");
  const fDocs = await latest("baseline_docs_");
  const fDocsNoConv = await latest("baseline_docs-noconv_"); // 해석 관례 없이 돌린 이전 실행(참고)
  const fExplain = await latest("explain_");
  if (!fExtract || !fBare || !fDocs) throw new Error("실행 결과가 없습니다. npm run eval:extract, eval:baseline -- --mode=bare|docs 를 먼저 실행하세요.");

  const ex = await readJson<ExtractRun>(fExtract);
  const docsNoConv = fDocsNoConv ? await readJson<{ rows: SysRow[] }>(fDocsNoConv) : undefined;
  const bare = await readJson<{ rows: SysRow[] }>(fBare);
  const docs = await readJson<{ rows: SysRow[] }>(fDocs);

  const systems: SysResult[] = [
    { key: "llm", label: "① LLM 단독", desc: "Liner Router에 질문만", rows: bare.rows },
    { key: "llm_docs", label: "② LLM + 정부 발표 자료", desc: "Router에 근거 자료 v2 Fact·정부 발표 자료에 없는 부분(G-xx) 전체 + 추출기와 같은 해석 관례 제공, 규칙 엔진 없음", rows: docs.rows },
    { key: "v1", label: "③ 여신 사수(근거 자료 v1)", desc: "Router 추출 + 규칙 엔진, 보도자료·FAQ만(후속 문서 없음)", rows: engineRows(ex, "v1") },
    { key: "v2", label: "④ 여신 사수(근거 자료 v2)", desc: "③ + 후속 문서(Liner로 찾은 8.28 행정지도, 10.20 재지정)", rows: engineRows(ex, "v2") },
  ];

  // 정답(여러 판정을 인정하면 "불허|역질문")
  const exp = (id: string) => (T.get(id)!.accept ?? [T.get(id)!.expected]).join("|");
  const isL = (id: string) => !!T.get(id)?.liner;
  const isC = (id: string) => T.get(id)?.type === "C";

  const table = systems.map((s) => ({
    key: s.key,
    label: s.label,
    desc: s.desc,
    all: score(s.rows, exp),
    liner: score(s.rows, exp, isL),
    trap: score(s.rows, exp, isC),
  }));

  // 일반화: 표현만 바꾼 문항(프롬프트 수정에 쓰지 않은 세트)
  let paraphrase: { v1: ReturnType<typeof score>; v2: ReturnType<typeof score>; n: number } | undefined;
  if (fPara) {
    const pr = await readJson<ExtractRun>(fPara);
    const ofMap = new Map(pr.rows.map((r) => [r.id, r.of]));
    const pexp = (id: string) => exp(ofMap.get(id)!);
    paraphrase = { n: pr.rows.length, v1: score(engineRows(pr, "v1"), pexp), v2: score(engineRows(pr, "v2"), pexp) };
  }

  // 엔진 단독(사람이 뽑은 정답 입력) — 추출 오류를 뺀 상한
  const engineGold = (kb: KbVersion) => testset.cases.map((c) => ({ id: c.id, verdict: judge({ ...G[c.id], kb }).verdict, facts: judge({ ...G[c.id], kb }).facts }));
  const upper = { v1: score(engineGold("v1"), exp), v2: score(engineGold("v2"), exp) };

  // 근거: 정답 근거(testset.facts) 재현율, v1 판정에 후속 문서 근거가 섞인 건수
  const v2gold = engineGold("v2");
  let rec = 0;
  let full = 0;
  let nFacts = 0;
  for (const c of testset.cases) {
    const want = c.facts.filter((f) => !f.startsWith("G-"));
    if (!want.length) continue;
    const got = new Set(v2gold.find((r) => r.id === c.id)!.facts);
    const hit = want.filter((f) => got.has(f)).length;
    rec += hit / want.length;
    nFacts++;
    if (hit === want.length) full++;
  }
  // 정밀도: 인용한 Fact 중 정답 Fact 비율(엔진은 적용 대상 등 맥락 Fact도 인용하므로 낮게 나온다)
  let prec = 0;
  for (const c of testset.cases) {
    const want = new Set(c.facts.filter((f) => !f.startsWith("G-")));
    const got = v2gold.find((r) => r.id === c.id)!.facts;
    prec += got.length ? got.filter((f) => want.has(f)).length / got.length : 1;
  }
  const v1Leak = engineGold("v1").filter((r) => r.facts.some((f) => f.startsWith("F828") || f.startsWith("F020"))).length;
  const noEvidence = v2gold.filter((r) => r.facts.length === 0).length;

  // 고객 안내 문구 원문 대조(npm run eval:explain)
  const explainSum = fExplain
    ? (await readJson<{ summary: { sentences: number; passed: number; cardsWithText: number; cards: number; reasons: Record<string, number> } }>(fExplain)).summary
    : undefined;

  const ms = ex.rows.map((r) => r.ms).filter((x) => x > 0).sort((a, b) => a - b);
  const q = (p: number) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))];

  const report = {
    at: new Date().toISOString(),
    asOf: testset.base_date,
    n: testset.cases.length,
    linerItems: testset.cases.filter((c) => c.liner).map((c) => c.id),
    sources: { explain: fExplain && path.basename(fExplain), extract: path.basename(fExtract), paraphrase: fPara && path.basename(fPara), bare: path.basename(fBare), docs: path.basename(fDocs) },
    table,
    paraphrase,
    upper,
    evidence: {
      basis: "사람이 뽑은 정답 입력(gold)으로 근거 자료 v2 판정 시",
      recall: Math.round((1000 * rec) / nFacts) / 10,
      precision: Math.round((1000 * prec) / testset.cases.length) / 10,
      fullyCovered: `${full}/${nFacts}`,
      v1LeakCount: v1Leak,
      noEvidenceCount: noEvidence,
    },
    engine: {
      commit: gitRev(),
      // ③④ = 과거 추출 실행 결과 + 지금 엔진. 실행 당시 판정(got)과 다른 건수
      rejudgedDiff: ex.rows.filter((r) => r.case && r.got && (judge({ ...r.case, kb: "v2" }).verdict !== r.got.v2 || judge({ ...r.case, kb: "v1" }).verdict !== r.got.v1)).length,
    },
    llmDocsNoConvention: docsNoConv && score(docsNoConv.rows, exp),
    explain: explainSum && {
      ...explainSum,
      pct: Math.round((1000 * explainSum.passed) / Math.max(1, explainSum.sentences)) / 10,
    },
    latency: { extractP50: q(0.5), extractP95: q(0.95), note: "조건 추출(Router) 시간. 규칙 엔진 판정은 1ms 미만" },
    chatgpt: await loadChatgptCompare(),
    perItem: testset.cases.map(
      (c) =>
        ({
          id: c.id,
          type: c.type,
          liner: c.liner,
          expected: c.expected,
          accept: c.accept ?? [c.expected],
          ...Object.fromEntries(systems.map((s) => [s.key, s.rows.find((r) => r.id === c.id)?.verdict ?? null])),
        }) as { id: string; type: string; liner: boolean; expected: string; accept: string[] } & Record<"llm" | "llm_docs" | "v1" | "v2", Code>,
    ),
  };

  await fs.writeFile(path.join(process.cwd(), "data", "eval", "report.json"), JSON.stringify(report, null, 1));

  const md: string[] = [];
  const cnt = (t: string) => testset.cases.filter((c) => c.type === t).length;
  const nC = cnt("C");
  const v1 = table.find((r) => r.key === "v1")!;
  const v2 = table.find((r) => r.key === "v2")!;
  const v1Wrong = report.perItem.filter((p) => !p.accept.includes(p.v1 ?? ""));
  const v1WrongCodes = [...new Set(v1Wrong.map((p) => p.v1))];
  md.push(`# 평가 결과 (F4)`, ``);
  md.push(`> 생성 ${report.at.slice(0, 16).replace("T", " ")} UTC · 기준일 ${report.asOf} · 문항 ${report.n}개(A 공식 FAQ 기반 ${cnt("A")}, B 패턴 재구성 ${cnt("B")}, C 함정 ${nC}) · \`npm run eval:report\``);
  md.push(`> 정답 = 기준일 현재 올바른 판정. 실행 파일: ${Object.values(report.sources).filter(Boolean).join(", ")}`);
  md.push(`> ③④ = 추출 실행(${report.sources.extract}) + 보고서 생성 시점 규칙 엔진(${report.engine.commit}). 실행 당시 판정과 달라진 문항 ${report.engine.rejudgedDiff}개.`, ``);
  md.push(`## 판정 정확도`, ``);
  md.push(`| 방식 | 전체 | L 문항(최신 정보 필요 ${report.linerItems.length}) | C 함정(${nC}) | 위험 오류 | 조건 누락 | 과잉 보수 |`);
  md.push(`|---|---|---|---|---|---|---|`);
  for (const r of table) {
    const ids = (a: string[]) => `${a.length}${a.length ? ` (${a.join(", ")})` : ""}`;
    md.push(`| **${r.label}**<br><sub>${r.desc}</sub> | ${pctStr(r.all)} | ${pctStr(r.liner)} | ${pctStr(r.trap)} | ${ids(r.all.dangerous)} | ${ids(r.all.conditionMissing)} | ${r.all.overCautious} |`);
  }
  md.push(``, `- **위험 오류**: 정답이 허용·조건부가 아닌데 허용·조건부로 답한 건수(안 되는 대출을 된다고 안내).`);
  md.push(`- **조건 누락**: 정답이 조건부인데 허용으로 답한 건수(기간 제한·증빙 조건을 빠뜨림).`);
  md.push(`- **과잉 보수**: 정답이 허용·조건부·불허(확정 가능)인데 보류·역질문으로 넘긴 건수(안전하지만 창구에 도움이 안 됨).`);
  md.push(`- ①②는 같은 Liner Router(\`liner-gpt-router\`, temperature 0)에 판정 코드를 직접 물었다. ②에는 KB v2 근거 전체와 추출기와 같은 해석 관례(다주택=2주택 등, docs/RULES.md §6-1)를 줬다. 차이는 판정을 LLM이 하느냐 규칙 엔진이 하느냐다.`);
  if (report.llmDocsNoConvention) md.push(`- 참고: ②를 해석 관례 없이 돌린 이전 실행은 ${pctStr(report.llmDocsNoConvention)}였다(관례가 없으면 역질문으로 넘기는 경우가 많음).`);
  md.push(``);
  md.push(`## 후속 문서 반영 효과 (③ → ④)`, ``);
  md.push(`- 전체 ${v1.all.pct}% → **${v2.all.pct}%**, L 문항 ${v1.liner.pct}% → **${v2.liner.pct}%**. 위험 오류 ${v1.all.dangerous.length}건 → ${v2.all.dangerous.length}건.`);
  md.push(`- KB v1이 틀린 ${v1Wrong.length}문항(${v1Wrong.map((p) => p.id).join(", ")})의 v1 판정: ${v1WrongCodes.join(", ")}. 후속 문서 없이도 단정하지 않고 넘긴 것이고, 후속 문서를 반영하자 확정 판정이 됐다.`);
  md.push(`- 후속 문서의 출처: 8.28 행정지도는 Liner Search API·MCP로 발견되며 정책 감시 화면에서 실시간 재현된다(원본 해시 일치). 10.20 재지정은 deep research로 처음 찾고 Liner Search·행안부 원본으로 확인했다. 이 표는 KB v2에 반영된 내용의 효과를 잰 것이며, 발견 과정 자체의 재현율은 별도로 측정하지 않았다.`, ``);
  md.push(`## 추출기 일반화`, ``);
  if (paraphrase) md.push(`- 표현만 바꾼 문항 ${paraphrase.n}개(프롬프트 수정에 쓰지 않음): KB v2 ${pctStr(paraphrase.v2)}, KB v1 ${pctStr(paraphrase.v1)}. 같은 원 문항의 다른 표현이므로 추출기의 일반화만 보여 준다.`);
  md.push(`- 엔진 상한(사람이 뽑은 정답 입력): KB v2 ${pctStr(upper.v2)}, KB v1 ${pctStr(upper.v1)}. ④와의 차이 = 추출 오류.`, ``);
  md.push(`## 근거`, ``);
  md.push(`- ${report.evidence.basis}: 정답 근거(문항별 Fact ID) 재현율 ${report.evidence.recall}% · 모두 인용한 문항 ${report.evidence.fullyCovered} · 정밀도 ${report.evidence.precision}%(맥락 Fact도 함께 인용하므로 낮음).`);
  md.push(`- 근거 없는 판정 ${report.evidence.noEvidenceCount}건 · KB v1 판정에 후속 문서 근거가 섞인 건수 ${report.evidence.v1LeakCount}건.`);
  if (report.explain)
    md.push(
      `- 고객 안내 문구(Router가 고름): ${report.explain.sentences}문장(판정 결론 + 검수된 정부 발표 자료 문장을 번호로 고른 것, 새 문장 생성 없음) 중 대조 통과 ${report.explain.passed}(${report.explain.pct}%), 안내 문구가 남은 카드 ${report.explain.cardsWithText}/${report.explain.cards}. 탈락 사유: ${Object.entries(report.explain.reasons).map(([k, v]) => `${k} ${v}`).join(", ") || "없음"}. 고른 문장은 원문 그대로라 대조 통과는 설계상 보장되며, 별도의 의미 검증 성공률이 아니다(docs/RULES.md §6-3).`,
    );
  md.push(``);
  if (report.chatgpt) {
    const c = report.chatgpt;
    const mark = { ok: "✓", partial: "△", wrong: "✗" } as Record<string, string>;
    md.push(`## ⑤ ChatGPT 일반 채팅(스스로 웹 검색)과 대조 — ${c.items.length}문항`, ``);
    md.push(`> ${c.method} 원본 기록: \`data/compare/\` (agent/, chatgpt/, RESULT.md)`, ``);
    md.push(`| | 정답 ✓ | 부분 △ | 오답·위험 ✗ | 응답 시간 |`, `|---|---|---|---|---|`);
    md.push(`| 여신 사수 KB v2 | ${c.agent.ok} | ${c.agent.partial} | ${c.agent.wrong} | ${c.latency.agent} |`);
    md.push(`| ChatGPT 일반 채팅 | ${c.chatgpt.ok} | ${c.chatgpt.partial} | ${c.chatgpt.wrong} | ${c.latency.chatgpt} |`, ``);
    md.push(`| 문항 | 질문 | 정답 | 여신 사수 | ChatGPT | 메모 |`, `|---|---|---|---|---|---|`);
    for (const i of c.items) md.push(`| ${i.id} | ${i.question} | ${i.expected} | ${mark[i.agentGrade]} ${i.agent} | ${mark[i.chatgptGrade]} ${i.chatgpt} | ${i.note} |`);
    md.push(``, `- ①과 달리 ChatGPT 일반 채팅(추론 High, 필요하면 스스로 웹 검색)은 FAQ에 답이 있는 문항은 대부분 맞힌다. 차이는 후속 행정지도(B02·C07), 정부 발표 자료에 없는 부분(C02), 지점이 확답하면 안 되는 부분(C05·C07)에서 난다.`, ``);
  }
  md.push(`## 처리 시간`, ``);
  md.push(`- 조건 추출 p50 ${(report.latency.extractP50 / 1000).toFixed(1)}초 · p95 ${(report.latency.extractP95 / 1000).toFixed(1)}초. 규칙 엔진 판정은 1ms 미만(PRD 목표: 판정 배지 10초 이내).`, ``);
  md.push(`## 한계`, ``);
  md.push(`- 문항과 정답은 금융위원회 공식 발표 자료를 근거로 팀이 만들었다. 현직 지점 직원 1명이 B01~B15 질문의 현실성을 15문항 모두 4/5('실제로 나올 법함')로 평가했다(정답 검수는 아님, 응답자 1명). 해석 쟁점은 docs/RULES.md §7.`);
  md.push(`- **판정 규칙(엔진)도 이 ${report.n}문항을 보며 만들었다.** ③④와 엔진 상한은 개발에 쓴 세트에서의 성능이며, 테스트 밖 사례는 별도 세트로 쟀다: 표현 바꾼 28(28/28), 새 상황 41(21개는 첫 측정 16/21 뒤 일반 규칙을 고쳤고 20개는 고치기 전에 떼어 둔 검증용, 41/41), 외부 출제 50(고치기 전 Codex 채점 36/50) — docs/FIELD_UPGRADE.md.`);
  md.push(`- 추출 프롬프트도 이 세트를 보며 다듬었다. 바꿔 쓴 문항 세트는 추출기 일반화만 확인한다.`);
  md.push(`- 근거 재현율 ${report.evidence.recall}%는 역질문 카드에 묻는 항목의 근거 Fact를 붙이도록 엔진을 보강한 뒤의 값이다(보강 전 97.8%).`);
  md.push(`- ①②는 1회 실행이며 LLM 응답은 실행마다 조금 달라질 수 있다(temperature 0).`, ``);
  md.push(`## 문항별`, ``);
  md.push(`| 문항 | 유형 | 정답 | ① | ② | ③ | ④ |`);
  md.push(`|---|---|---|---|---|---|---|`);
  for (const p of report.perItem) {
    const cell = (v: string | null) => (v && p.accept.includes(v) ? `${v}` : `**${v ?? "오류"}** ✗`);
    md.push(`| ${p.id}${p.liner ? " (L)" : ""} | ${p.type} | ${p.accept.join(" 또는 ")} | ${cell(p.llm)} | ${cell(p.llm_docs)} | ${cell(p.v1)} | ${cell(p.v2)} |`);
  }
  await fs.writeFile(path.join(process.cwd(), "docs", "EVAL.md"), md.join("\n") + "\n");

  for (const r of table)
    console.log(`${r.label.padEnd(16)} 전체 ${pctStr(r.all).padEnd(14)} L ${pctStr(r.liner).padEnd(12)} C ${pctStr(r.trap).padEnd(12)} 위험 ${r.all.dangerous.length} 조건누락 ${r.all.conditionMissing.length} 과잉보수 ${r.all.overCautious}`);
  if (paraphrase) console.log(`바꿔 쓴 문항: v2 ${pctStr(paraphrase.v2)} v1 ${pctStr(paraphrase.v1)}`);
  console.log(`엔진 ${report.engine.commit}(재판정 차이 ${report.engine.rejudgedDiff}) · 상한 v2 ${pctStr(upper.v2)} v1 ${pctStr(upper.v1)} · 근거 재현율 ${report.evidence.recall}% 정밀도 ${report.evidence.precision}% · 추출 p50 ${report.latency.extractP50}ms p95 ${report.latency.extractP95}ms`);
  console.log("저장: data/eval/report.json, docs/EVAL.md");
}

// ⑤ ChatGPT 대조: data/compare/compare.json(사람이 채점한 10문항)을 요약해 보고서에 싣는다.
async function loadChatgptCompare() {
  type Item = { id: string; question: string; expected: string; agent: string; agentGrade: string; chatgpt: string; chatgptGrade: string; note: string };
  try {
    const raw = JSON.parse(await fs.readFile(path.join(process.cwd(), "data", "compare", "compare.json"), "utf8")) as {
      at: string;
      method: string;
      items: Item[];
      latency: { agent: string; chatgpt: string };
    };
    const tally = (k: "agentGrade" | "chatgptGrade") => ({
      ok: raw.items.filter((i) => i[k] === "ok").length,
      partial: raw.items.filter((i) => i[k] === "partial").length,
      wrong: raw.items.filter((i) => i[k] === "wrong").length,
    });
    return { ...raw, agent: tally("agentGrade"), chatgpt: tally("chatgptGrade") };
  } catch {
    return undefined;
  }
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
