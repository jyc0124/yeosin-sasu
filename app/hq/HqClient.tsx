"use client";
// 본점(여신기획부) 화면: 지점 질의 회신 → 승인하면 사례 FAQ 등록. 지식 버전이 바뀌면 FAQ 재검토 표시.
import Link from "next/link";
import { useEffect, useState } from "react";
import { reviewFaq } from "@/lib/hq/faq";
import { findOpenExternal, planExternal } from "@/lib/hq/external";
import { findAvoidance, findPii } from "@/lib/hq/guard";
import { today } from "@/lib/rules/dates";
import { approveFaq, decideCommittee, postExternal, resetHq, useHq } from "../_components/hqStore";
import type { CommitteeResult } from "@/lib/hq/committee";
import { InquiryDoc } from "../_components/HqPanels";
import { useKb } from "../_components/kbStore";
import { KB_LABEL } from "../_components/labels";
import { Badge } from "../_components/VerdictCard";
import { Icon } from "../_components/Icon";
import type { Inquiry } from "@/lib/hq/faq";
import { resolveGaps } from "@/lib/kb";
import { lastResearch, researchLine } from "@/lib/research/history";
import type { ResearchResult } from "@/lib/research/live";
import { ResearchDocs, fmtAt, runResearch, savedResearch, type SavedResearch } from "../_components/GapResearch";
import { useJudge } from "../_components/viewStore";

const fmt = (d: string) => `${d.slice(0, 4)}.${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;

export function HqClient() {
  const judge = useJudge();
  const hq = useHq();
  const [kb] = useKb();
  const [tab, setTab] = useState<"inbox" | "faq">("inbox");
  const [openId, setOpenId] = useState<string | null>(null);

  const pending = hq.inquiries.filter((i) => i.status === "pending");
  const waiting = hq.inquiries.filter((i) => i.status === "external");
  const deciding = hq.inquiries.filter((i) => i.status === "answered" && i.committee?.stage === "submitted"); // 심사 결과 입력 대기
  const answered = hq.inquiries.filter((i) => i.status === "answered" && i.committee?.stage !== "submitted");
  const reviews = hq.faqs.map((f) => ({ f, rv: reviewFaq(f, kb) }));
  const reviewCount = reviews.filter((r) => r.rv.status === "review").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl bg-zinc-100 p-1">
          {(
            [
              ["inbox", "지점 질의", pending.length + waiting.length + deciding.length],
              ["faq", "사례 FAQ", hq.faqs.length],
            ] as const
          ).map(([k, label, n]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-lg px-3.5 py-1.5 text-[14px] font-medium ${tab === k ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"}`}
            >
              {label}
              {n > 0 && <span className={`ml-1.5 rounded-full px-1.5 text-[12px] ${tab === k ? "bg-indigo-100 text-indigo-700" : "bg-zinc-200 text-zinc-600"}`}>{n}</span>}
            </button>
          ))}
        </div>
        {reviewCount > 0 && (
          <button
            onClick={() => {
              // FAQ 탭으로 바꾸고, 재검토가 필요한 첫 FAQ로 스크롤한다(이미 FAQ 탭이어도 반응하도록)
              setTab("faq");
              setTimeout(() => document.querySelector("[data-faq-review]")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
            }}
            className="rounded-full bg-amber-100 px-3 py-1 text-[13px] font-semibold text-amber-800 hover:bg-amber-200"
          >
            재검토 필요 FAQ {reviewCount}건
          </button>
        )}
        <button
          onClick={() => {
            resetHq();
            setOpenId(null);
          }}
          className="ml-auto text-[13px] text-zinc-400 hover:text-zinc-700"
          title="이 브라우저에 저장된 질의·FAQ를 모두 지웁니다"
        >
          데모 데이터 지우기
        </button>
      </div>

      {tab === "inbox" && (
        <>
          {hq.inquiries.length === 0 && <EmptyInbox />}
          <ul className="space-y-3">
            {[...pending, ...deciding, ...waiting, ...answered].map((q) => {
              const open = openId === q.id;
              return (
                <li key={q.id} className={`overflow-hidden rounded-2xl border bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${open ? "border-zinc-300" : "border-zinc-200"}`}>
                  <button onClick={() => setOpenId(open ? null : q.id)} className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left hover:bg-zinc-50/60">
                    <Badge code={q.verdict} size="sm" />
                    {q.kind === "recheck" && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[12px] font-semibold text-violet-700 ring-1 ring-violet-200">재확인 요청</span>}
                    <span className="min-w-0 flex-1 text-[15px] font-medium text-zinc-900">{q.question}</span>
                    {q.urgent && q.status !== "answered" && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[12px] font-semibold text-white">긴급</span>}
                    <MiniProgress q={q} />
                    <Icon name="chevron" className={`h-4 w-4 text-zinc-400 transition ${open ? "rotate-90" : ""}`} />
                  </button>
                  {open && (
                    <div className="grid gap-5 border-t border-zinc-100 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_260px]">
                      <div className="min-w-0">
                        <p className="mb-3 text-[13px] text-zinc-500">
                          <span className="font-mono">{q.id}</span> · 판정 당시 {KB_LABEL[q.kb]}
                        </p>
                        <InquiryDoc d={q} note={q.branchNote} />
                        {q.status === "pending" && <ResearchPanel q={q} kb={kb} />}
                        {q.status === "pending" && <ExternalPanel q={q} all={hq.inquiries} />}
                        {q.status === "external" && <ExternalWaiting q={q} />}
                        {q.status !== "answered" && <AnswerForm inquiryId={q.id} verdict={q.verdict} external={q.external?.agencies} onDone={() => setTab("faq")} />}
                        {q.committee && <CommitteePanel q={q} />}
                      </div>
                      <Timeline q={q} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {tab === "faq" && (
        <>
          <p className="text-[14px] leading-relaxed text-zinc-500">
            회신을 승인하면 여기에 쌓이고, 전 지점의 같은 쟁점 판정 카드에 함께 나옵니다.{judge && <>{" "} 지점은 &lsquo;내 질의 → 본점 해석 FAQ&rsquo;에서 찾아볼 수도 있습니다. &lsquo;예시&rsquo;는 시연용으로 미리 등록한 해석이며 &lsquo;데모 데이터 지우기&rsquo;로 지워지지 않습니다.</>}
          </p>
          {hq.faqs.length === 0 && (
            <p className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-[15px] text-zinc-500">
              승인된 FAQ가 없습니다. 지점 질의에 회신하고 승인하면 여기에 등록되어 다른 지점의 판정 카드에도 보입니다.
            </p>
          )}
          <ul className="space-y-3">
            {reviews.map(({ f, rv }) => (
              <li key={f.id} data-faq-review={rv.status === "review" ? "" : undefined} className={`scroll-mt-24 rounded-2xl border bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${rv.status === "review" ? "border-amber-300" : "border-zinc-200"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${rv.status === "review" ? "bg-amber-500 text-white" : "bg-teal-50 text-teal-700 ring-1 ring-teal-200"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${rv.status === "review" ? "bg-white" : "bg-teal-500"}`} />
                    {rv.status === "review" ? "재검토 필요" : "유효"}
                  </span>
                  <span className="font-mono text-[12px] text-zinc-400">{f.id}</span>
                  <span className="text-[13px] text-zinc-500">
                    승인 {fmt(f.approvedAt)} · {f.approver} · 근거 자료 {f.kb} 기준 · 근거 {f.facts.join(", ")}
                  </span>
                  {f.example && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[12px] font-medium text-zinc-500">예시</span>}
                  {f.viaExternal && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[12px] font-medium text-sky-700 ring-1 ring-sky-200">외부기관 회신 반영 · {f.viaExternal.join(", ")}</span>}
                </div>
                <p className="mt-3 text-[14px] text-zinc-500">Q. {f.question}</p>
                <p className="mt-1.5 text-[17px] font-semibold leading-snug text-zinc-900">{f.hqConclusion}</p>
                <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed text-zinc-700">{f.answer}</p>
                {rv.reason && <p className={`mt-3 text-[13px] ${rv.status === "review" ? "font-medium text-amber-800" : "text-zinc-500"}`}>{rv.reason}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** 질의 진행 단계: 지점 접수 → 본점 검토(회신 기한) → [외부기관 문의] → 승인·FAQ 등록. 외부 문의 단계는 필요한 질의에만 보인다. */
type Stage = { label: string; sub: string; state: "done" | "now" | "todo" };
function stages(q: Inquiry): Stage[] {
  const answered = q.status === "answered";
  const ext = q.status === "external";
  const plan = planExternal(q);
  const list: Stage[] = [
    { label: "지점 접수", sub: new Date(q.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }), state: "done" },
    {
      label: "본점 검토",
      sub: answered || ext ? (ext ? "정부 발표 자료로 답할 수 없어 외부기관에 문의" : "회신 완료") : `회신 기한 ${fmt(q.dueDate)}${q.urgent ? " · 긴급" : ""} (3영업일)`,
      state: answered || ext ? "done" : "now",
    },
  ];
  // 외부기관에 묻기 전에 Liner로 공개 자료를 먼저 조사한다(원문 공백이 있는 질의)
  const gaps = openGapsOf(q);
  if (gaps.length) {
    const runs = gaps.map((g) => lastResearch(g.id)).filter((r) => !!r);
    list.push({
      label: "Liner 사전 조사",
      sub: runs.length ? `${runs.map((r) => researchLine(r!).replace("Liner 사전 조사", "")).join(" / ")}` : "외부기관 문의 전에 공개 자료를 먼저 확인",
      state: runs.length === gaps.length ? "done" : answered || ext ? "done" : "todo",
    });
  }
  if (q.external || (plan.needed && !answered)) {
    list.push({
      label: "외부기관 문의",
      sub: q.external
        ? `${q.external.agencies.join(", ")} · ${fmt(q.external.postedAt)} 등록${ext ? " · 회신 대기(기한 없음)" : " · 회신 받음"}`
        : `필요하면 ${plan.targets.map((t) => t.agency).join(", ")}에 문의`,
      state: ext ? "now" : q.external ? "done" : "todo",
    });
  }
  list.push({ label: "승인 · 사례 FAQ 등록", sub: answered ? `${q.faqId} · 같은 쟁점 판정 카드에 표시` : "승인하면 다른 지점 판정에도 보임", state: answered ? "done" : "todo" });
  const c = q.committee;
  if (c) {
    list.push(
      { label: "지점 서류 접수", sub: c.receivedAt ? `${fmt(c.receivedAt)} 접수 · ${c.docs.length}종` : `${c.docs.length}종 · 지점이 고객에게 받는 중`, state: c.stage === "docs" ? "now" : "done" },
      {
        label: "여신심사위 안건 등록",
        sub: c.meeting ? `개최 ${fmt(c.meeting)}(수) · 상정 마감 ${fmt(c.deadline ?? c.meeting)}` : "서류가 오면 본점이 자동 등록",
        state: c.stage === "submitted" ? "now" : c.stage === "decided" ? "done" : "todo",
      },
      { label: "심사 결과 · 지점 통보", sub: c.result ? `${c.result} · ${fmt(c.decidedAt ?? "")}` : "본점이 결과를 입력하면 지점에 알림", state: c.stage === "decided" ? "done" : "todo" },
    );
  }
  return list;
}

function MiniProgress({ q }: { q: Inquiry }) {
  const st = stages(q);
  const now = st.find((x) => x.state === "now");
  return (
    <span className="flex items-center gap-2">
      <span className="flex gap-1">
        {st.map((x) => (
          <span key={x.label} className={`h-1.5 w-5 rounded-full ${x.state === "done" ? "bg-indigo-500" : x.state === "now" ? "bg-indigo-200" : "bg-zinc-200"}`} />
        ))}
      </span>
      <span className={`text-[13px] ${q.status === "pending" ? "text-indigo-700" : q.status === "external" ? "text-sky-700" : "text-zinc-500"}`}>{progressLabel(q, !!now)}</span>
    </span>
  );
}

function progressLabel(q: Inquiry, inReview: boolean): string {
  const c = q.committee;
  if (c?.stage === "docs") return "심사위 상정 · 지점 서류 대기";
  if (c?.stage === "submitted") return `심사위 ${fmt(c.meeting ?? "")} · 결과 입력 대기`;
  if (c?.stage === "decided") return `심사위 ${c.result}`;
  if (q.status === "external") return "외부기관 회신 대기";
  return inReview ? `검토 중 · 기한 ${fmt(q.dueDate)}` : "회신 완료";
}

function Timeline({ q }: { q: Inquiry }) {
  const judge = useJudge();
  return (
    <aside className="h-fit rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
      <p className="text-[14px] font-semibold text-zinc-900">진행 상황</p>
      <ol className="relative mt-3 space-y-4 pl-6 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-0.5 before:bg-zinc-200">
        {stages(q).map((x) => (
          <li key={x.label} className="relative">
            <span
              className={`absolute top-1 -left-6 grid h-4 w-4 place-items-center rounded-full ring-4 ring-zinc-50 ${
                x.state === "done" ? "bg-indigo-600 text-white" : x.state === "now" ? "bg-white ring-indigo-200" : "bg-zinc-200"
              } ${x.state === "now" ? "border-2 border-indigo-600" : ""}`}
            >
              {x.state === "done" && <Icon name="check" className="h-2.5 w-2.5" />}
            </span>
            <p className={`text-[14px] font-medium ${x.state === "todo" ? "text-zinc-400" : "text-zinc-900"}`}>{x.label}</p>
            <p className="text-[13px] text-zinc-500">{x.sub}</p>
          </li>
        ))}
      </ol>
      {judge && <p className="mt-4 border-t border-zinc-200 pt-3 text-[12px] leading-relaxed text-zinc-400">가상 A은행 지침 제6조: 본점 여신기획부는 3영업일 안에 회신합니다. 고객 만기가 5영업일 안이면 &lsquo;긴급&rsquo;으로 표시합니다. 외부기관 문의가 필요하면 지점에 중간 안내를 먼저 보냅니다(5항). 제3조: 심사위 상정은 본점이 결정·등록하고, 지점은 서류만 받습니다. 위원회는 둘째·넷째 주 수요일, 마감은 3영업일 전입니다.</p>}
    </aside>
  );
}

function EmptyInbox() {
  const judge = useJudge();
  const steps = [
    ["창구에서 판정 받기", "지점이 확정할 수 없는 판정(본점 문의·심사위 상정·은행 지침 확인)이 나오면 판정 카드 아래에 질의 안내가 뜹니다. 확정 판정도 직원이 고객 상황과 맞지 않다고 보면 '재확인 요청'으로 올 수 있습니다."],
    ["질의서 보내기", "[본점 질의서 작성]을 누르면 고객 상황·근거 조항·쟁점이 자동으로 채워집니다. 지점 의견만 덧붙여 보냅니다."],
    ["본점 회신·승인", "여기서 본점 담당자가 결론과 안내 문구를 적고 승인합니다. 심사위 상정이 필요하면 회신하며 함께 결정합니다. 지점은 서류만 받고, 안건 등록·개최일·결과 통보는 본점이 맡습니다."],
    ["사례 FAQ로 재사용", "같은 쟁점의 질문이 들어오면 판정 카드에 '승인된 본점 해석'이 함께 나옵니다. 정부 후속 지침으로 결론이 바뀌면 재검토 표시가 붙습니다."],
  ];
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <p className="text-[20px] font-bold tracking-tight text-zinc-900">아직 지점 질의가 없습니다</p>
      <p className="mt-1 text-[15px] text-zinc-500">지점이 판단할 수 없는 건은 이렇게 본점으로 넘어옵니다.</p>
      <ol className="mt-5 divide-y divide-zinc-100">
        {steps.map(([t, d], i) => (
          <li key={t} className="flex gap-3 py-3">
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${i === 0 ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-500"}`}>{i + 1}</span>
            <div>
              <p className="text-[15px] font-semibold text-zinc-900">{t}</p>
              {judge && <p className="mt-0.5 text-[14px] leading-relaxed text-zinc-500">{d}</p>}
            </div>
          </li>
        ))}
      </ol>
      <Link
        href="/?q=%EC%A7%91%20%EC%82%AC%EA%B3%A0%20%EB%93%A4%EC%96%B4%EA%B0%80%EB%A0%A4%20%ED%96%88%EB%8A%94%EB%8D%B0%20%EA%B3%84%EC%95%BD%20%EC%A7%81%ED%9B%84%20%EC%A7%80%EB%B0%A9%20%EB%B0%9C%EB%A0%B9%20%EB%82%98%EC%84%9C%20%ED%95%9C%20%EB%B2%88%EB%8F%84%20%EB%AA%BB%20%EC%82%B4%EC%95%98%EB%8C%80%EC%9A%94.%20%EC%9D%B4%EA%B1%B4%20%EB%B4%90%EC%A3%BC%EC%A3%A0%3F"
        className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-indigo-700"
      >
        예시로 시작: 발령으로 못 산 집(심사위 상정) →
      </Link>
    </section>
  );
}

function AnswerForm({ inquiryId, verdict, external, onDone }: { inquiryId: string; verdict: Inquiry["verdict"]; external?: string[]; onDone: () => void }) {
  const [committee, setCommittee] = useState(verdict === "심사위");
  const [conclusion, setConclusion] = useState("");
  const [answer, setAnswer] = useState("");
  const [approver, setApprover] = useState("본점 여신기획부");
  const [busy, setBusy] = useState(false);
  const pii = findPii(conclusion, answer);
  const avoid = findAvoidance(`${conclusion} ${answer}`);
  const ok = conclusion.trim() && answer.trim() && pii.length === 0 && !busy;
  return (
    <form
      className="mt-5 space-y-2.5 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        setBusy(true);
        approveFaq(inquiryId, { answer, hqConclusion: conclusion, approver, approvedAt: today(), committee });
        if (!committee) onDone(); // 상정하면 이어서 진행 상황을 볼 수 있게 질의 탭에 남는다
      }}
    >
      <h4 className="text-[14px] font-semibold text-zinc-800">{external ? `본점 회신 (${external.join(", ")} 회신 반영)` : "본점 회신"}</h4>
      <input
        value={conclusion}
        onChange={(e) => setConclusion(e.target.value)}
        maxLength={120}
        placeholder="결론 한 줄 (예: 정부 후속 지침 전까지 종전 규정 적용을 확답하지 않고 보류 안내)"
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-[15px] focus:border-indigo-500 focus:outline-none"
      />
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={4}
        maxLength={1500}
        placeholder="회신 내용: 판단 근거, 창구 안내 문구, 받아야 할 서류"
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-[15px] focus:border-indigo-500 focus:outline-none"
      />
      {pii.length > 0 && <p className="text-[13px] text-rose-700">회신에 개인정보로 보이는 내용({pii.join(", ")})이 있어 승인할 수 없습니다.</p>}
      {avoid.length > 0 && (
        <p className="text-[13px] text-amber-800">
          규제 회피 방법으로 읽힐 수 있는 표현({avoid.join(", ")})이 있습니다. FAQ는 다른 지점에도 보이므로 A은행 지침 제7조 1항에 맞는지 확인하세요.
        </p>
      )}
      <label className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-[14px] text-zinc-700 ring-1 ring-zinc-200">
        <input type="checkbox" checked={committee} onChange={(e) => setCommittee(e.target.checked)} className="mt-1" />
        <span>
          <b className="font-semibold text-zinc-900">여신심사위원회에 상정</b> — 지점은 서류만 받아 접수 완료로 알리고, 안건 등록과 개최일은 본점이 맡습니다(지침 제3조).
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={approver}
          onChange={(e) => setApprover(e.target.value)}
          maxLength={40}
          className="w-48 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-[15px] focus:border-indigo-500 focus:outline-none"
          aria-label="승인 부서"
        />
        <button type="submit" disabled={!ok} className="ml-auto rounded-xl bg-indigo-600 px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40">
          {committee ? "회신 승인 · 심사위 상정" : "회신 승인 · FAQ 등록"}
        </button>
      </div>
      <p className="text-[13px] text-slate-500">승인하면 같은 쟁점의 질문을 판정할 때 판정 카드에 이 회신이 &lsquo;승인된 본점 해석&rsquo;으로 표시됩니다.</p>
    </form>
  );
}

/** 본점 검토 중: 외부기관에 물어야 하는지 코드로 가르고, 고객 정보 없는 질의문을 만든다(지침 제6조 5항). */
/** 질의서에서 아직 열린 원문 공백(v2에서 해소된 것 제외) */
function openGapsOf(q: Inquiry) {
  return resolveGaps(q.gaps).filter((g) => !(g.resolved && q.kb === "v2"));
}

/**
 * Liner 사전 조사: 해석 쟁점(원문 공백)을 외부기관에 묻기 전에 Liner로 공개 자료를 먼저 찾는다.
 * - 조사 이력: 원문 대조까지 마친 지난 조사(data/kb/gap_research.json)
 * - 지금 다시 조사: Liner Search API로 공식 출처를 모아 '새 공식 문서 후보'와 '근거 자료에 있는 문서'로 나눈다.
 *   답변 문장(Search Agent)은 쓰지 않는다. 결론은 사람이 원문 대조로 내린다.
 */
function ResearchPanel({ q, kb }: { q: Inquiry; kb: "v1" | "v2" }) {
  const gaps = openGapsOf(q);
  const [state, setState] = useState<{ busy: boolean; results?: ResearchResult[]; at?: string; by?: string; error?: string }>({ busy: false });
  const idsKey = gaps.map((g) => g.id).join(",");
  // 정책 감시에서 먼저 조사했으면 그 결과부터 보여 준다(같은 브라우저 저장)
  useEffect(() => {
    if (!idsKey) return;
    const prev = idsKey.split(",").map(savedResearch).filter((x): x is SavedResearch => !!x);
    if (prev.length) setState({ busy: false, results: prev.map((p) => p.result), at: prev[0].at, by: prev[0].by });
  }, [idsKey]);
  if (!gaps.length) return null;
  const run = async () => {
    setState({ busy: true });
    try {
      const results = await runResearch(gaps.map((g) => g.id), kb, "본점");
      setState({ busy: false, results, at: new Date().toISOString(), by: "본점" });
    } catch (e) {
      setState({ busy: false, error: (e as Error).message });
    }
  };
  const newDocs = state.results?.flatMap((r) => r.docs.filter((d) => d.kind === "new")) ?? [];
  return (
    <div className="mt-5 rounded-xl border border-teal-200 bg-teal-50/50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[12px] font-semibold text-teal-700 ring-1 ring-teal-200">
          <Icon name="spark" className="h-3 w-3" />
          Liner 사전 조사
        </span>
        <p className="text-[14px] font-semibold text-zinc-900">외부기관에 묻기 전에 공개된 공식 자료부터 확인합니다</p>
      </div>
      <ul className="mt-3 space-y-2">
        {gaps.map((g) => {
          const r = lastResearch(g.id);
          return (
            <li key={g.id} className="rounded-lg bg-white px-3 py-2 text-[13px] ring-1 ring-teal-100">
              <span className="font-mono font-semibold text-zinc-500">{g.id}</span> <span className="text-zinc-900">{g.topic}</span>
              <p className={r ? "mt-0.5 text-teal-800" : "mt-0.5 text-zinc-400"}>{r ? `${researchLine(r)} (원문 대조 완료)` : "원문 대조까지 마친 조사 기록 없음"}</p>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={run} disabled={state.busy} className="rounded-xl bg-teal-700 px-4 py-2 text-[14px] font-semibold text-white shadow-sm hover:bg-teal-800 disabled:opacity-50">
          {state.busy ? "Liner로 조사 중…" : state.results ? "다시 조사" : "지금 Liner로 다시 조사"}
        </button>
        <span className="text-[13px] text-zinc-500">새 정부 발표가 있었는지 Liner Search API로 확인합니다(10분 안에 다시 누르면 저장된 결과).</span>
      </div>
      {state.error && <p className="mt-2 text-[13px] text-rose-700">{state.error}</p>}
      {state.results && (
        <div className="mt-3 border-t border-teal-100 pt-3">
          {state.at && (
            <p className="mb-1 text-[12px] text-zinc-500">
              최근 조사 결과 · {fmtAt(state.at)}
            </p>
          )}
          <ResearchDocs results={state.results} />
          <p className="mt-2 text-[13px] text-zinc-600">
            {newDocs.length
              ? "정책 감시에서 원문 대조 후 근거 자료에 반영하면 외부기관에 묻지 않아도 됩니다."
              : "아래 외부기관 문의로 진행하세요."}
          </p>
        </div>
      )}
    </div>
  );
}

function ExternalPanel({ q, all }: { q: Inquiry; all: Inquiry[] }) {
  const plan = planExternal(q);
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const dup = findOpenExternal(all, q.key, q.id);
  if (dup) {
    return (
      <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-[14px] text-sky-900">
        같은 쟁점으로 <b className="font-mono">{dup.id}</b>가 이미 외부기관({dup.external?.agencies.join(", ")}) 회신을 기다리고 있습니다. 새로 문의하지 말고 그 회신으로 함께 답하세요.
      </div>
    );
  }
  if (!plan.needed) {
    return (
      <div className="mt-5 rounded-xl border border-zinc-200 bg-white px-4 py-3">
        <p className="text-[14px] font-semibold text-zinc-800">외부기관 문의 필요 없음</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-500">{plan.noneReason}</p>
        {plan.internal.map((x) => (
          <p key={x.gapId} className="mt-1 text-[13px] text-zinc-500">
            <span className="font-mono">{x.gapId}</span> {x.topic} — {x.reason}
          </p>
        ))}
      </div>
    );
  }
  return (
    <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50/50 p-4">
      <p className="text-[14px] font-semibold text-zinc-900">외부기관 문의가 필요할 수 있는 쟁점입니다</p>
      <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-600">정부 발표 자료에 기준이 없어 본점도 확정하기 어렵습니다. 문의하면 회신까지 며칠이 걸릴 수 있어, 지점에는 중간 안내가 먼저 갑니다.</p>
      <ul className="mt-3 space-y-2">
        {plan.targets.map((t) => (
          <li key={t.agency} className="rounded-lg bg-white px-3 py-2 text-[13px] ring-1 ring-sky-100">
            <span className="font-semibold text-zinc-900">{t.agency}</span> <span className="text-zinc-400">· {t.gapIds.join(", ")}</span>
            <p className="text-zinc-600">{t.basis}</p>
            <p className="text-zinc-400">문의 경로: {t.channel}</p>
          </li>
        ))}
      </ul>
      {plan.internal.length > 0 && (
        <p className="mt-2 text-[13px] text-zinc-500">
          외부 문의 제외: {plan.internal.map((x) => `${x.gapId} ${x.topic}`).join(", ")} (금융회사 자체 판단 사항)
        </p>
      )}
      <button onClick={() => setShow(!show)} className="mt-3 text-[13px] font-medium text-sky-700 hover:underline">
        {show ? "질의문 접기" : "외부기관 질의문 보기 (고객 정보 없음)"}
      </button>
      {show && (
        <div className="mt-2">
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 font-sans text-[13px] leading-relaxed text-zinc-800 ring-1 ring-zinc-200">{plan.text}</pre>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(plan.text).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
            className="mt-2 rounded-lg px-3 py-1.5 text-[13px] text-zinc-600 ring-1 ring-zinc-300 hover:bg-white"
          >
            {copied ? "복사했습니다" : "질의문 복사"}
          </button>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-sky-100 pt-3">
        <button
          onClick={(e) => {
            e.currentTarget.disabled = true;
            postExternal(q.id, plan.targets.map((t) => t.agency), today());
          }}
          className="rounded-xl bg-sky-600 px-4 py-2 text-[14px] font-semibold text-white shadow-sm hover:bg-sky-700"
        >
          외부기관 문의 등록 · 지점에 중간 안내
        </button>
        <span className="text-[13px] text-zinc-500">정부 발표 자료로 답할 수 있으면 아래에서 바로 회신하세요.</span>
      </div>
    </div>
  );
}

function ExternalWaiting({ q }: { q: Inquiry }) {
  if (!q.external) return null;
  return (
    <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
      <p className="text-[14px] font-semibold text-sky-900">
        외부기관 회신 대기 · {q.external.agencies.join(", ")} · {fmt(q.external.postedAt)} 등록
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-sky-900">지점 중간 안내: {q.external.interimNotice}</p>
      <p className="mt-1 text-[13px] text-sky-700">같은 쟁점의 새 질의는 이 건에 묶입니다. 회신이 오면 아래에 반영해 승인하세요.</p>
    </div>
  );
}

/** 심사위 상정 진행: 지점 서류 대기 → 안건 등록(결과 입력) → 결과 통보 */
function CommitteePanel({ q }: { q: Inquiry }) {
  const c = q.committee;
  const [result, setResult] = useState<CommitteeResult>("승인");
  const [note, setNote] = useState("");
  if (!c) return null;
  const pii = findPii(note);
  return (
    <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
      <p className="text-[14px] font-semibold text-violet-900">여신심사위원회 상정</p>
      <p className="mt-1 text-[13px] text-zinc-600">상정 서류: {c.docs.join(", ")}</p>
      {c.stage === "docs" && <p className="mt-2 text-[13px] text-zinc-600">지점이 고객에게 서류를 받는 중입니다. 접수 완료가 오면 개최일이 자동으로 정해지고 안건으로 등록됩니다.</p>}
      {c.stage === "submitted" && (
        <div className="mt-2 space-y-2">
          <p className="text-[13px] text-zinc-700">
            {fmt(c.receivedAt ?? "")} 서류 접수 · <b>개최 {fmt(c.meeting ?? "")}(수)</b> · 상정 마감 {fmt(c.deadline ?? "")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {(["승인", "부결"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setResult(r)}
                className={`rounded-lg px-3 py-1.5 text-[14px] font-medium ring-1 ${result === r ? (r === "승인" ? "bg-green-600 text-white ring-green-600" : "bg-rose-600 text-white ring-rose-600") : "bg-white text-zinc-600 ring-zinc-300"}`}
              >
                {r}
              </button>
            ))}
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="심사 의견 (예: 발령일이 매매계약일 뒤임을 확인, 불가피성 인정)"
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[14px] focus:border-violet-500 focus:outline-none"
            />
            <button
              disabled={!note.trim() || pii.length > 0}
              onClick={(e) => {
                e.currentTarget.disabled = true;
                decideCommittee(q.id, result, note, today());
              }}
              className="rounded-xl bg-violet-600 px-4 py-2 text-[14px] font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-40"
            >
              심사 결과 지점에 통보
            </button>
          </div>
          {pii.length > 0 && <p className="text-[13px] text-rose-700">개인정보로 보이는 내용({pii.join(", ")})이 있어 보낼 수 없습니다.</p>}
          <p className="text-[12px] text-zinc-400">시연용으로 개최일 전에도 결과를 입력할 수 있습니다.</p>
        </div>
      )}
      {c.stage === "decided" && (
        <p className="mt-2 text-[14px] text-zinc-800">
          <b className={c.result === "승인" ? "text-green-700" : "text-rose-700"}>{c.result}</b> · {fmt(c.decidedAt ?? "")} 지점 통보 · {c.resultNote}
        </p>
      )}
    </div>
  );
}
