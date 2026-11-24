"use client";
// 고객 확인 질문에 항목별로 답하고 한 번에 다시 판정하는 카드(현장 피드백 11/22 · UI 상세 수정안 §4).
// - 선택지를 눌러도 바로 판정하지 않는다(작성 중인 답만 바뀜). '답변 반영하고 판정' 한 번으로 보낸다.
// - 빈칸(아직 안 씀)·미확인(고객도 모름)·입력 완료를 구분한다. 미확인은 '아니오'나 0으로 바꾸지 않는다.
// - 작성 중인 답은 부모(Copilot)가 들고 있어서, 다시 판정 중이거나 실패해도 지워지지 않는다.
import { useId, useState } from "react";
import { Badge } from "./VerdictCard";
import { Icon } from "./Icon";
import type { CardData } from "./types";
import { answerLine, composeAnswers, dateError, EMPTY, groupFor, status, type AnswerGroup, type AnswerItem, type AnswerState } from "./answerItems";

export type Drafts = Record<string, AnswerState>;

export function AnswerCard({
  questions,
  branches,
  drafts,
  onDraft,
  busy,
  onSubmit,
}: {
  questions: string[];
  branches?: CardData["branches"];
  drafts: Drafts;
  onDraft: (q: string, s: AnswerState) => void;
  busy?: boolean;
  onSubmit: (text: string) => void;
}) {
  const groups = questions.map(groupFor);
  const items = groups.flatMap((g) => g.items);
  const [free, setFree] = useState("");
  const [tried, setTried] = useState(false);
  const st = (q: string) => drafts[q] ?? EMPTY;
  const counts = items.reduce(
    (a, it) => {
      a[status(drafts[it.q])]++;
      return a;
    },
    { empty: 0, unknown: 0, done: 0 } as Record<"empty" | "unknown" | "done", number>,
  );
  const errors = new Map(items.filter((it) => it.kind === "date" && !st(it.q).unknown).map((it) => [it.q, dateError(st(it.q).text)] as const).filter(([, e]) => !!e));
  const lines = groups.flatMap((g) => g.items.map((it) => answerLine(it, st(it.q), g.items.length > 1 ? g.title : undefined))).filter((l): l is string => !!l);

  const submit = () => {
    setTried(true);
    if (errors.size) {
      // 첫 오류 항목으로 이동
      const first = groups.findIndex((g) => g.items.some((it) => errors.has(it.q)));
      document.getElementById(`ans-${first}`)?.querySelector<HTMLInputElement>("input[type=text]")?.focus();
      return;
    }
    if (!lines.length || busy) return;
    onSubmit(composeAnswers(lines));
  };

  return (
    <section className="border-t border-zinc-100 px-6 py-5" aria-labelledby="ask-title">
      <h3 id="ask-title" className="flex items-center gap-1.5 text-[15px] font-semibold text-orange-600">
        <Icon name="question" className="h-4 w-4" />
        고객에게 확인할 내용 {groups.length}가지
      </h3>
      <p className="mt-1 text-[14px] text-zinc-500">항목마다 답을 고르거나 적은 뒤 아래 버튼을 한 번 누르세요. 모르는 항목은 &lsquo;미확인&rsquo;으로 남겨 주세요.</p>

      {branches && <BranchPreview branches={branches} />}

      <ol className="mt-4 space-y-3">
        {groups.map((g, i) => (
          <Group key={g.q} id={`ans-${i}`} n={i + 1} group={g} st={st} errorOf={(q) => (tried || st(q).text ? errors.get(q) ?? null : null)} onDraft={onDraft} disabled={busy} />
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-[13px] text-zinc-500" aria-live="polite">
          작성 {counts.done}개 · 미확인 {counts.unknown}개 · 빈칸 {counts.empty}개
          {lines.length > 0 && !busy && <span className="ml-1.5 text-amber-700">· 아직 판정에 반영하지 않은 답변입니다</span>}
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={busy || lines.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-indigo-700 disabled:bg-zinc-300"
        >
          {busy ? "판정 중…" : "답변 반영하고 판정"}
          <Icon name="arrowUp" className="h-4 w-4 rotate-90" />
        </button>
      </div>

      {/* 두 번째 방법: 고객 말을 문장 그대로. 항목별 답과 함께 보내지 않는다(둘 중 하나) */}
      <div className="mt-4 flex items-center gap-3 text-[13px] font-semibold text-zinc-400">
        <span className="h-px flex-1 bg-zinc-200" />
        또는
        <span className="h-px flex-1 bg-zinc-200" />
      </div>
      <form
        className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (free.trim() && !busy) {
            onSubmit(free.trim());
            setFree("");
          }
        }}
      >
        <p className="text-[14px] font-semibold text-zinc-800">고객이 한 말을 문장 그대로 적기</p>
        <p className="mt-0.5 text-[13px] text-zinc-500">여러 사정을 한꺼번에 들었을 때 편합니다. 이 문장만으로 다시 판정하고, 위에서 고른 답은 함께 보내지 않습니다.</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
          <textarea
            value={free}
            onChange={(e) => setFree(e.target.value)}
            rows={2}
            placeholder="예) 서울 아파트이고 대출금은 그대로예요. 임차인이 가족인지는 몰라요."
            className="min-w-0 flex-1 resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[15px] outline-none focus:border-zinc-400"
            disabled={busy}
          />
          <button type="submit" disabled={busy || !free.trim()} className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-30">
            문장으로 판정
          </button>
        </div>
      </form>
    </section>
  );
}

function Group({
  id,
  n,
  group,
  st,
  errorOf,
  onDraft,
  disabled,
}: {
  id: string;
  n: number;
  group: AnswerGroup;
  st: (q: string) => AnswerState;
  errorOf: (q: string) => string | null;
  onDraft: (q: string, s: AnswerState) => void;
  disabled?: boolean;
}) {
  const uid = useId();
  const sts = group.items.map((it) => status(st(it.q)));
  const tone = sts.every((x) => x === "done") ? "border-indigo-200 bg-indigo-50/30" : sts.every((x) => x === "unknown") ? "border-zinc-200 bg-zinc-50" : "border-zinc-200 bg-white";
  const many = group.items.length > 1;
  return (
    <li id={id} className={`rounded-xl border p-3.5 transition ${tone}`}>
      <div className="flex gap-2.5">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-orange-500 text-[12px] font-bold text-white">{n}</span>
        <div className="min-w-0 flex-1">
          <p id={`${uid}-q`} className="text-[16px] font-semibold leading-snug text-zinc-900">
            {group.title}
          </p>
          {group.hint && <p className="mt-0.5 text-[13px] leading-snug text-zinc-500">{group.hint}</p>}
          <div className={many ? "mt-2.5 space-y-3" : ""}>
            {group.items.map((it) => (
              <Field key={it.q} item={it} label={many ? it.label : undefined} labelledBy={`${uid}-q`} s={st(it.q)} error={errorOf(it.q)} onChange={(s) => onDraft(it.q, s)} disabled={disabled} />
            ))}
          </div>
        </div>
      </div>
    </li>
  );
}

function Field({ item, label, labelledBy, s, error, onChange, disabled }: { item: AnswerItem; label?: string; labelledBy: string; s: AnswerState; error: string | null; onChange: (s: AnswerState) => void; disabled?: boolean }) {
  const uid = useId();
  const pick = (o: string) => {
    if (item.kind === "multi") {
      if (o === item.none) return onChange({ ...s, unknown: false, picks: s.picks.includes(o) ? [] : [o] });
      const base = s.picks.filter((p) => p !== item.none);
      return onChange({ ...s, unknown: false, picks: base.includes(o) ? base.filter((p) => p !== o) : [...base, o] });
    }
    onChange({ ...s, unknown: false, picks: s.picks[0] === o ? [] : [o] });
  };
  const options = [...item.options, ...(item.none ? [item.none] : [])];
  const unknownBtn = (
      <button
        type="button"
        role="checkbox"
        aria-checked={s.unknown}
        disabled={disabled}
        onClick={() => onChange(s.unknown ? EMPTY : { picks: [], text: "", unknown: true })}
        className={`inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-[14px] transition disabled:opacity-50 ${s.unknown ? "border-zinc-600 bg-zinc-600 font-semibold text-white" : "border-zinc-300 text-zinc-500 hover:border-zinc-500"}`}
      >
        {s.unknown && <Icon name="check" className="h-3.5 w-3.5" />}
        미확인
      </button>
  );
  return (
    <div className={label ? "border-l-2 border-zinc-200 pl-3" : ""}>
      {label && (
        <p id={`${uid}-l`} className="text-[14px] font-semibold text-zinc-700">
          {label}
        </p>
      )}
      {options.length > 0 && (
      <div role={item.kind === "multi" ? "group" : "radiogroup"} aria-labelledby={label ? `${uid}-l` : labelledBy} className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = s.picks.includes(o);
          return (
            <button
              key={o}
              type="button"
              role={item.kind === "multi" ? "checkbox" : "radio"}
              aria-checked={on}
              disabled={disabled}
              onClick={() => pick(o)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[14px] transition disabled:opacity-50 ${on ? "border-indigo-600 bg-indigo-600 font-semibold text-white" : "border-zinc-300 bg-white text-zinc-700 hover:border-indigo-400"}`}
            >
              {on && <Icon name="check" className="h-3.5 w-3.5" />}
              {o}
            </button>
          );
        })}
        {unknownBtn}
      </div>
      )}
      {options.length === 0 && s.unknown && <div className="mt-1.5">{unknownBtn}</div>}
      {!s.unknown && (item.kind !== "single" || item.placeholder) && (
        <div className="mt-1.5 flex items-start gap-1.5">
        <label className="block min-w-0 flex-1">
          <span className="sr-only">{label ?? "직접 입력"}</span>
          <input
            type="text"
            value={s.text}
            disabled={disabled}
            onChange={(e) => onChange({ ...s, unknown: false, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault(); // 항목 입력에서 뜻하지 않은 제출 막기
            }}
            inputMode={item.kind === "date" ? "numeric" : undefined}
            placeholder={item.placeholder ?? (item.kind === "multi" ? "덧붙일 내용(선택)" : "고객 답을 짧게 적어 주세요")}
            aria-invalid={!!error}
            aria-describedby={error ? `${uid}-err` : undefined}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-[15px] outline-none placeholder:text-zinc-400 ${error ? "border-rose-400 focus:border-rose-500" : "border-zinc-200 focus:border-zinc-400"}`}
          />
          {error && (
            <span id={`${uid}-err`} className="mt-1 block text-[13px] font-medium text-rose-700">
              {error}
            </span>
          )}
        </label>
        {options.length === 0 && <div className="pt-0.5">{unknownBtn}</div>}
        </div>
      )}
      {s.unknown && <p className="mt-2 text-[13px] text-zinc-500">미확인으로 보냅니다. 이 사실이 필요한 결론은 확정하지 않습니다.</p>}
    </div>
  );
}

/** 답에 따라 결론이 어떻게 갈리는지 미리 보기(규칙 엔진이 값마다 낸 결론). 눌러도 판정하지 않는다 */
function BranchPreview({ branches }: { branches: NonNullable<CardData["branches"]> }) {
  return (
    <div className="mt-3 rounded-xl bg-zinc-50 px-3.5 py-3 ring-1 ring-inset ring-zinc-200">
      <p className="text-[13px] font-semibold text-zinc-600">미리 보기 · {branches.on}에 따라 결론이 갈립니다</p>
      <ul className="mt-1.5 space-y-1">
        {branches.options.map((o) => (
          <li key={o.when} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px] text-zinc-700">
            <span className="font-medium text-zinc-900">{o.when}</span>
            <span className="text-zinc-400">→</span>
            <Badge code={o.verdict} size="sm" />
          </li>
        ))}
      </ul>
    </div>
  );
}
