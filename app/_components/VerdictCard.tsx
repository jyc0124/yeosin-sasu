"use client";
// 판정 표시 조각: 상태 배지, 판정 본문(결론·고객 확인 질문·조건·서류), 근거 원문 목록, 판정 경로.
// 창구 화면은 본문을 가운데, 근거·경로를 오른쪽 패널에 놓는다.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { lastResearch, researchLine } from "@/lib/research/history";
import { VERDICT_STYLE } from "./labels";
import type { CardData } from "./types";
import type { FaqGuide } from "@/lib/hq/faq";
import { Lines } from "./Lines";
import { useJudge } from "./viewStore";
import { AnswerCard, type Drafts } from "./AnswerCard";
import { isHqItem, type AnswerState } from "./answerItems";

export function Badge({ code, size = "md" }: { code: CardData["verdict"]; size?: "sm" | "md" | "lg" }) {
  const s = VERDICT_STYLE[code];
  const cls = size === "sm" ? "gap-1 px-2 py-0.5 text-xs" : size === "lg" ? "gap-2 px-3.5 py-1.5 text-[16px]" : "gap-1.5 px-2.5 py-1 text-sm";
  const dot = size === "lg" ? "h-2 w-2 bg-white/90" : `h-1.5 w-1.5 ${s.dot}`;
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ring-1 ring-inset ${cls} ${size === "lg" ? `${s.solid} shadow-sm` : s.badge}`}>
      <span className={`rounded-full ${dot}`} />
      {s.label}
    </span>
  );
}

// 결론·조건 문장 속 날짜·기간·금액을 강조한다(창구에서 고객에게 꼭 말해야 하는 숫자).
const EMPH = /('?\d{2,4}[.\/]\d{1,2}(?:[.\/]\d{1,2})?\.?|\d+(?:\.\d+)?\s?(?:억\s?원?|만\s?원|개월|영업일|년|%))/g;
// 'A은행 지침 제N조'는 지침 공개 화면의 해당 조항으로 연결한다
const BANK = /(A은행 지침 제\d+조)/g;
function BankLinks({ text }: { text: string }) {
  const parts = text.split(BANK);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={`/bank#art-${p.match(/\d+/)![0]}`} target="_blank" rel="noreferrer" className="text-indigo-700 underline decoration-indigo-200 underline-offset-2 hover:decoration-indigo-500">
            {p}
          </a>
        ) : (
          p
        ),
      )}
    </>
  );
}

export function Emph({ text, mark }: { text: string; mark?: boolean }) {
  const parts = text.split(EMPH);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className={mark ? "rounded-[3px] bg-[linear-gradient(transparent_55%,#fde68a_55%)] px-0.5 font-bold text-zinc-950" : "font-semibold text-zinc-950"}>
            {p}
          </span>
        ) : (
          <BankLinks key={i} text={p} />
        ),
      )}
    </>
  );
}

/** 문장 끝 근거 번호(Liner식 인용). 누르면 오른쪽 근거 패널의 해당 원문으로 이동해 강조한다. */
export function Cite({ id, order }: { id: string; order: string[] }) {
  const n = order.indexOf(id) + 1;
  return (
    <button
      type="button"
      title={`근거 ${n > 0 ? n : id} 보기`}
      onClick={() => window.dispatchEvent(new CustomEvent("cite:focus", { detail: id }))}
      className="mx-0.5 inline-grid h-[18px] min-w-[18px] -translate-y-px place-items-center rounded-full bg-zinc-200/80 px-1 align-middle font-mono text-[12px] font-semibold leading-none text-zinc-600 hover:bg-indigo-600 hover:text-white"
    >
      {n > 0 ? n : id}
    </button>
  );
}

/** 인용 번호가 붙은 문장: 마우스를 올리면 Liner처럼 연한 하이라이트 */
export function Cited({ children, ids, order }: { children: React.ReactNode; ids: string[]; order: string[] }) {
  return (
    <span className="rounded-[3px] decoration-clone transition-colors hover:bg-indigo-50">
      {children}
      {ids.map((id) => (
        <Cite key={id} id={id} order={order} />
      ))}
    </span>
  );
}

const fmt = (d?: string) => (d ? `${d.slice(0, 4)}.${Number(d.slice(5, 7))}.${Number(d.slice(8))}` : "");

function Block({ title, icon, tone, children }: { title: string; icon: string; tone?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-zinc-100 px-6 py-5">
      <h3 className={`mb-3 flex items-center gap-1.5 text-[14px] font-semibold ${tone ?? "text-zinc-500"}`}>
        <Icon name={icon} className="h-4 w-4" />
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * 판정 본문(창구 직원용). 현장 피드백(11/22)에 따라 세 구역으로 나눈다:
 *  ① 지금 답할 수 있는 내용(결론·확인된 기준) ② 고객에게 더 확인할 내용(항목별 답변) ③ 본점·기관 확인이 필요한 내용
 * 그 뒤 할 일 → 주의 → [접힘] 왜 이렇게 판단했나요
 */
export function VerdictMain({
  card,
  onAnswer,
  busy,
  guide,
  drafts,
  onDraft,
}: {
  card: CardData;
  onAnswer?: (answer: string) => void;
  busy?: boolean;
  guide?: FaqGuide;
  drafts?: Drafts;
  onDraft?: (q: string, s: AnswerState) => void;
}) {
  const [done, setDone] = useState<Set<string>>(new Set());
  // 작성 중인 답을 부모가 주지 않으면(단독 카드) 이 카드 안에서 들고 있는다
  const [localDrafts, setLocalDrafts] = useState<Drafts>({});
  const judge = useJudge();
  const s = VERDICT_STYLE[card.verdict];
  const order = card.factRefs.map((f) => f.id);
  const lastFacts = (card.trace.at(-1)?.facts ?? []).filter((id) => order.includes(id));
  const openGaps = card.gapRefs.filter((g) => !(g.resolved && card.kb === "v2"));
  const conditions = guide?.conditions ?? card.conditions;
  const todos = [guide?.action ?? s.action, ...card.documents.map((d) => `서류: ${d}`)];
  const toggle = (t: string) => setDone((p) => { const n = new Set(p); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const branchButtons = !!(onAnswer && card.branches);
  // 고객에게 묻는 질문과 본점·기관이 확인할 항목을 나눈다('… 본점 확인'은 고객 질문이 아님)
  const askQs = card.questions.filter((q) => !isHqItem(q));
  const hqQs = card.questions.filter(isHqItem);
  // 기준 답변(M0·근거 조회)의 확인된 기준은 접지 않고 '확인된 내용'으로 바로 보인다
  const confirmedOpen = card.module === "M0" && !!card.basis?.length;
  const partial = card.verdict === "보류" && !!card.basis?.some((b) => !b.note);
  const moreCount = (confirmedOpen ? 0 : card.basis?.length ?? 0) + (card.trace.length > 1 ? 1 : 0) + (card.branches && !branchButtons ? 1 : 0);
  const dr = drafts ?? localDrafts;
  const setDr = onDraft ?? ((q: string, v: AnswerState) => setLocalDrafts((p) => ({ ...p, [q]: v })));

  return (
    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <header className={`bg-gradient-to-b ${s.tint} to-white px-6 pt-5 pb-5`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={`inline-flex items-center gap-2.5 text-[28px] font-bold leading-tight tracking-tight ${s.fg}`}>
            <span className={`h-4 w-4 shrink-0 rounded-full ${s.light}`} />
            {s.label}
          </span>
          {partial && <span className="rounded-full bg-white px-2.5 py-0.5 text-[13px] font-semibold text-indigo-700 ring-1 ring-indigo-200">일부는 확인됨</span>}
          <span className="ml-auto text-[13px] text-zinc-400">기준일 {fmt(card.asOf)}</span>
        </div>
        <p className="mt-3 text-[19px] font-medium leading-[1.55] text-zinc-900 [text-wrap:balance]">
          {/* 문장마다 한 줄, 인용 번호는 마지막 문장 끝에 */}
          <Lines
            text={guide?.headline ?? card.headline}
            render={(x, last) =>
              last ? (
                <Cited ids={lastFacts} order={order}>
                  <Emph text={x} mark />
                </Cited>
              ) : (
                <Emph text={x} mark />
              )
            }
          />
        </p>
        {card.premise && (
          <p className="mt-2.5 flex gap-1.5 rounded-lg bg-white/80 px-3 py-2 text-[14px] leading-relaxed text-zinc-700 ring-1 ring-inset ring-zinc-200">
            <span className="shrink-0 font-semibold text-zinc-900">전제</span>
            <span>{card.premise}</span>
          </p>
        )}
        {isBank(guide?.headline ?? card.headline) && (
          <p className="mt-2 text-[13px] text-violet-700">
            <BankPill />이 결론은 가상 A은행 지침을 따릅니다. 실제 은행마다 기준이 다를 수 있습니다.
          </p>
        )}
        {guide && (
          <p className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-[15px] text-teal-900 ring-1 ring-inset ring-teal-200">
            <span className="mr-1.5 rounded bg-teal-700 px-1.5 py-0.5 text-[12px] font-semibold text-white">본점 해석 {guide.id}</span>
            {guide.conclusion}
          </p>
        )}
        {card.needsLatest && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[14px] text-amber-800 ring-1 ring-inset ring-amber-200">
            최신 정보가 필요한 판정입니다. 정부 후속 지침은 본점이{" "}
            <Link href="/watch" className="font-semibold underline">
              정책 감시
            </Link>
            로 반영합니다. {guide ? "그 전까지는 본점 해석대로 처리하세요." : "급한 건이면 본점에 질의하세요."}
          </p>
        )}
      </header>

      {confirmedOpen && (
        <Block title={card.verdict === "안내" ? "확인된 내용" : "정부 발표 자료로 확인된 내용"} icon="check" tone="text-indigo-700">
          <BasisList card={card} order={order} />
        </Block>
      )}

      {askQs.length > 0 &&
        (onAnswer ? (
          <AnswerCard questions={askQs} branches={card.branches} drafts={dr} onDraft={setDr} busy={busy} onSubmit={onAnswer} />
        ) : (
          <Block title="고객에게 확인할 내용" icon="question" tone="text-orange-600">
            <ol className="space-y-2">
              {askQs.map((q, i) => (
                <li key={q} className="flex gap-3 text-[16px] leading-relaxed text-zinc-900">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-orange-500 text-[12px] font-bold text-white">{i + 1}</span>
                  <span className="font-semibold">{q}</span>
                </li>
              ))}
            </ol>
          </Block>
        ))}

      {(hqQs.length > 0 || openGaps.length > 0) && (
        <Block title="본점·기관 확인이 필요한 내용" icon="building" tone="text-amber-700">
          <p className="-mt-1 mb-2.5 text-[14px] text-zinc-500">고객에게 더 물어도 풀리지 않는 부분입니다. 정부 발표 자료에 기준이 없거나 판정 범위 밖입니다.</p>
          <ul className="space-y-2">
            {hqQs.map((q) => (
              <li key={q} className="flex gap-2.5 text-[15px] leading-relaxed text-zinc-800">
                <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                <span>{q}</span>
              </li>
            ))}
            {openGaps.map((g) => (
              <li key={g.id} className="flex gap-2.5 text-[15px] leading-relaxed text-zinc-800">
                {judge ? <span className="mt-0.5 shrink-0 rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[12px] font-semibold text-amber-800">{g.id}</span> : <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />}
                <span>{g.topic}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block title="할 일" icon="check" tone="text-zinc-700">
        <ul className="space-y-2">
          {todos.map((t) => (
            <li key={t}>
              <label className="flex cursor-pointer gap-3 text-[16px] leading-relaxed text-zinc-800">
                <input type="checkbox" checked={done.has(t)} onChange={() => toggle(t)} className="mt-1 h-5 w-5 shrink-0 accent-indigo-600" />
                <span className={done.has(t) ? "text-zinc-400 line-through" : ""}>
                  {isBank(t) && <BankPill />}
                  {t}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </Block>

      {conditions.length > 0 && (
        <Block title={card.verdict === "조건부" ? "꼭 지켜야 할 조건" : "주의"} icon="shield" tone={card.verdict === "조건부" ? "text-sky-700" : undefined}>
          <ul className="space-y-2">
            {conditions.map((c) => (
              <li key={c} className="flex gap-2.5 text-[16px] leading-relaxed text-zinc-800">
                <Icon name="check" className={`mt-1 h-4 w-4 shrink-0 ${isBank(c) ? "text-violet-500" : "text-sky-600"}`} />
                <span>
                  {isBank(c) && <BankPill />}
                  <Emph text={c} />
                </span>
              </li>
            ))}
          </ul>
          {conditions.some(isBank) && <BankNote />}
        </Block>
      )}

      {/* 근거·판정 과정은 접어 둔다(지우지 않음 — 근거 번호는 오른쪽 근거 목록과 그대로 연결) */}
      {moreCount > 0 && (
        <details open={judge || undefined} className="group border-t border-zinc-100">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-6 py-4 text-[15px] font-semibold text-zinc-600 hover:text-zinc-900 [&::-webkit-details-marker]:hidden">
            <Icon name="chevron" className="h-4 w-4 transition group-open:rotate-90" />
            왜 이렇게 판단했나요?
            <span className="font-normal text-zinc-400">· 정부 발표 자료 근거 {card.factRefs.length}건</span>
          </summary>
          <div className="space-y-5 px-6 pb-5">
            {!confirmedOpen && card.basis && card.basis.length > 0 && (
              <div>
                <p className="mb-2 text-[13px] font-semibold text-indigo-700">함께 적용되는 기준</p>
                <BasisList card={card} order={order} />
              </div>
            )}
            {card.branches && !branchButtons && (
              <div>
                <p className="mb-2 text-[13px] font-semibold text-indigo-700">답에 따라 이렇게 갈립니다 — {card.branches.on}</p>
                <ul className="space-y-2">
                  {card.branches.options.map((o) => (
                    <li key={o.when} className="rounded-xl border border-zinc-200 p-3">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-semibold text-zinc-900">{o.when}이면</span>
                        <Badge code={o.verdict} size="sm" />
                      </span>
                      <p className="mt-1 text-[14px] leading-relaxed text-zinc-700">{o.headline}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {card.trace.length > 1 && (
              <div>
                <p className="mb-2 text-[13px] font-semibold text-zinc-500">판정 과정</p>
                <ol className="space-y-1.5">
                  {card.trace.map((t, i) => (
                    <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed text-zinc-600">
                      <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300" />
                      <span className="min-w-0">
                        <span className="font-medium text-zinc-800">{t.step.replace(/^[A-Z]\d+\s*/, "")}</span> — {t.result}
                        {t.facts.filter((id) => order.includes(id)).map((id) => (
                          <Cite key={id} id={id} order={order} />
                        ))}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </details>
      )}
    </article>
  );
}

/** 확인된 기준 목록(규제·하위 질문별). 절 문장은 원문 그대로, 대상이 다르면 따로 표시 */
function BasisList({ card, order }: { card: CardData; order: string[] }) {
  return (
    <ul className="space-y-3">
      {(card.basis ?? []).map((b) => (
        <li key={b.label + b.text} className="text-[15px] leading-relaxed text-zinc-800">
          <span className="mb-0.5 block text-[13px] font-semibold text-indigo-800">{b.label}</span>
          <span>
            <Emph text={b.text} />
            {b.facts.filter((id) => order.includes(id)).map((id) => (
              <Cite key={id} id={id} order={order} />
            ))}
          </span>
          {b.note && <span className="mt-1 block rounded-md bg-amber-50 px-2 py-1 text-[13px] text-amber-800 ring-1 ring-inset ring-amber-200">대상 다름 · {b.note}</span>}
        </li>
      ))}
    </ul>
  );
}

/** 근거 원문 목록(오른쪽 패널). 번호는 본문 인용 번호와 같다. */
export function EvidenceList({ card }: { card: CardData }) {
  // 창구 화면: 조항 코드(F401-01·'401본 2-(1)') 대신 문서 이름만. 코드·링크·판정 단계는 심사위원 설명에서
  const judge = useJudge();
  const [active, setActive] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      setActive(id);
      document.getElementById(`ev-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => setActive((a) => (a === id ? null : a)), 2200);
    };
    window.addEventListener("cite:focus", on);
    return () => window.removeEventListener("cite:focus", on);
  }, []);
  if (card.factRefs.length === 0 && card.gapRefs.length === 0) return <p className="text-[14px] text-zinc-400">인용한 정부 발표 자료가 없습니다.</p>;
  return (
    <ul className="space-y-2.5">
      {card.factRefs.map((f, i) => {
        const steps = card.trace.filter((t) => t.facts.includes(f.id));
        return (
          <li
            key={f.id}
            id={`ev-${f.id}`}
            className={`scroll-mt-6 rounded-xl border bg-white p-3 transition-shadow ${
              active === f.id ? "border-indigo-400 shadow-[0_0_0_3px_rgba(23,148,131,0.18)]" : f.kb === "v2" ? "border-indigo-200" : "border-zinc-200"
            }`}
          >
            <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-zinc-500">
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-zinc-900 px-1 font-mono text-[12px] font-semibold text-white">{i + 1}</span>
              {judge && <span className="font-mono font-semibold text-zinc-700">{f.id}</span>}
              {f.kb === "v2" && (
                <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-700">
                  <Icon name="spark" className="h-3 w-3" />
                  Liner로 찾은 후속 문서
                </span>
              )}
              <span className="truncate" title={judge ? f.sourceTitle : f.source}>
                {judge ? f.source : f.sourceTitle}
              </span>
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-zinc-700">{f.text}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <a
                href={`${f.viewer ?? `/source/${f.id}`}#hl`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-indigo-600"
              >
                <Icon name="doc" className="h-3.5 w-3.5" />
                정부 발표 자료에서 보기
              </a>
            </div>
            {/* 공식 게시 페이지(게시 위치 안내 포함)와, 공식 사이트가 막혀도 열리는 원본 파일 저장본 */}
            {judge && (f.url || f.file) && (
              <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-400">
                {f.url && (
                  <>
                    <a href={f.url} target="_blank" rel="noreferrer" className="text-zinc-500 underline decoration-zinc-300 hover:text-zinc-800" title={f.sourceTitle}>
                      공식 게시 페이지 ↗
                    </a>
                    {f.urlNote && <> ({f.urlNote})</>}
                  </>
                )}
                {f.url && f.file && " · "}
                {f.file && (
                  <a href={f.file.href} target="_blank" rel="noreferrer" className="whitespace-nowrap text-zinc-500 underline decoration-zinc-300 hover:text-zinc-800" title="공식 첨부와 같은 원본 파일입니다. 공식 사이트가 열리지 않을 때 쓰세요.">
                    원본 파일({f.file.ext})
                  </a>
                )}
              </p>
            )}
            {judge && steps.length > 0 && (
              <div className="mt-2 border-t border-zinc-100 pt-2">
                <button
                  type="button"
                  onClick={() => setWhy((w) => (w === f.id ? null : f.id))}
                  className="flex w-full items-center gap-1 text-[12px] font-medium text-zinc-500 hover:text-zinc-800"
                >
                  이 근거가 쓰인 이유
                  <Icon name="chevron" className={`ml-auto h-3 w-3 transition ${why === f.id ? "rotate-90" : ""}`} />
                </button>
                {why === f.id && (
                  <ul className="mt-1.5 space-y-1 text-[13px] leading-relaxed text-zinc-600">
                    {steps.map((t, j) => (
                      <li key={j}>
                        <b className="font-semibold text-zinc-800">{t.step}</b> — {t.result}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        );
      })}
      {/* 공백은 '자료'가 아니므로 제목 수에 세지 않고 따로 묶는다 */}
      {card.gapRefs.length > 0 && (
        <li className="px-1 pt-2 text-[13px] font-semibold text-amber-800">정부 발표 자료에 없는 부분 {card.gapRefs.length}</li>
      )}
      {card.gapRefs.map((g) => (
        <li key={g.id} className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-3">
          <div className="text-[12px] text-amber-700">
            {judge && <span className="mr-1 font-mono font-semibold">{g.id}</span>}정부 발표 자료에 없음{g.resolved && card.kb === "v2" ? " (후속 문서로 해소)" : ""}
          </div>
          <p className="mt-1.5 text-[14px] text-zinc-800">{g.topic}</p>
          {/* 지점은 직접 조사하지 않는다(해석은 본점). 본점이 Liner로 조사해 원문 대조까지 마친 기록을 창구에서 쓸 문장으로 보여 준다 */}
          {!(g.resolved && card.kb === "v2") && <GapCounterNote gapId={g.id} />}
        </li>
      ))}
    </ul>
  );
}

/** 판정 경로: 규칙 엔진이 거친 단계 */
export function TraceList({ card }: { card: CardData }) {
  return (
    <ol className="relative space-y-3 pl-5 before:absolute before:top-1.5 before:bottom-1.5 before:left-[5px] before:w-px before:bg-zinc-200">
      {card.trace.map((t, i) => (
        <li key={i} className="relative text-[14px] leading-relaxed">
          <span className="absolute top-1.5 -left-5 h-[11px] w-[11px] rounded-full border-2 border-white bg-zinc-400 ring-1 ring-zinc-200" />
          <span className="font-semibold text-zinc-900">{t.step}</span>
          <span className="text-zinc-600"> — {t.result}</span>
          {t.facts.map((id) => (
            <Cite key={id} id={id} order={card.factRefs.map((f) => f.id)} />
          ))}
        </li>
      ))}
    </ol>
  );
}

const GAP_SCRIPT = "이 부분은 아직 정부 기준이 발표되지 않아, 본점에 확인한 뒤 안내드리겠습니다.";

/** 정부 발표 자료에 없는 쟁점: 본점 조사 기록(있으면) + 고객에게 할 말 */
function GapCounterNote({ gapId }: { gapId: string }) {
  const r = lastResearch(gapId);
  const [copied, setCopied] = useState(false);
  const d = r ? `${Number(r.date.slice(5, 7))}.${Number(r.date.slice(8, 10))}` : "";
  return (
    <div className="mt-2 space-y-2">
      <p className="flex items-start gap-1 text-[12px] leading-relaxed text-teal-800">
        <Icon name="spark" className="mt-0.5 h-3 w-3 shrink-0" />
        {r
          ? r.result === "공식 근거 없음"
            ? `본점이 Liner로 공식 출처 ${r.official}건을 확인했지만(${d} 조사) 아직 정부 기준이 없습니다.`
            : researchLine(r)
          : "아직 정부 발표 자료에 기준이 없습니다. 본점이 Liner로 후속 발표를 추적합니다."}
      </p>
      <div className="rounded-lg bg-white px-2.5 py-2 ring-1 ring-amber-200">
        <p className="text-[12px] font-semibold text-zinc-500">고객에게는 이렇게</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-800">&ldquo;{GAP_SCRIPT}&rdquo;</p>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(GAP_SCRIPT).then(() => setCopied(true), () => {});
          }}
          className="mt-1 text-[12px] font-medium text-indigo-600 hover:underline"
        >
          {copied ? "복사했습니다" : "문장 복사"}
        </button>
      </div>
    </div>
  );
}

/** 가상 A은행 지침에서 온 문장인지(정부 발표 자료가 아니라 은행마다 다를 수 있는 부분) */
const isBank = (t: string) => t.includes("A은행");

function BankPill() {
  return (
    <span title="가상 A은행 지침에서 온 내용입니다. 정부 규정이 아니라 은행마다 다를 수 있습니다." className="mr-1.5 inline-flex rounded bg-violet-100 px-1.5 py-px align-[1px] text-[11px] font-semibold text-violet-700">
      은행 지침
    </span>
  );
}

function BankNote() {
  return (
    <p className="mt-3 rounded-lg bg-violet-50 px-3 py-2 text-[13px] leading-relaxed text-violet-800">
      <b>은행 지침</b> 표시는 가상 A은행 기준(서류·기간·절차)입니다. 결론의 기준인 정부 규정과 달리 은행마다 다를 수 있습니다.
    </p>
  );
}
