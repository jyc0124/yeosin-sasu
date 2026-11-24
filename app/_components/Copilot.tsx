"use client";
// 질문 입력 → /api/judge NDJSON 스트림 → 추출 조건·판정 카드·타임머신 비교.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { COPILOT_RESET } from "./nav";
import { readKb } from "./kbStore";
import { useHq } from "./hqStore";
import { FaqHit, InquiryPanel } from "./HqPanels";
import { Lines } from "./Lines";
import { ExplainPanel } from "./ExplainPanel";
import { VerdictFeedback } from "./Feedback";
import { BETA } from "@/lib/beta";
import { findPii } from "@/lib/hq/guard";
import { faqGuide, findFaq, reviewFaq } from "@/lib/hq/faq";
import { buildInquiry, INQUIRY_VERDICTS, RECHECK_VERDICTS } from "@/lib/hq/inquiry";
import type { Case } from "@/lib/rules/types";
import { caseRows, KB_LABEL, MODULE_LABEL, partialRows, VERDICT_STYLE } from "./labels";
import type { CardData, JudgeEvent } from "./types";
import { Badge, EvidenceList, TraceList, VerdictMain } from "./VerdictCard";
import { Icon } from "./Icon";
import { JudgeNote, useJudge } from "./viewStore";
import { QUESTION_MAP } from "./questionMap";
import { ConditionPanel } from "./ConditionEdit";
import { AgencyPanel } from "./AgencyPanel";
import type { AgencyRefs } from "@/lib/guarantor";
import type { Drafts } from "./AnswerCard";
import type { AnswerState } from "./answerItems";

const EXAMPLE_TOTAL = QUESTION_MAP.flatMap((p) => p.groups.flatMap((g) => g.items)).length;

type Extracted = Extract<JudgeEvent, { type: "extracted" }>;
type Phase = "idle" | "extracting" | "judging" | "done" | "error";

export interface Example {
  label: string;
  question: string;
  desc?: string;
  icon?: string;
  expect?: string; // 테스트셋 정답 판정
  hard?: string; // 창구에서 막히는 이유
  featured?: boolean;
}

export function Copilot({
  examples,
  defaultAsOf,
  initialQuestion,
}: {
  examples: Example[];
  defaultAsOf: string;
  initialQuestion?: string;
}) {
  const judge = useJudge();
  const [question, setQuestion] = useState(initialQuestion ?? "");
  const [asked, setAsked] = useState<{ question: string; followUps: string[] } | null>(null);
  const [asOf, setAsOf] = useState(defaultAsOf);
  const [phase, setPhase] = useState<Phase>("idle");
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [card, setCard] = useState<(CardData & { compare?: CardData; also?: CardData }) | null>(null);
  // 범위 밖 질문 중 범위 안에서 답할 수 있는 부분(M0 주제 카드)
  const [related, setRelated] = useState<CardData[]>([]);
  // 이어 묻기: 바로 앞 판정(조건을 바꿔 물었을 때 무엇이 달라졌는지 보여 준다)
  const [prev, setPrev] = useState<{ verdict: CardData["verdict"]; headline: string; rows: [string, string][] } | null>(null);
  const [more, setMore] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  // 조건 추출 스트리밍 중 지금까지 읽은 조건(표시용) · 시작 시각(기다리는 동안 초 표시)
  const [partial, setPartial] = useState<[string, string][]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [runId, setRunId] = useState(0);
  // 항목별로 작성 중인 고객 답(다시 판정 중·실패해도 유지). 판정이 새로 나오면 비운다
  const [drafts, setDrafts] = useState<Drafts>({});
  const onDraft = (q: string, v: AnswerState) => setDrafts((p) => ({ ...p, [q]: v }));
  // 같은 건을 다시 판정하는 동안 보여 줄 '수정 전 조건의 결과'(실패하면 이 결과로 되돌린다)
  const [stale, setStale] = useState<{ card: NonNullable<typeof card>; extracted: Extracted | null } | null>(null);
  const [editing, setEditing] = useState(false);
  // 보증기관 확인 자료(판정 근거 아님)
  const [agency, setAgency] = useState<AgencyRefs | null>(null);
  const hq = useHq();

  async function run(q: string, followUps: string[]) {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const t0 = performance.now();
    setStartedAt(Date.now());
    setPartial([]);
    // 이어 묻기면 직전 판정을 남겨 비교하고, 새 질문이면 비교를 지운다
    if (followUps.length && card && asked && followUps.length > asked.followUps.length) setPrev({ verdict: card.verdict, headline: card.headline, rows: caseRows(extracted?.case) });
    else if (!followUps.length) setPrev(null);
    // 같은 건의 추가 확인·조건 수정이면 기존 결과를 '수정 전 조건의 결과'로 남겨 둔다(새 결과가 나오기 전에 지우지 않음)
    const before = followUps.length && card ? { card, extracted } : followUps.length ? stale : null;
    setStale(before);
    setEditing(false);
    setRelated([]);
    setAgency(null);
    setAsked({ question: q, followUps });
    setRunId((n) => n + 1);
    setPhase("extracting");
    setExtracted(null);
    setCard(null);
    setNotice(null);
    setElapsed(null);

    let finished = false;
    try {
      const res = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, followUps, asOf, kb: readKb() }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `서버 오류 (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (value) buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = done ? "" : (lines.pop() ?? "");
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as JudgeEvent;
          if (ev.type === "partial") {
            setPartial(partialRows(ev.raw));
          } else if (ev.type === "extracted") {
            setExtracted(ev);
            setPhase("judging");
          } else if (ev.type === "verdict") {
            setCard(ev);
            setAgency(ev.agency ?? null);
            setStale(null);
            setDrafts({});
            setElapsed(Math.round(performance.now() - t0));
            setPhase("done");
            finished = true;
          } else if (ev.type === "out_of_scope") {
            setNotice(ev.message);
            setRelated(ev.related ?? []);
            setAgency(ev.agency ?? null);
            setStale(null);
            setPhase("done");
            finished = true;
          } else if (ev.type === "error") {
            throw new Error(ev.message);
          }
        }
        if (done) break;
      }
      // 서버 함수가 시간 제한으로 끊기면 마지막 이벤트 없이 스트림이 닫힌다
      if (!finished) throw new Error("응답이 중간에 끊겼습니다. 다시 시도해 주세요.");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      // 판정 실패: 입력(작성 중인 답·조건)은 그대로 두고, 같은 건이면 수정 전 결과로 되돌린다
      if (before) {
        setCard(before.card);
        setExtracted(before.extracted);
        setStale(null);
      }
      setNotice(`판정하지 못했습니다. 입력한 내용은 유지됩니다. (${(e as Error).message})`);
      setPhase("error");
    }
  }

  // 사이드바·로고의 '창구 판정'을 같은 화면에서 다시 누르면 첫 화면(새 질문)으로 돌아간다
  const resetRef = useRef<() => void>(() => {});
  useEffect(() => {
    const on = () => resetRef.current();
    window.addEventListener(COPILOT_RESET, on);
    return () => window.removeEventListener(COPILOT_RESET, on);
  }, []);

  // 정책 감시에서 "다시 판정" 링크로 왔을 때: 저장된 KB 버전을 읽은 뒤 한 번 자동 실행
  const autoRan = useRef(false);
  useEffect(() => {
    if (!initialQuestion?.trim() || autoRan.current) return;
    // 플래그는 실제 실행 시점에 세운다(개발 모드 StrictMode의 effect 2회 실행·정리에 안전)
    const t = setTimeout(() => {
      if (autoRan.current) return;
      autoRan.current = true;
      // 새로고침·공유 때마다 유료 판정이 다시 돌지 않도록 주소에서 질문을 지운다
      window.history.replaceState(null, "", window.location.pathname);
      run(initialQuestion.trim(), []);
      setQuestion("");
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  const busy = phase === "extracting" || phase === "judging";
  const submit = (q: string) => {
    if (!q.trim()) return;
    run(q.trim(), []);
    setQuestion("");
  };
  const rows = caseRows(extracted?.case);
  const exCase = extracted?.case as Case | undefined;
  const faq = card && exCase ? findFaq(hq.faqs, exCase, card) : undefined;
  // 유효한 본점 해석이 있으면 판정 카드·안내 문구·질의 패널이 모두 그 해석을 따른다(판정 코드는 그대로)
  const guide = card ? faqGuide(faq, card) : undefined;
  const draft =
    card && exCase && asked && (INQUIRY_VERDICTS.includes(card.verdict) || RECHECK_VERDICTS.includes(card.verdict) || card.verdict === "안내")
      ? buildInquiry({ question: asked.question, followUps: asked.followUps, asOf: card.asOf ?? asOf, case: exCase, caseRows: rows, card })
      : undefined;

  const reset = () => {
    abortRef.current?.abort();
    setAsked(null);
    setCard(null);
    setExtracted(null);
    setNotice(null);
    setRelated([]);
    setPrev(null);
    setDrafts({});
    setStale(null);
    setEditing(false);
    setAgency(null);
    setPhase("idle");
    setQuestion("");
    window.scrollTo({ top: 0 });
  };
  resetRef.current = reset;

  const composer = (big: boolean) => (
    <Composer
      big={big}
      value={question}
      onChange={setQuestion}
      onSubmit={() => submit(question)}
      busy={busy}
      asOf={asOf}
      onAsOf={setAsOf}
    />
  );

  // 빈 상태: 가운데 큰 입력창 + 예시 카드
  if (!asked) {
    const featured = examples.filter((e) => e.featured);
    const more = examples.filter((e) => !e.featured);
    return (
      <div className="px-4 pt-10 pb-16 sm:px-6 sm:pt-20">
        <div className="mx-auto max-w-[44rem]">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-1.5 text-[15px] font-medium text-zinc-700">
            <span className="h-2 w-2 rounded-full bg-indigo-500" />
            은행 지점 창구 직원을 위한 대출 규제 판정 에이전트
          </span>
          <h1 className="mt-5 text-[32px] font-bold tracking-tight text-zinc-900 sm:text-[38px]">
            어떤 <span className="text-indigo-600">고객 건</span>을 확인할까요?
          </h1>
          <p className="mx-auto mt-3 max-w-[38rem] break-keep text-[16px] leading-relaxed text-zinc-500">
            고객에게 들은 말을 그대로 적으세요. 아래 예시에 없는 질문도 됩니다.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2 text-[14px]">
            <span className="rounded-lg bg-white px-3 py-1.5 font-medium text-zinc-800 ring-1 ring-zinc-200">
              <span className="text-indigo-600">2026.8.13</span> 비거주 1주택자 전세대출 제한
            </span>
            <span className="rounded-lg bg-white px-3 py-1.5 font-medium text-zinc-800 ring-1 ring-zinc-200">
              <span className="text-indigo-600">2026.4.1</span> 다주택자 주담대 만기연장 제한
            </span>
          </div>
          {judge && (
            <p className="mx-auto mt-3 max-w-[38rem] break-keep text-[16px] leading-relaxed text-zinc-500">
              규칙 엔진이 정부 발표 자료를 근거로 판정하고,
              <br className="hidden sm:inline" /> 확실하지 않으면 확답하지 않고 본점으로 넘깁니다.
            </p>
          )}
        </div>
        <JudgeNote className="mt-6 text-left">
          창구 직원 화면에서는 이 설명과 아래 기능 소개·처리 시간·근거 코드·평가 수치를 숨기고 결론·할 일·고객 안내만 보여 줍니다. 왼쪽 아래 스위치로 두 화면을 바꿔 볼 수 있습니다.
        </JudgeNote>
        <div className={`mx-auto mt-7 hidden max-w-[46rem] gap-3 text-left ${judge ? "sm:grid" : ""} sm:grid-cols-3`}>
          {(
            [
              ["desk", "고객이 \u201C되나요?\u201D 물을 때", "결론 · 정부 발표 자료 근거 · 받을 서류"],
              ["building", "지점이 확답하면 안 될 때", "본점 질의서 자동 작성 · 심사위 상정 일정 안내"],
              ["radar", "정부 후속 지침이 나오면", "본점이 Liner로 찾아서 · 전 지점에 바로 반영"],
            ] as const
          ).map(([icon, t, d]) => (
            <div key={t} className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-zinc-200">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 ring-1 ring-indigo-100">
                  <Icon name={icon} className="h-[18px] w-[18px] text-indigo-600" />
                </span>
                <span className="whitespace-nowrap text-[15px] font-semibold tracking-tight text-zinc-900">{t}</span>
              </div>
              <ul className="mt-2.5 space-y-1 border-t border-zinc-100 pt-2.5">
                {d.split(" · ").map((x) => (
                  <li key={x} className="flex gap-1.5 break-keep text-[14px] leading-snug text-zinc-600">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-indigo-400" />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {judge && (
          <p className="mt-6 text-center">
            <Link
              href="/story"
              className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-5 py-2.5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-violet-700"
            >
              <Icon name="spark" className="h-4 w-4" />
              심사위원이시면 여기부터: Liner와 만든 이야기 →
            </Link>
          </p>
        )}
        <p className="mt-4 text-center">
          <Link
            href="/guide"
            className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-4 py-2 text-[15px] font-semibold text-indigo-700 ring-1 ring-indigo-200 transition hover:bg-indigo-100"
          >
            처음이세요? 1분 사용 안내 →
          </Link>
        </p>
        <div className="mt-8">{composer(true)}</div>
        </div>

        {/* 사례 카드는 입력창보다 넓게: 데스크톱에서 4열(4+4)로 한눈에 */}
        <div className="mx-auto mt-10 max-w-6xl">
          <div className="mx-auto mb-4 max-w-[44rem] xl:max-w-none">
            <p className="text-[17px] font-semibold text-zinc-900">{judge ? "판정이 갈리는 대표 사례" : "자주 묻는 상황"}</p>
            {judge && (<>
            <p className="mt-1 text-[14px] leading-relaxed text-zinc-500">가능·조건 충족 시 가능·고객 확인 필요·심사위 상정·불가·본점 문의가 어떻게 나오는지 판정 유형별로 하나씩 골랐습니다. 눌러서 바로 판정을 보세요.</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-400">
              두 규제가 걸린 대출 규모: 2026.8.13 영향권 전세대출 약 6만 건 · 2026.4.1 다주택자 주담대 중 올해 만기 도래 약 1.2만 건 (금융위 8.13 대책 본문)
            </p>
            </>)}
          </div>
          <div className="mx-auto grid max-w-[44rem] gap-3 sm:grid-cols-2 xl:max-w-none xl:grid-cols-3 2xl:grid-cols-4">
            {featured.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => {
                  setQuestion(ex.question);
                  submit(ex.question);
                }}
                className="group flex flex-col rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition hover:-translate-y-px hover:border-zinc-300 hover:shadow-md"
              >
                {judge && ex.hard && <span className="mb-2.5 self-start rounded-md bg-zinc-100 px-2 py-0.5 text-[12px] font-medium text-zinc-600">왜 막히나 · {ex.hard}</span>}
                <div className="flex items-center gap-2">
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${ICON_TONE[ex.icon ?? "spark"] ?? "bg-zinc-100 text-zinc-600"}`}>
                    <Icon name={ex.icon ?? "spark"} className="h-4 w-4" />
                  </span>
                  <span className="break-keep text-[15px] font-semibold text-zinc-900">{ex.label}</span>
                  {ex.expect && ex.expect in VERDICT_STYLE && (
                    <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold ring-1 ${VERDICT_STYLE[ex.expect as keyof typeof VERDICT_STYLE].badge}`}>→ {VERDICT_STYLE[ex.expect as keyof typeof VERDICT_STYLE].label}</span>
                  )}
                </div>
                {judge && ex.desc && <p className="mt-2 break-keep text-[14px] leading-relaxed text-zinc-500">{ex.desc}</p>}
                <p className={`mt-2 ${judge ? "line-clamp-2" : "line-clamp-1"} text-[13px] leading-relaxed text-zinc-400`}>&ldquo;{ex.question}&rdquo;</p>
              </button>
            ))}
            {more.map((ex) => (
              <button
                key={ex.label}
                type="button"
                title={ex.question}
                onClick={() => {
                  setQuestion(ex.question);
                  submit(ex.question);
                }}
                className="rounded-xl border border-zinc-200 bg-white p-4 text-left text-[15px] font-semibold text-zinc-800 hover:border-zinc-300"
              >
                {ex.label}
              </button>
            ))}
            <Link
              href="/guide#questions"
              className="flex flex-col justify-center rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 text-left transition hover:bg-indigo-50"
            >
              <span className="text-[15px] font-semibold text-indigo-700">예시 질문 {EXAMPLE_TOTAL}개 모두 보기 →</span>
              <span className="mt-1.5 text-[14px] leading-relaxed text-indigo-900/60">현장에서 실제로 나온 질문을 포함해 유형별로 모은 예시입니다. 눌러서 바로 판정할 수 있습니다.</span>
            </Link>
          </div>
        </div>
        {judge && (
        <div className="mx-auto mt-6 max-w-[44rem] rounded-xl border border-dashed border-zinc-300 bg-white/60 px-5 py-4 text-[14px] leading-relaxed text-zinc-600">
          <p className="text-[15px] font-semibold text-zinc-800">예시에 없는 질문도 됩니다</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            <li>2026.8.13 전세대출·2026.4.1 만기연장에 관한 질문이면 고객 말 그대로 적으세요.</li>
            <li>조건을 읽어 같은 규칙으로 판정합니다. 표현을 바꾼 질문 28개(개발에 쓰지 않음)와 처음 보는 새 상황 질문 41개(그중 20개는 고치기 전에 떼어 둔 검증용)도 모두 정답이었습니다.</li>
            <li>두 대책 밖의 질문은 &lsquo;범위 밖&rsquo;이라고 알려 드립니다.</li>
          </ul>
        </div>
        )}
        <p className="mx-auto mt-12 max-w-[44rem] text-center text-[13px] leading-relaxed text-zinc-400">
          정부 발표 자료(금융위원회 보도자료·FAQ·행정지도)와 가상 사례로 만든 판정 보조 도구입니다.
          <br className="hidden sm:inline" /> &lsquo;A은행 지침&rsquo;은 실제 은행 기준이 아닌 가상 지침이며, 최종 판단은 소속 금융회사의 기준과 여신심사 절차를 따릅니다.
        </p>
      </div>
    );
  }

  // 결과 화면: 가운데 대화·판정, 오른쪽 근거 패널
  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-16 sm:px-6 lg:pt-10">
      <div className="mb-6 flex items-center gap-3">
        <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[14px] font-medium text-zinc-700 hover:border-zinc-300">
          <Icon name="plus" className="h-3.5 w-3.5" />새 질문
        </button>
        <button type="button" onClick={reset} className="text-[14px] text-zinc-400 hover:text-zinc-700" title="창구 판정 첫 화면으로">
          창구 판정
        </button>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {/* 질문 말풍선 */}
          <div className="flex flex-col items-end gap-2">
            <p className="max-w-[85%] rounded-2xl rounded-tr-md bg-indigo-600 px-4 py-3 text-[16px] leading-relaxed text-white">{asked.question}</p>
            {asked.followUps.map((f, i) => (
              <p key={i} className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-tr-md bg-zinc-200/80 px-4 py-2.5 text-[15px] leading-relaxed text-zinc-800">
                <span className="mr-1.5 text-[12px] font-semibold text-zinc-500">{f.startsWith("조건 정정") ? "조건 수정" : "추가 확인"}</span>
                {f.replace(/^(고객에게 확인한 답|조건 정정)\([^)]*\):\n/, "")}
              </p>
            ))}
          </div>

          {/* 처리 단계 */}
          <div className="space-y-1">
            {extracted && extracted.module !== "OUT" && phase !== "extracting" ? (
              <ConditionPanel
                rows={rows}
                meta={judge ? `· Liner Router · ${extracted.ms < 50 ? "같은 질문 저장 결과" : `${(extracted.ms / 1000).toFixed(1)}초`}` : undefined}
                canEdit={!!card && phase === "done"}
                busy={busy}
                onEditing={setEditing}
                onSubmit={(t) => run(asked.question, [...asked.followUps, t])}
                extra={
                  <>
                    <p className="mt-2 text-[13px] text-zinc-400">{MODULE_LABEL[extracted.module]}</p>
                    {extracted.assumptions.length > 0 && (
                      <ul className="mt-2 space-y-0.5 border-t border-zinc-100 pt-2 text-[13px] text-zinc-500">
                        {extracted.assumptions.map((a, i) => (
                          <li key={i}>가정: {a}</li>
                        ))}
                      </ul>
                    )}
                    {judge && extracted.warnings.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-[13px] text-amber-700">
                        {extracted.warnings.map((w, i) => (
                          <li key={i}>⚠ {w}</li>
                        ))}
                      </ul>
                    )}
                  </>
                }
              />
            ) : (
            <Step
              state={phase === "extracting" ? "now" : extracted ? "done" : "todo"}
              label={extracted ? (judge ? "조건 읽기 완료" : "이렇게 이해했어요") : stale ? "바꾼 조건으로 다시 읽는 중" : "질문에서 조건 읽는 중"}
              meta={judge ? "Liner Router" : ""}
            />
            )}
            {phase === "extracting" && <Reading rows={partial} startedAt={startedAt} />}
            {(judge || !card) && <Step
              state={phase === "judging" ? "now" : card ? "done" : "todo"}
              label={card ? "판정 완료" : "규칙 엔진 판정"}
              meta={card ? `/ 정부 발표 자료 근거 ${card.factRefs.length}개 · 규칙 ${card.trace.length}단계${elapsed !== null ? ` · 전체 ${(elapsed / 1000).toFixed(1)}초` : ""}` : "코드가 판정"}
            >
              {card && card.trace.length > 0 && (
                <div className="rounded-xl border border-zinc-200 bg-white p-4">
                  <TraceList card={card} />
                </div>
              )}
            </Step>}
          </div>

          {notice && (
            <p className={`rounded-xl px-4 py-3 text-[15px] ${phase === "error" ? "bg-rose-50 text-rose-800 ring-1 ring-rose-200" : "bg-zinc-100 text-zinc-700"}`}>
              {notice}
              {phase === "error" && (
                <button type="button" onClick={() => run(asked.question, asked.followUps)} className="ml-2 font-semibold underline underline-offset-2 hover:text-rose-950">
                  같은 질문으로 다시 시도
                </button>
              )}
            </p>
          )}

          {/* 같은 건을 다시 판정하는 동안: 수정 전 결과를 흐리게 남기고 표시를 붙인다(새 결과처럼 보이지 않게) */}
          {busy && !card && stale && (
            <div className="space-y-2" aria-busy>
              <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-[14px] font-medium text-amber-900 ring-1 ring-amber-200">
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                수정 전 조건의 결과입니다 · 바꾼 조건으로 다시 판정하는 중…
              </p>
              <div className="pointer-events-none opacity-50">
                <VerdictMain card={stale.card} busy drafts={drafts} onDraft={onDraft} onAnswer={() => {}} />
              </div>
            </div>
          )}
          {busy && !card && !stale && (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white" aria-hidden>
              <div className="space-y-3 bg-gradient-to-b from-zinc-50 to-white px-6 py-5">
                <div className="h-7 w-44 animate-pulse rounded-lg bg-zinc-200/80" />
                <div className="h-4 w-11/12 animate-pulse rounded bg-zinc-100" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-100" />
              </div>
              <div className="space-y-2.5 border-t border-zinc-100 px-6 py-5">
                <div className="h-3.5 w-16 animate-pulse rounded bg-zinc-100" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-100" />
                <div className="h-4 w-2/5 animate-pulse rounded bg-zinc-100" />
              </div>
            </div>
          )}

          <JudgeNote>Liner Router는 질문에서 조건만 읽습니다. 판정은 규칙 엔진(코드)이 정부 발표 자료 근거로 내리므로, 같은 조건이면 언제나 같은 결론입니다. 창구 화면에서는 처리 시간·단계 수를 숨깁니다.</JudgeNote>

          {card && prev && <PrevCompare prev={prev} now={card} rows={rows} />}
          {card && editing && (
            <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-[14px] text-amber-900 ring-1 ring-amber-200">
              아래는 <b className="font-semibold">수정 전 조건의 결과</b>입니다. 바꾼 조건은 &lsquo;변경사항 반영하고 다시 판정&rsquo;을 눌러야 반영됩니다.
            </p>
          )}
          {card && <VerdictMain card={card} guide={guide} busy={busy} drafts={drafts} onDraft={onDraft} onAnswer={(a) => run(asked.question, [...asked.followUps, a])} />}

          {/* 범위 밖 질문 중 범위 안에서 답할 수 있는 부분 */}
          {!card && related.length > 0 && (
            <section className="space-y-3">
              <p className="text-[15px] font-semibold text-zinc-800">이 질문 중 판정 범위 안에서 답할 수 있는 부분</p>
              {related.map((r) => (
                <VerdictMain key={r.headline} card={r} />
              ))}
            </section>
          )}

          {/* 보증기관 확인 자료: 범위 밖 질문이면 펼쳐서, 판정 카드가 있으면 접어서 */}
          {!busy && phase === "done" && agency && <AgencyPanel key={`ag-${runId}`} refs={agency} open={!card} />}

          {/* 이어 묻기: 판정이 끝난 뒤 조건을 바꾸거나 이어서 묻는다(고객 확인 필요 카드는 카드 안 답변 칸을 쓴다) */}
          {!busy && phase === "done" && (card ? card.questions.length === 0 : true) && (
            <form
              className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white p-1.5 pl-3 focus-within:border-zinc-400"
              onSubmit={(e) => {
                e.preventDefault();
                if (!more.trim()) return;
                run(asked.question, [...asked.followUps, more.trim()]);
                setMore("");
              }}
            >
              <input
                value={more}
                onChange={(e) => setMore(e.target.value)}
                placeholder="이어서 묻기 — 조건을 바꿔 물어도 됩니다 (예: 대출도 2억 3천으로 늘리면?)"
                className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] outline-none placeholder:text-zinc-400"
              />
              <button type="submit" disabled={!more.trim()} className="rounded-lg bg-indigo-600 px-3.5 py-2 text-[14px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-30">
                이어서 묻기
              </button>
            </form>
          )}
          {/* 같은 고객 건의 다른 규제 판정(예: 주담대 만기연장 + 전세대출) */}
          {card?.also && (
            <section className="space-y-2">
              <p className="text-[15px] font-semibold text-zinc-800">
                {card.also.module === "M1" || card.also.module === "M2" ? `같은 고객 건 · ${MODULE_LABEL[card.also.module]}` : "처음 물은 기준 설명"}
              </p>
              <VerdictMain card={card.also} />
            </section>
          )}
          {card && faq && <FaqHit faq={faq} kbNow={card.kb} applied={!!guide} />}

          {card && exCase && <JudgeNote>고객 안내 문장은 새로 쓰지 않습니다. 첫 문장은 판정 결론 그대로이고, 이유는 Liner Router가 검수된 정부 발표 자료 문장을 번호로 골라 그대로 보여 줍니다(지어낸 문장이 나올 수 없음).</JudgeNote>}
          {card && exCase && (
            <ExplainPanel key={`explain-${runId}`} question={[asked.question, ...asked.followUps].join(" / ")} caseData={exCase as unknown as Record<string, unknown>} kb={card.kb} verdict={card.verdict} order={card.factRefs.map((f) => f.id)} hq={guide && { id: guide.id, script: guide.script }} />
          )}
          {draft && <InquiryPanel key={`inquiry-${runId}`} draft={draft} faq={faq && reviewFaq(faq, card!.kb).status === "valid" ? faq : undefined} />}

          {/* v2(후속 문서 반영) 상태에서만 "후속 문서가 없었다면"을 보여 준다. v1 상태에서 v2 결론을 미리 보이면 아직 모르는 지식을 노출하게 됨 */}
          {card?.compare && card.kb === "v2" && <TimeMachine a={card} b={card.compare} />}

          {/* 베타 테스트: 판정마다 현장 의견을 받는다(범위 밖 응답도 포함 — "범위 안인데 못 알아들었다"를 잡으려고) */}
          {BETA && !busy && (card || (phase === "done" && notice)) && (
            <VerdictFeedback
              key={`fb-${runId}`}
              question={asked.question}
              followUps={asked.followUps}
              verdict={card ? card.verdict : "범위 밖"}
              module={card?.module ?? extracted?.module}
              kb={card?.kb}
              asOf={card?.asOf ?? asOf}
            />
          )}

          {/* 판정 화면에는 질문 입력창을 두지 않는다: 이 건에 덧붙일 내용은 카드의 '고객에게 확인한 내용' 칸, 다른 건은 처음 화면에서 */}
          {(card || phase === "error") && !busy && (
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-zinc-200 pt-6 text-[14px] text-zinc-500">
              <span>이 건을 마쳤으면</span>
              <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-[14px] font-semibold text-white shadow-sm hover:bg-indigo-700">
                <Icon name="plus" className="h-3.5 w-3.5" />새 질문(다음 고객 건)
              </button>
            </div>
          )}
        </div>

        {/* 오른쪽: 근거 패널 */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto lg:pb-6">
          <EvidencePanel key={runId} card={card} judge={judge} />
          {judge && card && (
            <dl className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-4 text-[13px]">
              <Meta k="판정" v={<Badge code={card.verdict} size="sm" />} />
              <Meta k="주제" v={MODULE_LABEL[card.module]} />
              <Meta k="기준일" v={card.asOf ?? asOf} />
              <Meta k="판정 지식" v={KB_LABEL[card.kb]} />
              <Meta k="판정 주체" v="규칙 엔진(코드) · LLM은 조건 추출만" />
            </dl>
          )}
        </aside>
      </div>

    </div>
  );
}

const ICON_TONE: Record<string, string> = {
  spark: "bg-indigo-100 text-indigo-700",
  question: "bg-orange-100 text-orange-700",
  building: "bg-violet-100 text-violet-700",
  shield: "bg-rose-100 text-rose-700",
  check: "bg-green-100 text-green-700",
  chart: "bg-sky-100 text-sky-700",
  scale: "bg-zinc-200 text-zinc-700",
};

/** 오른쪽 근거 패널: 심사위원 설명을 켜면 펼친 채, 창구 화면에서는 접어 두고 근거 번호를 누르면 열린다 */
function EvidencePanel({ card, judge }: { card: CardData | null; judge: boolean }) {
  const [open, setOpen] = useState(false);
  const shown = judge || open;
  const shownRef = useRef(shown);
  shownRef.current = shown;
  useEffect(() => {
    // 접혀 있으면 열고, 목록이 그려진 뒤 같은 근거로 한 번 더 이동시킨다
    const on = (e: Event) => {
      if (shownRef.current) return;
      setOpen(true);
      const id = (e as CustomEvent<string>).detail;
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("cite:focus", { detail: id })), 60);
    };
    window.addEventListener("cite:focus", on);
    return () => window.removeEventListener("cite:focus", on);
  }, []);
  return (
    <div className="rounded-2xl border border-zinc-200 bg-[#f4f4f2] p-4">
      <button
        type="button"
        disabled={judge}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={shown}
        className={`flex w-full items-center gap-1.5 text-left text-[14px] font-semibold text-zinc-700 ${shown ? "mb-3" : ""}`}
      >
        <Icon name="doc" className="h-4 w-4 text-zinc-500" />
        근거 · 정부 발표 자료{card ? ` ${card.factRefs.length}건` : ""}
        {!judge && <Icon name="chevron" className={`ml-auto h-3.5 w-3.5 text-zinc-400 transition ${open ? "rotate-90" : ""}`} />}
      </button>
      {!shown && card && <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">결론 문장 끝 번호를 누르면 해당 근거가 열립니다.</p>}
      {shown && (card ? <EvidenceList card={card} /> : <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-white" />)}</div>)}
      {judge && card && <JudgeNote className="mt-3">모든 결론 문장은 근거 번호로 정부 발표 자료 원문(공식 게시 페이지·원본 파일)까지 추적됩니다.</JudgeNote>}
    </div>
  );
}

function Meta({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <dt className="w-16 shrink-0 text-zinc-400">{k}</dt>
      <dd className="min-w-0 text-zinc-700">{v}</dd>
    </div>
  );
}

function Composer({
  big,
  value,
  onChange,
  onSubmit,
  busy,
  asOf,
  onAsOf,
}: {
  big: boolean;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  asOf: string;
  onAsOf: (v: string) => void;
}) {
  const pii = findPii(value);
  // 첫 화면 PC에서는 바로 입력할 수 있게 커서를 둔다(휴대폰은 키보드가 화면을 가려서 제외)
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (big && window.matchMedia("(min-width: 1024px)").matches) taRef.current?.focus({ preventScroll: true });
  }, [big]);
  return (
    <>
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!pii.length) onSubmit();
      }}
      className={
        big
          ? // 첫 화면의 중심: 청록 테두리 + 은은한 빛으로 "여기에 적는다"가 바로 보이게
            "rounded-2xl border-2 border-indigo-300 bg-white p-2 shadow-[0_0_0_6px_rgba(23,148,131,0.08),0_8px_28px_rgba(11,124,110,0.14)] transition focus-within:border-indigo-500 focus-within:shadow-[0_0_0_6px_rgba(23,148,131,0.16),0_10px_32px_rgba(11,124,110,0.2)]"
          : "rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_2px_12px_rgba(0,0,0,0.05)] focus-within:border-zinc-300 focus-within:shadow-[0_4px_20px_rgba(0,0,0,0.08)]"
      }
    >
      {big && (
        <p className="flex items-center gap-1.5 px-3 pt-1.5 text-[14px] font-semibold text-indigo-700">
          <Icon name="desk" className="h-4 w-4" />
          고객 질문을 그대로 적어 주세요
        </p>
      )}
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (!pii.length) onSubmit();
          }
        }}
        rows={big ? 3 : 1}
        maxLength={1000}
        placeholder={big ? "예) 다주택 고객 서울 아파트 주담대 만기 12월, 세입자 있음. 연장 돼요?" : "새 질문을 적으세요"}
        className={`w-full resize-none bg-transparent px-3 pt-2 text-[16px] leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-400 ${big ? "min-h-[84px] text-[17px]" : ""}`}
      />
      <div className="flex items-center gap-2 px-1.5 pb-0.5">
        <label className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[13px] text-zinc-600" title="이 날짜를 기준으로 규정을 적용합니다">
          <Icon name="clock" className="h-3.5 w-3.5 text-zinc-400" />
          기준일
          <input type="date" value={asOf} onChange={(e) => onAsOf(e.target.value)} className="bg-transparent text-[13px] text-zinc-800 outline-none" />
        </label>
        <span className="hidden text-[12px] text-zinc-400 sm:inline">Enter 판정 · Shift+Enter 줄바꿈</span>
        <button
          type="submit"
          disabled={busy || !value.trim() || pii.length > 0}
          aria-label="판정하기"
          className={`ml-auto inline-flex h-10 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-[15px] font-semibold text-white shadow-sm hover:bg-indigo-700 ${big ? "disabled:bg-indigo-300" : "disabled:bg-zinc-300"} disabled:shadow-none`}
        >
          {busy ? "판정 중…" : "판정하기"}
          <Icon name="arrowUp" className="h-4 w-4" />
        </button>
      </div>
    </form>
    {pii.length > 0 ? (
      <p className="mt-2 px-1 text-[14px] font-medium text-rose-700">
        개인정보로 보이는 내용({pii.join(", ")})이 있습니다. 지우고 판정하세요. 질문은 외부 AI 서비스로 전송됩니다.
      </p>
    ) : (
      big && (
        <p className="mt-2 px-1 text-[13px] text-zinc-500">
          <span className="font-semibold text-zinc-700">고객 이름·연락처·주민번호·계좌번호는 적지 마세요.</span> 질문은 조건을 읽기 위해 외부 AI 서비스(Liner)로 전송됩니다.
        </p>
      )
    )}
    </>
  );
}

/** 조건 추출 중: 지금까지 읽은 조건을 칩으로(스트리밍) + 걸린 시간. 판정은 다 읽은 뒤 코드가 한 번에 낸다 */
function Reading({ rows, startedAt }: { rows: [string, string][]; startedAt: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);
  const sec = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  return (
    <div className="mb-2 ml-8 rounded-xl border border-dashed border-zinc-200 bg-white/70 px-4 py-3">
      <p className="text-[13px] text-zinc-500">
        {rows.length ? "지금까지 읽은 내용" : "고객 질문을 읽고 있어요"} · {sec}초 <span className="text-zinc-400">(보통 10초 안팎)</span>
      </p>
      {rows.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {rows.map(([k, v], i) => (
            <li key={`${k}-${i}`} className="animate-[fadeIn_.3s_ease-out] rounded-lg bg-indigo-50 px-2.5 py-1 text-[13px] text-indigo-900 ring-1 ring-inset ring-indigo-100">
              <span className="text-indigo-700/70">{k}</span> <b className="font-semibold">{v}</b>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[12px] text-zinc-400">다 읽으면 규칙 엔진이 정부 발표 자료 기준으로 판정합니다.</p>
    </div>
  );
}

function Step({ state, label, meta, children }: { state: "todo" | "now" | "done"; label: string; meta: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const can = state === "done" && !!children;
  return (
    <div>
      <button
        type="button"
        disabled={!can}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left text-[14px] enabled:hover:bg-zinc-100"
      >
        <span
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
            state === "done" ? "bg-green-100 text-green-700" : state === "now" ? "bg-indigo-100 text-indigo-600" : "bg-zinc-100 text-zinc-300"
          }`}
        >
          {state === "done" ? <Icon name="check" className="h-3 w-3" /> : <span className={`h-1.5 w-1.5 rounded-full ${state === "now" ? "animate-pulse bg-indigo-500" : "bg-zinc-300"}`} />}
        </span>
        <span className={state === "todo" ? "text-zinc-400" : "font-medium text-zinc-800"}>{label}</span>
        <span className="text-zinc-400">{meta}</span>
        {can && <Icon name="chevron" className={`ml-auto h-3.5 w-3.5 text-zinc-400 transition ${open ? "rotate-90" : ""}`} />}
      </button>
      {open && can && <div className="mt-1.5 mb-2 pl-8">{children}</div>}
    </div>
  );
}

/** 같은 질문을 KB v1(보도자료·FAQ만)로 판정했을 때와 비교 — Liner가 찾은 후속 문서의 효과 */
/** 같은 건을 다시 판정했을 때: 무엇을 바꿨고 결론이 어떻게 됐는지(현장 피드백 11/22 — 내부 필드명 노출 금지, 쉬운 말) */
function PrevCompare({ prev, now, rows }: { prev: { verdict: CardData["verdict"]; headline: string; rows: [string, string][] }; now: CardData; rows: [string, string][] }) {
  const before = new Map(prev.rows);
  const after = new Map(rows);
  const keys = [...new Set([...before.keys(), ...after.keys()])].filter((k) => before.get(k) !== after.get(k));
  const sameVerdict = prev.verdict === now.verdict;
  const same = sameVerdict && prev.headline === now.headline;
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-[14px] text-zinc-700" role="status">
      <p className="flex flex-wrap items-center gap-2 font-semibold text-zinc-800">
        바뀐 조건으로 다시 판정했습니다 <Badge code={prev.verdict} size="sm" /> → <Badge code={now.verdict} size="sm" />
      </p>
      {keys.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5">
          {keys.map((k) => (
            <li key={k}>
              <span className="text-zinc-500">{k}</span> {before.get(k) ?? "(없음)"} → <b className="font-semibold text-zinc-900">{after.get(k) ?? "(없음)"}</b>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-zinc-500">판정에 쓰인 조건 목록은 그대로입니다.</p>
      )}
      <p className="mt-1.5 text-zinc-600">
        {same ? "조건은 바뀌었지만 이번 결론은 앞과 같습니다." : sameVerdict ? "결론 종류는 같고, 안내 내용이 달라졌습니다." : "결론이 달라졌습니다. 아래 결과와 근거를 확인하세요."}
      </p>
      <details className="mt-1.5">
        <summary className="cursor-pointer text-[13px] font-medium text-zinc-500 hover:text-zinc-800">이전 결과 보기</summary>
        <p className="mt-1 text-[13px] leading-relaxed text-zinc-600">{prev.headline}</p>
      </details>
    </div>
  );
}

function TimeMachine({ a, b }: { a: CardData; b: CardData }) {
  const judge = useJudge();
  const [v1, v2] = a.kb === "v1" ? [a, b] : [b, a];
  const newFacts = v2.factRefs.filter((f) => f.kb === "v2");
  // 창구 직원에게는 한 줄(예전 안내와 다를 수 있다는 사실)만, 전후 비교는 펼쳐야 보인다(심사위원·본점용)
  return (
    <details open={judge || undefined} className="group rounded-2xl border border-indigo-200 bg-indigo-50/60">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-[14px] text-indigo-950 [&::-webkit-details-marker]:hidden">
        <Icon name="spark" className="h-4 w-4 shrink-0 text-indigo-600" />
        <span>
          최근 정부 후속 지침으로 <b className="font-semibold">결론이 바뀐 건</b>입니다. 예전 기준으로는 &lsquo;{VERDICT_STYLE[v1.verdict].label}&rsquo;였습니다.
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-[13px] font-medium text-indigo-700">
          전후 비교
          <Icon name="chevron" className="h-3.5 w-3.5 transition group-open:rotate-90" />
        </span>
      </summary>
      <div className="px-4 pb-4">
        <p className="text-[14px] text-indigo-900/70">
          <Lines text="정부 발표 자료만 보면(근거 자료 v1) 결론이 다릅니다. Liner가 찾은 후속 문서를 반영한 지금(근거 자료 v2)의 판정이 위 카드입니다." />
        </p>
        <div className="mt-3 grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
          {[v1, v2].map((c, i) => (
            <div key={c.kb} className={`rounded-xl bg-white p-4 ring-1 ${i === 1 ? "ring-indigo-300" : "ring-zinc-200"} ${i === 1 ? "sm:order-3" : ""}`}>
              <div className="flex items-center gap-2">
                <Badge code={c.verdict} size="sm" />
                <span className="text-[12px] font-medium text-zinc-500">{c.kb === "v1" ? "근거 자료 v1 · 정부 발표 자료만" : "근거 자료 v2 · 후속 문서 반영"}</span>
              </div>
              <p className="mt-2 text-[14px] leading-relaxed text-zinc-800">
                <Lines text={c.headline} />
              </p>
            </div>
          ))}
          <span className="hidden self-center text-indigo-600 sm:order-2 sm:block">
            <Icon name="chevron" className="h-5 w-5" />
          </span>
        </div>
        {newFacts.length > 0 && <p className="mt-3 text-[13px] text-indigo-800">달라진 이유: Liner가 찾은 후속 문서 근거 {newFacts.map((f) => f.id).join(", ")}</p>}
      </div>
    </details>
  );
}
