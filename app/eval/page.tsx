// 평가 결과(F4): data/eval/report.json(npm run eval:report)을 그대로 보여 준다.
import Link from "next/link";
import report from "@/data/eval/report.json";
import testset from "@/data/eval/testset.json";
import gold from "@/data/eval/cases.slots.json";
import { judge, type Case } from "@/lib/rules";
import { resolveFacts } from "@/lib/kb";
import { Header, KbExplainer } from "../_components/Header";
import { Badge } from "../_components/VerdictCard";
import { verdictLabel } from "../_components/labels";
import type { VerdictCode } from "@/lib/rules/types";
import { JudgeNote } from "../_components/viewStore";
import { Mark, More, StackBar, Stat, type MarkKind } from "../_components/Viz";

export const metadata = { title: "평가 결과 · 여신 사수" };

type Score = { n: number; correct: number; pct: number; dangerous: string[]; conditionMissing: string[]; overCautious: number };
type Row = { key: string; label: string; desc: string; all: Score; liner: Score; trap: Score };
const R = report as unknown as {
  at: string;
  asOf: string;
  n: number;
  linerItems: string[];
  table: Row[];
  paraphrase?: { n: number; v1: Score; v2: Score };
  upper: { v1: Score; v2: Score };
  evidence: { recall: number; precision: number; fullyCovered: string; v1LeakCount: number; noEvidenceCount: number };
  engine: { commit: string; rejudgedDiff: number };
  sources: { extract: string };
  llmDocsNoConvention?: Score;
  latency: { extractP50: number; extractP95: number };
  explain?: { sentences: number; passed: number; pct: number; cardsWithText: number; cards: number };
  perItem: ({ id: string; type: string; liner: boolean; expected: string; accept: string[] } & Record<"llm" | "llm_docs" | "v1" | "v2", string | null>)[];
  chatgpt?: {
    at: string;
    method: string;
    items: { id: string; question: string; expected: string; agent: string; agentGrade: Grade; chatgpt: string; chatgptGrade: Grade; note: string }[];
    agent: Tally;
    chatgpt: Tally;
    latency: { agent: string; chatgpt: string };
  };
};
type Grade = "ok" | "partial" | "wrong";
type Tally = Record<Grade, number>;
const GRADE: Record<Grade, { mark: string; cls: string }> = {
  ok: { mark: "✓", cls: "text-green-700" },
  partial: { mark: "△", cls: "text-amber-600" },
  wrong: { mark: "✗", cls: "text-rose-600" },
};

const OURS = new Set(["v1", "v2"]);
const SHORT: Record<string, string> = { llm: "① LLM 단독", llm_docs: "② LLM + 정부 발표 자료", v1: "③ 여신 사수 v1", v2: "④ 여신 사수 v2" };
const QUESTION = new Map((testset as unknown as { cases: { id: string; question: string }[] }).cases.map((c) => [c.id, c.question]));

// Liner 기여: ③(v1)에서 틀리고 ④(v2)에서 맞힌 문항. 엔진은 같고 문서만 달라서, ④가 새로 쓴 근거 조항이 그 차이다.
const GOLD = gold as unknown as Record<string, Case>;
const LINER_FIX = R.perItem
  .filter((p) => !p.accept.includes(p.v1 ?? "") && p.accept.includes(p.v2 ?? "") && GOLD[p.id])
  .map((p) => {
    const c = { ...GOLD[p.id], asOf: R.asOf };
    const before = judge({ ...c, kb: "v1" }).facts;
    const added = judge({ ...c, kb: "v2" }).facts.filter((f) => !before.includes(f));
    const facts = resolveFacts(added.filter((f) => f.startsWith("F828")));
    return { ...p, facts };
  });
const LINER_FIX_IDS = new Set(LINER_FIX.filter((x) => x.facts.length).map((x) => x.id));

// 틀린 종류(scripts/eval-report.ts의 집계 기준과 같음)
const PERMISSIVE = new Set(["허용", "조건부"]);
const MISS = {
  dangerous: { label: "위험", cls: "bg-rose-600 text-white" },
  missing: { label: "조건 누락", cls: "bg-orange-100 text-orange-800" },
  cautious: { label: "과잉 보수", cls: "bg-zinc-200 text-zinc-700" },
  wrong: { label: "오답", cls: "bg-rose-50 text-rose-700" },
} as const;
function missKind(out: string, expected: string): keyof typeof MISS {
  if (PERMISSIVE.has(out) && !PERMISSIVE.has(expected)) return "dangerous";
  if (expected === "조건부" && out === "허용") return "missing";
  if ((PERMISSIVE.has(expected) || expected === "불허") && (out === "역질문" || out === "보류")) return "cautious";
  return "wrong";
}
function Cell({ out, expected, accept }: { out: string | null; expected: string; accept: string[] }) {
  if (out && accept.includes(out)) return <span className="font-semibold text-green-700">✓ 정답</span>;
  if (!out) return <span className="text-zinc-400">실행 오류</span>;
  const m = MISS[missKind(out, expected)];
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="font-semibold text-zinc-800">✗ {verdictLabel(out)}</span>
      <span className={`rounded px-1 py-px text-[12px] font-semibold ${m.cls}`}>{m.label}</span>
    </span>
  );
}

function Bar({ s, strong }: { s: Score; strong?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 w-16 shrink-0 overflow-hidden rounded-full bg-zinc-100 sm:w-20">
        <div className={`h-full rounded-full ${strong ? "bg-indigo-600" : "bg-zinc-400"}`} style={{ width: `${s.pct}%` }} />
      </div>
      <span className={`tabular-nums text-sm ${strong ? "font-semibold text-zinc-900" : "text-zinc-600"}`}>{s.pct}%</span>
      <span className="text-[13px] tabular-nums text-zinc-400">
        {s.correct}/{s.n}
      </span>
    </div>
  );
}

export default function EvalPage() {
  const v1 = R.table.find((r) => r.key === "v1")!;
  const v2 = R.table.find((r) => r.key === "v2")!;
  const docs = R.table.find((r) => r.key === "llm_docs")!;
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <Header subtitle="현장 질문, 처음 보는 질문, 외부 출제 질문으로 잰 결과를 먼저 보여 드리고, 그 아래에 직접 만든 예시 45문항의 방식별 비교를 둡니다." />
        <JudgeNote className="mb-6">판정은 규칙 엔진(코드)이 내리고, Liner Router는 조건 추출·고객 안내 문구를, Liner Search는 후속 문서 찾기를 맡습니다. 모든 수치는 세트마다 1회 실행한 결과입니다.</JudgeNote>

        <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat value="45/45" label="테스트 질문" sub="위험 오류 0 · 만들 때 쓴 질문" tone="green" />
          <Stat value="41/41" label="새 상황 질문" sub="틀린 확답 0 · 20개는 고치기 전에 떼어 둔 검증용" tone="green" />
          <Stat value="33% → 100%" label="최신 정보가 필요한 질문" sub="Liner가 찾은 문서 한 건의 효과" />
          <Stat value="0/6 ↔ 5/6" label="고객 질문만으로 행정지도 근거" sub="ChatGPT(웹 검색) ↔ 여신 사수" />
        </section>

        <FieldResults />

        {/* Liner가 하는 일: 정책 감시(4문항)만이 아니라 모든 판정의 조건 추출·안내 문구도 Liner가 맡는다 */}
        <section className="mt-6 rounded-2xl border-2 border-indigo-300 bg-white p-5">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-[12px] font-semibold text-white">Liner 기여</span>
            <h2 className="text-[18px] font-bold text-zinc-900">Liner가 맡는 일 6가지</h2>
          </div>
          <p className="mt-1 text-[14px] text-zinc-600">판정은 규칙 엔진(코드)이, 그 앞뒤는 Liner가 맡습니다.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(
              [
                ["조건 추출", "Router", `${v2.all.correct}/${R.n}`, "고객 말 → 판정 조건, 그 조건으로 판정한 정답 수", [
                  "고객 말에서 주택 수·만기일·세입자 같은 판정 조건을 뽑습니다. 기준·정의를 묻는 질문에는 코드가 고른 정부 발표 자료 조항으로 답하고, 규칙에 없는 사정이 나오면 정부 발표 자료와 대조해 한 번 더 읽습니다.",
                  R.paraphrase ? `표현을 바꾼 질문 ${R.paraphrase.v2.correct}/${R.paraphrase.n}.` : "",
                ], false],
                ["고객 안내 문구", "Router", R.explain ? `${R.explain.passed}/${R.explain.sentences}` : "-", "문장이 정부 발표 자료 대조를 통과", [
                  "판정 근거를 고객에게 말할 문장으로 만듭니다. 11.22부터 LLM은 문장을 새로 쓰지 않고, 검수된 정부 발표 자료 문장을 번호로만 골라 모든 문장이 대조를 통과합니다(예전 생성 방식은 130문장 중 120문장, 92%).",
                ], false],
                ["정책 감시", "Search API · MCP", `${Math.round(v1.liner.pct)}% → ${Math.round(v2.liner.pct)}%`, "최신 정보가 필요한 질문 정답률", [
                  `보도자료에 없던 8.28 행정지도를 찾아 판정 기준에 넣었습니다. 결론이 바뀐 ${LINER_FIX_IDS.size}문항의 효과이고, 전체 ${R.n}문항으로는 ${Math.round(v1.all.pct)}% → ${Math.round(v2.all.pct)}%입니다.`,
                ], true],
                ["해석 쟁점 사전 조사", "Search API", "$0.002", "쟁점 1건, 2~3초", [
                  "정부 발표 자료에 기준이 없는 쟁점은 본점이 외부기관에 묻기 전에 Liner로 공식 출처부터 찾습니다(비용은 실측).",
                  "11.19 쟁점 6개를 조사해 모두 공식 근거가 없음을 확인했고, 판정 카드는 확답 대신 전제 표시·고객 확인 질문·본점 확인으로 처리합니다.",
                ], false],
                ["현장 질문 근거 조사", "Search Agent · Search API", "193건", "현장 쟁점 9개에서 찾은 공식 출처", [
                  "현직자가 보낸 현장 질문 중 판정 근거 자료에 없는 쟁점 9개를 금융위·금감원·은행연합회·HUG·HF·SGI 기관별로 조사했습니다(참조 454건 중 공식 출처 193건).",
                  "근거가 있는 것은 원문 대조 후 반영하고, 공식 근거가 없는 보증기관 절차는 확답하지 않고 범위 밖으로 안내합니다. 이 조사가 '모르면 말하지 않는' 범위를 정했습니다.",
                  "현직자 검토(11.22) 뒤에는 보증기관이 공개한 원문(HF 전세자금보증 업무지침 등)을 찾아 판정과 별개로 연결했습니다(검색 18회, $0.018).",
                ], false],
                ["빠른 반응", "Router 스트리밍", "2.6초", "첫 반응(운영 실측)", [
                  "조건을 읽는 대로 화면에 먼저 보여 줘, 고객 앞에서 기다리는 시간이 짧습니다.",
                  "출력 형식을 줄여 조건 추출 중앙값 10.4초 → 7.8초(예시 45문항)로 줄였습니다.",
                ], false],
              ] as [string, string, string, string, string[], boolean][]
            ).map(([t, api, v, l, more, hi]) => (
              <div key={t} className={`rounded-xl p-4 ring-1 ${hi ? "bg-indigo-50 ring-indigo-200" : "bg-zinc-50 ring-zinc-200"}`}>
                <p className="text-[13px] font-semibold text-zinc-800">
                  {t} <span className="font-medium text-indigo-600">· Liner {api}</span>
                </p>
                <p className="mt-1.5 text-[28px] font-bold leading-none tracking-tight tabular-nums text-indigo-700">{v}</p>
                <p className="mt-1.5 text-[13px] text-zinc-600">{l}</p>
                <More>
                  {more.filter(Boolean).map((m) => (
                    <p key={m}>{m}</p>
                  ))}
                </More>
              </div>
            ))}
          </div>
        </section>

        <LinerWhy />

        <h2 className="mb-1 mt-10 text-[18px] font-bold text-zinc-900">직접 만든 예시 {R.n}문항: 방식별 비교</h2>
        <p className="mb-4 text-[14px] leading-relaxed text-zinc-500">같은 질문 {R.n}개를 네 가지 방식으로 판정해 기준일({R.asOf}) 현재 정답과 비교했습니다. 정답을 알고 만든 질문이라 위의 처음 보는 질문보다 점수가 높게 나옵니다.</p>

        <div className="mb-4">
          <KbExplainer />
          <p className="mt-2 px-1 text-[13px] leading-relaxed text-zinc-500">
            <span className="block">①② = 판정까지 LLM이 직접 함.</span>
            <span className="block">③④ = LLM은 질문에서 조건만 뽑고, 판정은 규칙 엔진(코드)이 함.</span>
            <span className="block">
              ③과 ④의 차이는 엔진이 아니라 <b>근거로 쓰는 문서</b>뿐이라, 그 차이가 Liner로 찾은 후속 문서의 효과입니다.
            </span>
          </p>
        </div>

        <section className="grid gap-3 sm:grid-cols-3">
          <Kpi value={`${v2.all.pct}%`} label="판정 정확도 (예시 45문항)" sub={`LLM에 정부 발표 자료를 줘도 ${docs.all.pct}%`} />
          <Kpi
            value={`${Math.round(v1.liner.pct)}% → ${Math.round(v2.liner.pct)}%`}
            label="최신 정보가 필요한 질문"
            sub={`${v1.liner.n}문항 중 ${v1.liner.correct}개 → ${v2.liner.correct}개 · 전체 ${R.n}문항으로는 ${Math.round(v1.all.pct)}% → ${Math.round(v2.all.pct)}%(같은 ${LINER_FIX_IDS.size}문항)`}
          />
          <Kpi
            value={`${v2.all.dangerous.length}건`}
            label="위험 오류 (예시 45문항)"
            sub={`LLM에 정부 발표 자료·해석 관례를 줘도 ${docs.all.dangerous.length}건 · 안 되는 대출을 된다고 안내`}
          />
        </section>

        <section className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="whitespace-nowrap text-[13px] text-zinc-500">
                <th className="w-52 min-w-[11rem] pb-2 font-medium">방식</th>
                <th className="pb-2 font-medium">전체 {R.n}</th>
                <th className="pb-2 font-medium">최신 정보 필요 {R.linerItems.length}</th>
                <th className="pb-2 font-medium">함정 문항 10</th>
                <th className="pb-2 pl-3 text-right font-medium">위험 오류</th>
                <th className="pb-2 pl-3 text-right font-medium">조건 누락</th>
                <th className="pb-2 pl-3 text-right font-medium">과잉 보수</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {R.table.map((r) => {
                const strong = r.key === "v2";
                return (
                  <tr key={r.key} className={strong ? "bg-indigo-50/70" : ""}>
                    <td className="min-w-[11rem] py-3 pr-3 align-top">
                      <div className={`text-[15px] ${OURS.has(r.key) ? "font-semibold text-zinc-900" : "text-zinc-700"}`}>{r.label}</div>
                      <div className="mt-0.5 text-[13px] text-zinc-500">{r.desc}</div>
                    </td>
                    <td className="py-3 pr-3 align-top">
                      <Bar s={r.all} strong={strong} />
                    </td>
                    <td className="py-3 pr-3 align-top">
                      <Bar s={r.liner} strong={strong} />
                    </td>
                    <td className="py-3 pr-3 align-top">
                      <Bar s={r.trap} strong={strong} />
                    </td>
                    <td className={`py-3 pl-3 text-right align-top text-sm tabular-nums ${r.all.dangerous.length ? "font-semibold text-rose-700" : "text-zinc-600"}`}>
                      {r.all.dangerous.length}
                      {r.all.dangerous.length > 0 && <div className="text-[12px] font-normal text-zinc-400">{r.all.dangerous.join(", ")}</div>}
                    </td>
                    <td className={`py-3 pl-3 text-right align-top text-sm tabular-nums ${r.all.conditionMissing.length ? "font-semibold text-amber-700" : "text-zinc-600"}`}>
                      {r.all.conditionMissing.length}
                      {r.all.conditionMissing.length > 0 && <div className="text-[12px] font-normal text-zinc-400">{r.all.conditionMissing.join(", ")}</div>}
                    </td>
                    <td className="py-3 pl-3 text-right align-top text-sm tabular-nums text-zinc-600">{r.all.overCautious}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-[13px] leading-relaxed text-zinc-500">
            위험 오류 = 정답이 가능·조건 충족 시 가능이 아닌데 그렇게 답함. 조건 누락 = 정답이 조건 충족 시 가능인데 가능으로 답함. 과잉 보수 = 확정할 수 있는데 본점 문의·고객 확인 필요로 넘김. ①~④ 모두 같은
            Liner Router를 씁니다. ②에는 근거 자료 v2 전체와 추출기와 같은 해석 관례를 줬고, ③④는 Router를 조건 추출에만 쓰고 판정은 규칙 엔진이 합니다
            {R.llmDocsNoConvention && <> (②를 해석 관례 없이 돌리면 {R.llmDocsNoConvention.pct}%)</>}. ③④ = 추출 실행 결과 + 규칙 엔진 {R.engine.commit}.
          </p>
        </section>

        {R.chatgpt && <ChatgptCompare c={R.chatgpt} />}

        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          <Note title="추출기 일반화">
            {R.paraphrase && (
              <>
                표현만 바꾼 문항 {R.paraphrase.n}개(프롬프트 수정에 쓰지 않음): 근거 자료 v2 <b>{R.paraphrase.v2.pct}%</b>, v1 {R.paraphrase.v1.pct}%.{" "}
              </>
            )}
            엔진에 사람이 뽑은 정답 입력을 넣은 상한은 근거 자료 v2 {R.upper.v2.pct}%입니다.
          </Note>
          <Note title="근거와 속도">
            정답 입력 기준 근거(Fact ID) 재현율 <b>{R.evidence.recall}%</b>·정밀도 {R.evidence.precision}%, 근거 없는 판정 {R.evidence.noEvidenceCount}건, v1 판정에 후속 문서 근거가 섞인 건수{" "}
            {R.evidence.v1LeakCount}건.
            {R.explain && (
              <>
                {" "}
                고객 안내 문구는 {R.explain.sentences}문장 중 <b>{R.explain.pct}%</b>가 정부 발표 자료와 대조를 통과했고 나머지는 표시하지 않습니다.
              </>
            )}{" "}
            조건 추출 p50 {(R.latency.extractP50 / 1000).toFixed(1)}초 · p95 {(R.latency.extractP95 / 1000).toFixed(1)}초.
          </Note>
        </section>


        {LINER_FIX.length > 0 && (
          <section className="mt-6 rounded-2xl border-2 border-indigo-300 bg-indigo-50/60 p-5">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-[12px] font-semibold text-white">Liner 정책 감시</span>
              <h2 className="text-[18px] font-bold text-zinc-900">Liner Search가 찾은 8.28 행정지도로 정답이 된 {LINER_FIX_IDS.size}문항</h2>
            </div>
            <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-700">
              ③과 ④는 같은 규칙 엔진입니다. 다른 건 근거 자료뿐이라, ③에서 틀리고 ④에서 맞힌 문항은 <b>새로 들어간 문서 덕분</b>입니다. 이 {LINER_FIX_IDS.size}문항은 모두 ④가 <b>Liner Search로 찾은 8.28 행정지도</b> 조항을 근거로 판정했습니다.
              ③은 &ldquo;정부 발표 자료에 기준이 없다&rdquo;며 판단을 넘겼습니다.
            </p>
            <ul className="mt-3 space-y-2">
              {LINER_FIX.map((x) => (
                <li key={x.id} className="rounded-xl bg-white p-3.5 ring-1 ring-indigo-100">
                  <div className="flex flex-wrap items-center gap-2 text-[14px]">
                    <span className="font-mono text-zinc-500">{x.id}</span>
                    <span className="text-zinc-800">{QUESTION.get(x.id)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[14px]">
                    <span className="text-zinc-500">③ v1</span>
                    <span className="font-semibold text-zinc-500 line-through decoration-rose-400">{x.v1}</span>
                    <span className="text-zinc-400">→</span>
                    <span className="text-indigo-700">④ v2</span>
                    <Badge code={x.v2 as VerdictCode} size="sm" />
                    <span className="font-semibold text-green-700">정답</span>
                  </div>
                  {x.facts.map((f) => (
                    <p key={f.id} className="mt-1.5 text-[13px] leading-relaxed text-zinc-600">
                      <span className="font-mono font-semibold text-indigo-700">{f.id}</span> <span className="text-zinc-400">8.28 {f.source}</span> — {f.text}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
            {/* 다른 질문 세트: 저장된 조건 추출 결과에 근거 자료만 v1/v2로 바꿔 규칙 엔진으로 다시 판정(Liner $0, 11.23). 스크립트: 판정만 다시 하기와 같은 방식 */}
            <div className="mt-4 rounded-xl bg-white p-4 ring-1 ring-indigo-200">
              <p className="text-[15px] font-bold text-zinc-900">
                다른 질문 세트에서도 <span className="text-indigo-700">11문항</span>이 같은 문서로 정답이 됐습니다 · 모두 <span className="text-indigo-700">15문항</span>
              </p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["외부 출제 50", "6", "그중 3문항은 v1이면 안 되는 대출을 ‘가능’이라 했을 위험 오류"],
                    ["표현 바꾼 28", "3", "v1은 판단을 넘김(본점 문의) → v2 정답"],
                    ["처음 보는 새 상황 41", "1", "v1은 판단을 넘김 → v2 정답"],
                    ["현장 질문", "1", "보증금만 오르고 대출은 그대로: 8.28 ‘대출금액 기준’ 조항으로 답함"],
                  ] as const
                ).map(([set, n, d]) => (
                  <li key={set} className="flex items-baseline gap-3 rounded-lg bg-indigo-50/60 px-3 py-2">
                    <span className="min-w-[2rem] text-[22px] font-bold tabular-nums text-indigo-700">{n}</span>
                    <span>
                      <span className="text-[14px] font-semibold text-zinc-800">{set}</span>
                      <span className="block text-[12px] leading-snug text-zinc-500">{d}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <More label="어떻게 셌나요?">
                <p>각 세트의 저장된 조건 추출 결과를 그대로 두고, 규칙 엔진에 근거 자료만 v1(보도자료·FAQ)과 v2(8.28 행정지도 포함)로 바꿔 다시 판정했습니다. 엔진과 조건이 같으니 차이는 문서 하나뿐입니다. 새로 Liner를 부른 측정은 아닙니다.</p>
                <p>v1에서 틀리고 v2에서 맞힌 문항: 외부 출제 K005·K018·K022·K025·K026·K036, 표현 바꾼 P13·P15·P26, 새 상황 N15, 현장 FQ1-1. K022·K025·K036은 v1이면 &lsquo;가능&rsquo;이 나왔을 &lsquo;불가&rsquo; 문항입니다.</p>
                <p>판정은 같지만 v2가 8.28 행정지도 조항을 근거로 더 붙인 문항도 여러 세트에 걸쳐 있습니다(예: 실거주 증빙 요구).</p>
              </More>
            </div>
            <p className="mt-2 text-[12px] text-zinc-500">10.20 인구감소지역 재지정(v2의 다른 후속 문서)으로 바뀐 문항은 없습니다. 아래 표에서 이 문항들은 보라색으로 표시됩니다.</p>
          </section>
        )}

        <details className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <summary className="cursor-pointer text-[15px] font-semibold text-zinc-800">문항별 결과 ({R.n}개) — 방식마다 맞혔는지, 틀렸으면 무엇이라고 답했는지</summary>
          <div className="mt-3 space-y-1.5 rounded-xl bg-zinc-50 px-4 py-3 text-[13px] leading-relaxed text-zinc-600">
            <p>
              <b className="text-zinc-800">열</b> ① LLM 단독(질문만) · ② LLM + 정부 발표 자료(판정도 LLM) · ③ 여신 사수, 근거 자료 v1(보도자료·FAQ만) · ④ 여신 사수, 근거 자료 v2(Liner로 찾은 후속 문서 포함)
            </p>
            <p>
              <b className="text-zinc-800">칸</b> <span className="font-semibold text-green-700">✓ 정답</span> = 정답과 같은 판정. <span className="font-semibold text-zinc-800">✗ 본점 문의</span>처럼 적힌 것은 틀린 경우이고, 뒤의 말이
              그 방식이 실제로 낸 판정입니다. 틀린 종류:{" "}
              {(["dangerous", "missing", "cautious", "wrong"] as const).map((k) => (
                <span key={k} className={`mr-1.5 inline-block rounded px-1.5 py-0.5 text-[12px] font-semibold ${MISS[k].cls}`}>
                  {MISS[k].label}
                </span>
              ))}
            </p>
            <p className="text-[12px] text-zinc-500">
              위험 = 안 되는 대출을 된다고(가능·조건 충족 시 가능) 답함 · 조건 누락 = 조건이 붙는데 조건 없이 가능 · 과잉 보수 = 확정할 수 있는데 본점 문의·고객 확인 필요로 넘김 · 오답 = 그 밖에 다른 판정. 문항 번호 옆{" "}
              <span className="font-semibold text-indigo-600">L</span> = 최신 정보(후속 문서)가 있어야 맞힐 수 있는 문항, C로 시작 = 함정 문항.{" "}
              <span className="rounded bg-indigo-100 px-1 font-semibold text-indigo-800">보라색 줄</span> = ③에서 틀리고 ④에서 Liner가 찾은 문서로 맞힌 문항.
            </p>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead className="text-zinc-500">
                <tr className="align-bottom">
                  <th className="pb-2 font-medium">문항</th>
                  <th className="pb-2 font-medium">정답</th>
                  {R.table.map((r) => (
                    <th key={r.key} className={`pb-2 font-medium ${OURS.has(r.key) ? "text-indigo-700" : ""}`}>
                      {SHORT[r.key] ?? r.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {R.perItem.map((p) => (
                  <tr key={p.id} className={`align-top ${LINER_FIX_IDS.has(p.id) ? "bg-indigo-50/70" : ""}`}>
                    <td className="max-w-[260px] py-2 pr-3">
                      <span className="font-mono text-zinc-500">{p.id}</span>
                      {p.liner && <span className="ml-1 font-semibold text-indigo-600">L</span>}
                      <span className="mt-0.5 block line-clamp-2 text-zinc-700" title={QUESTION.get(p.id)}>
                        {QUESTION.get(p.id)}
                      </span>
                    </td>
                    <td className="py-2 pr-2">
                      <Badge code={p.expected as VerdictCode} size="sm" />
                      {/* 질문에 담보 소재지가 없는 문항은 '고객 확인 필요'도 정답(현장 피드백 11/24) */}
                      {p.accept.length > 1 && <span className="mt-1 block text-[12px] text-zinc-500">또는 {p.accept.filter((a) => a !== p.expected).map(verdictLabel).join("·")}</span>}
                    </td>
                    {(["llm", "llm_docs", "v1", "v2"] as const).map((k) => (
                      <td key={k} className="py-2 pr-2">
                        <Cell out={p[k]} expected={p.expected} accept={p.accept} />
                        {k === "v2" && LINER_FIX_IDS.has(p.id) && <span className="mt-1 block w-fit rounded bg-indigo-600 px-1.5 py-px text-[12px] font-semibold text-white">Liner 문서로 정답</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-zinc-200 text-zinc-700">
                <tr>
                  <td className="pt-2 font-semibold" colSpan={2}>
                    맞힌 문항
                  </td>
                  {R.table.map((r) => (
                    <td key={r.key} className={`pt-2 tabular-nums ${OURS.has(r.key) ? "font-semibold text-indigo-700" : ""}`}>
                      {r.all.correct}/{r.all.n}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </details>

        <footer className="mt-10 text-[12px] leading-relaxed text-zinc-400">
          한계: 문항과 정답은 금융위원회 공식 발표 자료를 근거로 직접 만들었습니다(현직 지점 직원 1명이 질문 현실성만 검토, 정답 검수는 아님). 판정 규칙과 추출 프롬프트 모두 이 {R.n}문항을 보며 만들었으므로 ③④는 개발 세트
          성능이며, 바꿔 쓴 문항은 추출기의 일반화만 확인합니다. 안내 문구 검증기는 어휘·숫자·표현 규칙 검사라 의미까지 보장하지 않습니다. ①②는 1회 실행 결과입니다. 생성 {R.at.slice(0, 10)} · 재현: <code>npm run eval:report</code> · 상세: docs/EVAL.md
        </footer>
      </div>
    </main>
  );
}

function ChatgptCompare({ c }: { c: NonNullable<typeof R.chatgpt> }) {
  const rows: { label: string; t: Tally; time: string; strong?: boolean }[] = [
    { label: "여신 사수(근거 자료 v2)", t: c.agent, time: c.latency.agent, strong: true },
    { label: "ChatGPT (웹 검색)", t: c.chatgpt, time: c.latency.chatgpt },
  ];
  return (
    <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <h2 className="text-[17px] font-semibold text-zinc-900">⑤ ChatGPT(일반 채팅)와 같은 질문 {c.items.length}개 대조</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
        ChatGPT(추론 High, 검색 버튼은 끈 일반 채팅 — 필요할 때 스스로 웹을 검색해 출처를 붙임)는 FAQ에 답이 있는 문항은 대부분 맞힙니다. 차이는 후속 행정지도, 정부 발표 자료에 없는 부분, 지점이 확답하면 안 되는 부분에서 납니다.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead className="text-[13px] text-zinc-500">
            <tr>
              <th className="pb-2 font-medium">방식</th>
              <th className="pb-2 font-medium">정답 ✓</th>
              <th className="pb-2 font-medium">부분 △</th>
              <th className="pb-2 font-medium">오답·위험 ✗</th>
              <th className="pb-2 text-right font-medium">응답 시간</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 tabular-nums">
            {rows.map((r) => (
              <tr key={r.label} className={r.strong ? "bg-indigo-50/70 font-semibold text-zinc-900" : "text-zinc-700"}>
                <td className="py-2 pr-3">{r.label}</td>
                <td className="py-2">
                  {r.t.ok}/{c.items.length}
                </td>
                <td className="py-2">{r.t.partial}</td>
                <td className={`py-2 ${r.t.wrong ? "text-rose-700" : ""}`}>{r.t.wrong}</td>
                <td className="py-2 text-right text-[13px]">{r.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-[13px] font-medium text-zinc-600">문항별 보기</summary>
        <ul className="mt-2 divide-y divide-zinc-100 text-[13px]">
          {c.items.map((i) => (
            <li key={i.id} className="py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-zinc-500">{i.id}</span>
                <span className="text-zinc-700">{i.question}</span>
                <Badge code={i.expected as VerdictCode} size="sm" />
              </div>
              <div className="mt-1 grid gap-1 sm:grid-cols-2">
                <div>
                  <span className={GRADE[i.agentGrade].cls}>{GRADE[i.agentGrade].mark}</span> 여신 사수: {i.agent}
                </div>
                <div>
                  <span className={GRADE[i.chatgptGrade].cls}>{GRADE[i.chatgptGrade].mark}</span> ChatGPT: {i.chatgpt}
                </div>
              </div>
              {i.note && <div className="mt-1 text-zinc-500">{i.note}</div>}
            </li>
          ))}
        </ul>
      </details>
      <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">
        {c.method} 원본 기록: data/compare/
      </p>
    </section>
  );
}

// 처음 보는 질문·현장 질문 결과(docs/FIELD_UPGRADE.md §0, data/eval/runs/v7_now.json·judge_v7_single.json, 11/22 측정)
function FieldResults() {
  return (
    <section className="rounded-2xl border-2 border-indigo-200 bg-white p-5">
      <h2 className="text-[18px] font-bold text-zinc-900">처음 보는 질문에서는 어떤가요?</h2>
      <p className="mt-1 text-[14px] text-zinc-500">테스트 질문 45개 밖의 새 상황으로 쟀습니다. 그중 20개는 고치기 전에 떼어 둔 검증용입니다.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {(
          [
            ["41/41", "새 상황 질문 41개", "틀린 확답 0", "green", ["새 상황 질문 41개: 21개는 첫 측정(16/21) 뒤 일반 규칙을 고쳤고, 20개는 고치기 전에 떼어 둔 검증용입니다. 11/22 지금 버전으로 재측정."]],
            ["14개 모두", "현장 질문 14개", "고친 뒤 모두 직접 답함 · 고치기 전 정답 2/9", "green", [
              "현직자가 지점 직원 커뮤니티 질문을 일반화해 보내 준 10개 주제(이어 묻는 질문까지 14문항). 이 질문으로 약점을 찾아 고쳤습니다.",
              "고치기 전에는 범위 안 9개 중 정답 2·부분 4·오답 3. 고친 뒤 결과는 직접 채점이며 현직자의 정답 검수 전입니다. 보증기관 내부 절차 질문은 공식 근거가 없어 범위 밖으로 안내합니다.",
            ]],
            ["위험 0", "외부 출제 50문항(어려운 질문)", "위험 오류 2 → 고쳐 0 · Codex 채점 36/50(고치기 전)", "green", [
              "Codex가 정부 발표 자료만 보고 새로 낸 어려운 질문(사실 여러 개·날짜 경계·규제 겹침). Codex가 답을 원문과 대조해 판정이 정당한지 채점(36/50). 판정 코드가 Codex 정답과 일치한 것은 33/50.",
              "72%는 고치기 전 수치입니다. 위험 오류 2건을 일반 규칙으로 고친 뒤 같은 50문항을 판정만 다시 돌려 0건을 확인했습니다(새 질문 재측정은 안 함).",
            ]],
          ] as [string, string, string, "green" | "amber", string[]][]
        ).map(([v, l, sub, tone, more]) => (
          <div key={l} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
            <p className={`text-[30px] font-bold leading-none tracking-tight tabular-nums ${tone === "green" ? "text-emerald-700" : "text-amber-700"}`}>{v}</p>
            <p className="mt-2 text-[15px] font-semibold text-zinc-900">{l}</p>
            <p className="text-[13px] text-zinc-500">{sub}</p>
            <More>
              {more.map((m) => (
                <p key={m}>{m}</p>
              ))}
            </More>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl bg-zinc-50 p-4">
        <p className="text-[14px] font-semibold text-zinc-900">외부 출제 50문항, 정답이 아니었던 14건은?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Mark kind="ok">위험 오류 2건 → 일반 규칙으로 고쳐 0건</Mark>
          <Mark kind="none">나머지 대부분: 확답 대신 본점 확인으로 안내(잘못 승인되지 않는 방향)</Mark>
        </div>
        <More>
          <p>위험 오류 2건(안 되는 대출을 된다고 답함): 연장 건에 한도 2억원을 적용하지 않음, 세대원이 아닌 형제자매 명의 주택까지 세대 주택 수로 셈. 두 유형 모두 일반 규칙으로 고쳐 지금 버전에 반영했습니다.</p>
          <p>본점 확인으로 넘긴 경우는 불편하지만 잘못 승인되지는 않는 방향이며, 다음 개선 과제입니다.</p>
        </More>
      </div>
      <div className="mt-3 rounded-xl bg-zinc-50 p-4">
        <p className="text-[14px] font-semibold text-zinc-900">제출 전 Codex(AI) 독립 검토(11.23, 2회)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Mark kind="ok">&lsquo;가능&rsquo;으로 새던 드문 경로 11곳 차단</Mark>
          <Mark kind="ok">저장된 평가 3,497건 판정만 다시: 위 세트 판정 변화 없음</Mark>
          <Mark kind="none">개발용 질문 1건은 조건 추출 오류로 엄격한 쪽 오답</Mark>
        </div>
        <More>
          <p>지적마다 규칙 엔진에 직접 넣어 재현한 뒤 일반 규칙으로 고쳤습니다. 결과는 &lsquo;불가&rsquo;나 &lsquo;고객 확인 필요&rsquo;, &lsquo;심사위&rsquo;로 바뀌었습니다(예: 다주택자의 실거주 의무 예외, 연장인지 신규인지 모르는 경우, &lsquo;4월&rsquo;로만 아는 만기일). 검토할 때마다 더 드문 조합이 나왔으므로 남은 경로가 없다고 말하지 않습니다.</p>
          <p>
            자세한 내용은{" "}
            <Link href="/review#audit" className="font-medium text-indigo-600 hover:underline">
              심사 안내의 Codex 독립 검토
            </Link>
            에 있습니다.
          </p>
        </More>
      </div>
      <div className="mt-3 rounded-xl bg-zinc-50 p-4">
        <p className="text-[14px] font-semibold text-zinc-900">현직 지점 직원 사용 검토(11.22, 커뮤니티 소속 1명) · 반영 회신(11.23) · 재확인(11.24)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Mark kind="ok">이전에 막힌 질문 개선 확인</Mark>
          <Mark kind="none">보증기관 기준이 필요한 실제 질문 3건은 확인할 곳 안내</Mark>
          <Mark kind="ok">지적은 다음 날 화면·기능에 반영</Mark>
          <Mark kind="ok">의견 16개 대조 → 반영 8 · 일부 5 · 못 함 3 회신</Mark>
          <Mark kind="ok">재확인(11.24) &ldquo;사용성이 많이 좋아졌다&rdquo;</Mark>
        </div>
        <More>
          <p>이전에 막혔던 질문(같은 등본의 자녀·손자 주택 합산)은 개선을 확인했습니다. 직원 커뮤니티의 실제 질문 3건은 핵심 결론을 확답하지 못했고, 직원은 조건 부족·기관별 기준이 섞여 있어 오답률로 계산하지 않았습니다. 총평: &ldquo;정부 정책은 잘 설명하는 편이지만, 보증기관과 은행별 정보가 부족해 심도 있는 실무 답변까지는 어려워 보입니다.&rdquo;</p>
          <p>반영(11.23, 저장된 평가를 다시 판정해 판정 결과 변화 없음 확인): 화면의 내부 항목명 노출 제거, 무주택 질문에 1주택자 기준을 답처럼 내던 경로 차단, 담보 지역을 모르는 &lsquo;불가&rsquo;에 전제 표시, 확인 항목별 한 번에 답하기·조건 수정, 보증기관 공개 원문 연결, 증액 한도를 물었는데 판정이 보유 주택 확인에서 멈춰도 &lsquo;한도 2억원·DSR 적용&rsquo;을 함께 표시. 후속 질문이 묻지 않은 쪽으로 넘어가는 문제(판정이 8.13 대상 여부부터 따지는 순서)는 아직 남아 있습니다.</p>
          <p>재확인(11.24): 항목별 한 번에 답하기·조건 수정, 무주택 전세안심 질문은 &ldquo;좋아졌다&rdquo;는 평가를 받았습니다. 남은 지적(담보 지역을 입력하지 않았는데 맨 위에 &lsquo;불가&rsquo;)은 같은 날 반영했습니다. 담보 소재지를 모르면 &lsquo;고객 확인 필요&rsquo;로 두고 &lsquo;수도권·규제지역 아파트면 불가 / 수도권 밖 비규제지역이면 가능&rsquo;을 함께 보여 줍니다. 그래서 질문에 소재지가 없는 테스트 3문항(A05·A06·B10)은 &lsquo;고객 확인 필요&rsquo;도 정답으로 인정했고, 같은 기준을 비교 방식 ①②에도 적용했습니다.</p>
        </More>
      </div>
    </section>
  );
}

// Liner를 쓴 이유와 비용(실측: credits API 잔액·사용량, docs/PITCH.md 'Liner API 사용 내역')
function LinerWhy() {
  const pros: [string, string, string][] = [
    ["보도자료 뒤의 문서를 찾아온다", "Search Agent·Search API·MCP", "보도자료·FAQ에 없던 8.28 행정지도(전세대출 경과조치·증액 조건)를 Liner가 찾았고, 정책 감시가 같은 검색을 버튼 한 번으로 다시 돌립니다(API라 매일 돌릴 수 있음). 같은 검색어로 일반 웹 검색 0/6, Liner 3/6(위 ①)."],
    ["출처가 붙어 와서 검증할 수 있다", "Search API", "검색 결과마다 문서와 주소가 붙어 원본 파일과 대조할 수 있습니다. 8.28 행정지도 인용 18개가 모두 원본과 일치했고, 출처 신뢰도로 공식 출처만 남깁니다."],
    ["키 하나로 모델·검색·법령 도구", "Router·Search API·MCP", "GPT·Gemini 라우팅 모델, 웹 검색, 법령 검색(search_legal)을 같은 키·같은 크레딧으로 씁니다. 조항 정리는 한 모델이 실패하면 다른 모델로 넘어갑니다."],
    ["창구 속도에 맞는 응답", "Router 스트리밍", "조건을 읽는 대로 받아 첫 반응 약 2.6초. 고객 앞에서 기다리는 시간이 짧습니다."],
    ["비용이 싸고, 실시간으로 보인다", "credits API", "잔액·기능별 사용액을 API로 바로 조회해, 평가를 돌릴 때마다 비용 상한을 정해 두고 그 안에서 실행했습니다(11.22 외부 출제 50문항 측정: 상한 $5, 실제 $3.22)."],
  ];
  const costs: [string, string][] = [
    ["$0.026", "창구 판정 1건 (조건 추출 + 고객 안내)"],
    ["$0.002", "해석 쟁점 사전 조사 1건 (2~3초)"],
    ["$0.008", "정책 감시 1회 (검색 6회, 단가로 계산)"],
    ["$0.13", "8.28 행정지도를 처음 찾은 검증 실험 전체"],
    ["$123.53", "개발·평가·시연 전체 (6,264회, 11.22 기준)"],
  ];
  return (
    <section className="mt-6 rounded-2xl border border-indigo-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-[12px] font-semibold text-white">왜 Liner였나</span>
        <h2 className="text-[18px] font-bold text-zinc-900">같은 질문, 다른 결과: Liner가 만든 차이</h2>
      </div>
      {/* 설계 원칙: data/liner_spike/REPORT.md(11/13) — Liner 특성을 먼저 측정하고 역할을 나눴다 */}
      <div className="mt-4 rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
        <p className="text-[15px] font-bold text-zinc-900">Liner를 먼저 시험하고(11.13, $0.13), 특성에 맞춰 역할을 나눴습니다</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <div className="flex flex-col items-start gap-1.5">
            <Mark kind="ok">찾기·읽기에 강함</Mark>
            <Mark kind="bad">단정하기에 약함(요약이 실행마다 다름)</Mark>
          </div>
          <span className="text-center text-[20px] font-bold text-zinc-300">→</span>
          <p className="rounded-xl bg-indigo-600 px-4 py-2.5 text-center text-[15px] font-bold text-white">찾기·읽기는 Liner, 결론은 코드</p>
        </div>
        <More label="특성 → 설계 → 결과 표 보기">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead>
                <tr className="text-zinc-500">
                  <th className="pb-1 font-medium">측정한 Liner 특성</th>
                  <th className="pb-1 font-medium">그래서 이렇게 설계</th>
                  <th className="pb-1 font-medium">일반 LLM과 비교한 결과</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 text-zinc-700">
                {([
                  ["출처가 붙은 최신 검색, 1,000회 $1", "정책 감시가 공식 문서명 감시 질의를 API로 실행(버튼 한 번), 공식 출처만 남김", "ChatGPT(웹 검색 켬) 행정지도 인용 0/6 ↔ 여신 사수 근거 5/6 · 최신 정보 질문 33% → 100%"],
                  ["Search Agent 요약은 실행마다 다르고 과잉 일반화", "요약은 판정에 쓰지 않음. 원문 해시·인용 대조(18/18) 후 사람이 승인한 조항만 규칙으로", "위험 오류: LLM + 정부 발표 자료 2건 ↔ 여신 사수 0건"],
                  ["Router는 고객 말에서 조건을 잘 뽑고, 스트리밍 지원", "LLM은 조건 추출·안내 문구만, 판정은 규칙 엔진", "LLM 단독 24.4% · LLM + 자료 71.1% ↔ 45/45 · 첫 반응 약 2.6초"],
                  ["API·credits API로 업무 흐름에 넣고 비용이 보임", "정책 감시, 쟁점 사전 조사(1건 $0.002), 보증기관 자료 연결, 평가 비용 상한", "채팅은 물을 때만 답함 ↔ 감시·질의서·쟁점 대장으로 업무 처리"],
                ] as [string, string, string][]).map(([x, y, z]) => (
                  <tr key={x}>
                    <td className="py-1.5 pr-3 align-top font-medium text-zinc-800">{x}</td>
                    <td className="py-1.5 pr-3 align-top">{y}</td>
                    <td className="py-1.5 align-top">{z}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </More>
      </div>
      {/* 고객 질문 비교: data/compare/search_1122/RESULT.md '고객 질문 6개', chatgpt/S4~S6·FQ1-1~3.md, app_s456.log, data/eval/runs/examples_now.log */}
      <div className="mt-4 rounded-xl border-2 border-indigo-300 bg-indigo-50/40 p-4">
        <h3 className="text-[17px] font-bold text-zinc-900">창구 직원은 고객 상황만 묻습니다. 문서 이름은 모릅니다.</h3>
        <p className="mt-1 text-[14px] text-zinc-600">같은 고객 질문 6개 · 정답 기준은 8.28 행정지도 원문 (11.22, 각 1회)</p>
        <div className="mt-3 space-y-3 rounded-xl bg-white p-4 ring-1 ring-zinc-200">
          <StackBar name="ChatGPT (웹 검색 켬 · 추론 High)" segs={[{ n: 2, label: "맞음", tone: "ok" }, { n: 3, label: "부분", tone: "part" }, { n: 1, label: "위험 오답", tone: "bad" }]} note="8.28 행정지도 인용 0/6" />
          <StackBar name="여신 사수" strong segs={[{ n: 5, label: "맞음", tone: "ok" }, { n: 1, label: "되물음", tone: "none" }, { n: 0, label: "위험", tone: "bad" }]} note="8.28 행정지도 근거 5/6" />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead>
              <tr className="text-zinc-500">
                <th className="pb-1.5 font-medium">고객 질문</th>
                <th className="pb-1.5 font-medium">ChatGPT</th>
                <th className="pb-1.5 font-medium">여신 사수</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-indigo-100 text-zinc-700">
              {([
                ["12월 만기 전세대출 연장, 종전 규정?", "part", "기준일을 '연장 완료일'로, 증액 조건 없음", "ok", "만기도래일 기준, 증액하면 변경 규정"],
                ["연장하면서 대출금을 증액하면?", "bad", "위험: 12월 증액 연장도 '종전 규정'", "ok", "증액하면 변경 규정"],
                ["한도 2억, 계속 살며 연장하면 종전 한도?", "ok", "'25.9.7 최초 계약·계속 거주·무증액", "none", "되물음: 기준 대신 주택 수를 먼저 확인"],
                ["[현장] 보증금만 오르고 대출 그대로", "ok", "증액 아님 → 종전 규정", "ok", "같은 결론, 근거 행정지도 2-가"],
                ["[현장] 대출 2억 → 2.3억", "part", "증액 조항을 놓침", "ok", "증액 연장 불가, 한도 2억 초과"],
                ["[현장] 만기 2027.1.20, 기준일은?", "part", "'공식 자료로 확정할 수 없다'", "ok", "기준은 만기도래일, 회피 방법 안내 안 함"],
              ] as [string, MarkKind, string, MarkKind, string][]).map(([q, ck, c, ok, o]) => (
                <tr key={q}>
                  <td className="py-2 pr-3 align-top font-medium text-zinc-800">{q}</td>
                  <td className="py-2 pr-3 align-top"><Mark kind={ck}>{c}</Mark></td>
                  <td className="py-2 align-top"><Mark kind={ok}>{o}</Mark></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[14px] font-semibold text-zinc-900">ChatGPT가 틀린 곳은 모두 8.28 행정지도의 두 문장. 고객 질문만으로 그 문서를 찾은 것은 Liner였습니다.</p>
        <More>
          <p>틀리거나 반만 맞힌 곳은 모두 8.28 행정지도의 두 문장(기준일 = 만기도래일, 대출금액을 늘리면 변경 규정)입니다. 문서 이름을 넣으면 ChatGPT도 이 문서를 찾지만(아래 ①), 창구에서 고객 상황을 묻는 사람은 문서 이름을 모릅니다.</p>
          <p>이번 비교에서 고객 질문만으로 이 문서를 찾은 것은 Liner(Search Agent)뿐이었고, 처음 발견(11.13)도 질문으로 물어 찾았습니다. 여신 사수는 Liner가 찾아온 문서를 원문 대조·승인해 규칙으로 넣어 두어, 고객 상황만 물어도 그 조항으로 답합니다.</p>
          <p>ChatGPT 답의 자세한 내용: 1번은 결론은 맞지만 조기 연장으로 피하는 질문을 먼저 제안, 5번은 &lsquo;비거주 제한은 아직 시행 전&rsquo;이라며 증액 조항을 놓침, 6번은 12월 조기 신청을 열린 쟁점으로 남김.</p>
          <p>그대로 밝힘: 한도 질문(3번째)은 여신 사수가 답하지 못했습니다(기준을 묻는 질문 인식 부족). 현장 질문 3개는 여신 사수 결과를 미리 알고 있어, &lsquo;8.28 행정지도가 근거인 현장 질문 전부&rsquo;라는 고르는 규칙을 ChatGPT 실행 전에 기록했습니다. Liner Search Agent도 찾은 문서를 요약할 때는 틀렸습니다(아래 ①).</p>
        </More>
      </div>

      {/* 비교 실험: data/compare/search_1122/(PLAN·RESULT·liner.json·websearch.md·pricing.md), data/compare/RESULT.md */}
      <h3 className="mt-4 text-[15px] font-semibold text-zinc-900">① 같은 검색어 6개로 8.28 행정지도를 찾고, 맞게 읽는가 (11.22, 각 1회)</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-[14px]">
          <thead>
            <tr className="text-[13px] text-zinc-500">
              <th className="pb-1.5 font-medium">도구</th>
              <th className="pb-1.5 font-medium">문서명·핵심어로 검색(3개)</th>
              <th className="pb-1.5 font-medium">창구 질문 문장(3개)</th>
              <th className="pb-1.5 font-medium">원문 발견</th>
              <th className="pb-1.5 font-medium">찾은 뒤 답의 내용</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            <tr className="bg-indigo-50/60">
              <td className="py-2 pr-3 font-semibold text-zinc-900">Liner (Search API·법령 검색·Search Agent)</td>
              <td className="py-2 pr-3">2/3 · 1~2위로 원문</td>
              <td className="py-2 pr-3">1/3 · Search Agent 참조 목록</td>
              <td className="py-2 pr-3 font-bold text-indigo-700">3/6</td>
              <td className="py-2 text-[13px] text-zinc-600">Search Agent 요약은 원문을 찾고도 &ldquo;경과조치 명시 없음&rdquo; → 화면에 쓰지 않음</td>
            </tr>
            <tr>
              <td className="py-2 pr-3 text-zinc-700">ChatGPT (웹 검색 켬 · 추론 High)</td>
              <td className="py-2 pr-3">3/3 · 원문 링크 인용</td>
              <td className="py-2 pr-3">0/3 · 다른 공식 자료 인용</td>
              <td className="py-2 pr-3 font-bold text-zinc-700">3/6</td>
              <td className="py-2 text-[13px] text-zinc-600">원문을 인용하고도 &ldquo;전세대출 경과조치가 아니다&rdquo;(2회), 12월 증액 연장도 &ldquo;종전 규정&rdquo;(위험) · 맞음 1·부분 1·틀림 3</td>
            </tr>
            <tr>
              <td className="py-2 pr-3 text-zinc-700">일반 웹 검색</td>
              <td className="py-2 pr-3">0/3 · 두 번은 &ldquo;행정지도를 찾지 못했다&rdquo;</td>
              <td className="py-2 pr-3">0/3</td>
              <td className="py-2 pr-3 font-bold text-zinc-500">0/6</td>
              <td className="py-2 text-[13px] text-zinc-600">한 번은 &ldquo;심사가 연말을 넘기면 제한&rdquo;이라고 틀리게 추측</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[14px] font-semibold text-zinc-900">문서 이름을 알면 둘 다 찾습니다. 창구처럼 고객 상황만으로 찾은 건 Liner(1/3)뿐이었고(ChatGPT 0/3), 그걸 API로 매일 돌릴 수 있습니다. 찾은 다음 LLM 요약은 둘 다 경과조치를 거꾸로 읽어, 여신 사수는 원문을 대조·승인한 조항으로 판정합니다.</p>
      <More>
        <p><b className="text-zinc-700">문서를 찾는 힘은 Liner와 ChatGPT(웹 검색 켬)가 비슷합니다.</b> 문서명으로 찾으면 ChatGPT가 3/3으로 오히려 낫습니다. 일반 웹 검색은 못 찾습니다.{" "}
        <b className="text-zinc-700">차이는 찾은 다음입니다.</b> LLM이 찾은 문서를 요약하면 ChatGPT도 Liner Search Agent도 &ldquo;경과조치가 없다&rdquo;고 거꾸로 읽었습니다(원문 2-가: &lsquo;26.12.31까지 만기도래 건은 종전 규정, 대출금액을 증액하면 변경 규정). 그래서 여신 사수는 LLM 요약을 쓰지 않고, Liner로 찾은 원문을 사람이 대조·승인한 조항으로 만들어 규칙 엔진이 판정합니다.
        Liner를 쓴 이유는 &lsquo;혼자만 찾아서&rsquo;가 아니라, 같은 검색을 API로 매일 다시 돌릴 수 있고(정책 감시), 결과마다 출처 주소가 붙어 원문 대조를 자동화할 수 있으며, 아래처럼 값이 싸기 때문입니다.</p>
      </More>

      <h3 className="mt-5 text-[15px] font-semibold text-zinc-900">② 웹 검색 1,000회 가격 (각 사 공개 가격, 11.22 확인)</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-5">
        {([["Liner", "$1", true], ["Brave", "$5", false], ["Perplexity Search", "$5", false], ["Tavily", "약 $8", false], ["OpenAI 웹 검색 도구", "$10 + 토큰", false]] as [string, string, boolean][]).map(([n, v, ours]) => (
          <div key={n} className={`rounded-xl p-3 ring-1 ${ours ? "bg-indigo-50 ring-indigo-200" : "bg-zinc-50 ring-zinc-200"}`}>
            <div className={`text-[20px] font-bold tabular-nums ${ours ? "text-indigo-700" : "text-zinc-700"}`}>{v}</div>
            <div className="text-[13px] text-zinc-600">{n}</div>
          </div>
        ))}
      </div>
      <More>
        <p>우리 실측도 1회 $0.001(credits API). 정책 감시 1회(검색 4회 + 법령 검색 2회)는 약 $0.008이고, 같은 호출을 OpenAI 웹 검색 도구로 하면 검색료만 약 $0.06입니다. 검색 결과 목록만 주는 Google 검색 대행(Serper)은 비슷한 가격이지만, 법령 검색 도구·LLM 라우팅·Search Agent는 없습니다.</p>
      </More>

      <h3 className="mt-5 text-[15px] font-semibold text-zinc-900">③ 그래서 이렇게 썼습니다</h3>
      <ul className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {pros.map(([t, api, d]) => (
          <li key={t} className="rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
            <p className="text-[12px] font-semibold text-indigo-700">{api}</p>
            <p className="mt-1 text-[16px] font-bold text-zinc-900">{t}</p>
            <More>
              <p>{d}</p>
            </More>
          </li>
        ))}
      </ul>
      <h3 className="mt-5 text-[15px] font-semibold text-zinc-900">④ 우리 비용 (Liner credits API로 실측)</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-5">
        {costs.map(([v, l]) => (
          <div key={l} className="rounded-xl bg-indigo-50/60 p-3.5 ring-1 ring-indigo-100">
            <div className="text-[22px] font-bold tabular-nums text-indigo-700">{v}</div>
            <div className="mt-0.5 text-[13px] leading-snug text-zinc-600">{l}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[14px] font-semibold text-zinc-900">판정 1,000건 ≈ $26 · $0.13짜리 실험에서 찾은 문서 하나로 33% → 100%</p>
      <More>
        <p>판정 1,000건이면 약 $26입니다(실측 단가로 계산). $0.13짜리 실험에서 찾은 문서 하나로 최신 정보가 필요한 질문의 정답률이 33% → 100%가 됐습니다. 전체 사용액의 대부분은 처음 보는 질문 수백 개로 반복 평가한 비용입니다.
        Search Agent 답변은 실행마다 달라질 수 있어 화면에 그대로 내지 않고, 정부 발표 자료와 대조한 뒤 사람이 승인한 것만 판정 기준에 넣습니다.</p>
      </More>
    </section>
  );
}

function Kpi({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="text-[32px] font-bold leading-tight tracking-tight tabular-nums text-indigo-700">{value}</div>
      <div className="mt-1.5 text-[15px] font-semibold text-zinc-900">{label}</div>
      <div className="mt-1 text-[13px] leading-relaxed text-zinc-500">{sub}</div>
    </div>
  );
}

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-[15px] leading-relaxed text-zinc-700 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <h3 className="mb-1.5 text-[13px] font-semibold text-zinc-500">{title}</h3>
      {children}
    </div>
  );
}
