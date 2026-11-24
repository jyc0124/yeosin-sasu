"use client";
// 지점 화면: 내가 본점에 보낸 질의의 진행 상태와 본점 회신, 승인된 본점 해석(사례 FAQ) 모아 보기. 읽기 전용(회신·승인은 본점 '질의 처리').
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { reviewFaq, type FaqEntry, type Inquiry } from "@/lib/hq/faq";
import type { KbVersion } from "@/lib/rules/types";
import { markBranchSeen, receiveCommitteeDocs, useBranchUpdates, useHq } from "../_components/hqStore";
import { committeeNotice } from "@/lib/hq/committee";
import { today } from "@/lib/rules/dates";
import { useKb } from "../_components/kbStore";
import { Badge } from "../_components/VerdictCard";
import { useJudge } from "../_components/viewStore";

const fmt = (d: string) => `${d.slice(0, 4)}.${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;

const STATUS: Record<Inquiry["status"], { label: string; tone: string }> = {
  pending: { label: "본점 검토 중", tone: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  external: { label: "외부기관 회신 대기", tone: "bg-sky-50 text-sky-700 ring-sky-200" },
  answered: { label: "회신 완료", tone: "bg-green-50 text-green-700 ring-green-200" },
};

function statusOf(q: Inquiry): { label: string; tone: string } {
  const c = q.committee;
  if (c?.stage === "docs") return { label: "심사위 상정 · 서류 필요", tone: "bg-amber-50 text-amber-800 ring-amber-200" };
  if (c?.stage === "submitted") return { label: "심사위 심사 대기", tone: "bg-violet-50 text-violet-700 ring-violet-200" };
  if (c?.stage === "decided") return c.result === "승인" ? { label: "심사위 승인", tone: "bg-green-50 text-green-700 ring-green-200" } : { label: "심사위 부결", tone: "bg-rose-50 text-rose-700 ring-rose-200" };
  return STATUS[q.status];
}

/** 본점이 상정을 결정한 질의: 지점은 서류만 받아 접수 완료로 알린다(지침 제3조 2항) */
function CommitteeBox({ q }: { q: Inquiry }) {
  const c = q.committee!;
  const [got, setGot] = useState<Set<string>>(new Set());
  const all = c.docs.every((d) => got.has(d));
  const tone = c.stage === "docs" ? "bg-amber-50/70 ring-amber-200" : c.stage === "decided" && c.result === "부결" ? "bg-rose-50/60 ring-rose-200" : "bg-violet-50/60 ring-violet-200";
  return (
    <div className={`mt-3 rounded-xl p-4 ring-1 ${tone}`}>
      <p className="text-[13px] font-semibold text-zinc-700">
        여신심사위원회 · 본점이 {fmt(c.requestedAt)} 상정 결정
        {c.meeting && ` · 개최 ${fmt(c.meeting)}(수)`}
      </p>
      {c.stage === "docs" && (
        <>
          <p className="mt-1 text-[16px] font-semibold text-zinc-900">고객에게 서류를 받아 주세요. 안건 등록은 본점이 합니다.</p>
          <ul className="mt-2 space-y-1">
            {c.docs.map((d) => (
              <li key={d}>
                <label className="flex items-center gap-2 text-[14px] text-zinc-800">
                  <input type="checkbox" checked={got.has(d)} onChange={(e) => setGot((p) => { const n = new Set(p); if (e.target.checked) n.add(d); else n.delete(d); return n; })} />
                  {d}
                </label>
              </li>
            ))}
          </ul>
          <button
            disabled={!all}
            onClick={(e) => {
              e.currentTarget.disabled = true;
              receiveCommitteeDocs(q.id, today());
            }}
            className="mt-3 rounded-xl bg-violet-600 px-4 py-2 text-[14px] font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-40"
          >
            서류 접수 완료 · 본점에 알리기
          </button>
        </>
      )}
      {c.stage === "submitted" && (
        <p className="mt-1 text-[16px] font-semibold text-zinc-900">
          안건으로 등록됐습니다 · {fmt(c.meeting ?? "")}(수) 심사 <span className="text-[13px] font-normal text-zinc-500">상정 마감 {fmt(c.deadline ?? "")}</span>
        </p>
      )}
      {c.stage === "decided" && (
        <p className="mt-1 text-[16px] font-semibold text-zinc-900">
          심사 결과: <span className={c.result === "승인" ? "text-green-700" : "text-rose-700"}>{c.result}</span>
          {c.resultNote && <span className="mt-0.5 block text-[14px] font-normal text-zinc-700">{c.resultNote}</span>}
        </p>
      )}
      <p className="mt-2 text-[13px] leading-relaxed text-zinc-600">{committeeNotice(c)}</p>
    </div>
  );
}

export function BranchInquiries() {
  const judge = useJudge();
  const hq = useHq();
  const [kb] = useKb();
  const [tab, setTab] = useState<"sent" | "faq">("sent");
  const faqById = new Map(hq.faqs.map((f) => [f.id, f]));
  const order = { answered: 0, external: 1, pending: 2 } as const; // 회신 온 것부터
  const sent = [...hq.inquiries].sort((a, b) => order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt));
  // 화면을 연 시점의 '새 소식'은 표시를 남겨 두고, 저장은 바로 '확인함'으로(사이드바 알림이 꺼짐)
  const updates = useBranchUpdates();
  const fresh = useRef<Set<string> | null>(null);
  if (fresh.current === null && hq.inquiries.length) fresh.current = new Set(updates.map((q) => q.id));
  useEffect(() => {
    if (hq.inquiries.length) markBranchSeen(hq.inquiries);
  }, [hq.inquiries]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl bg-zinc-100 p-1">
          {(
            [
              ["sent", "보낸 질의", hq.inquiries.length],
              ["faq", "본점 해석 FAQ", hq.faqs.length],
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
        <Link
          href="/"
          title="질의서는 판정 카드에서 고객 상황·근거 조항이 자동으로 채워집니다"
          className="ml-auto inline-flex items-center rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-[14px] font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
        >
          + 새 질의는 창구 판정에서 시작 →
        </Link>
      </div>
      {judge && <p className="-mt-2 text-[13px] text-zinc-500">본점 질의는 빈 양식이 아니라 판정 카드에서 보냅니다. 고객 상황·근거 조항·쟁점이 자동으로 채워져 본점이 다시 묻지 않아도 됩니다.</p>}

      {tab === "sent" && sent.length === 0 && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-[18px] font-semibold text-zinc-900">아직 보낸 질의가 없습니다</p>
          {!judge && (
            <p className="mt-2 text-[15px] leading-relaxed text-zinc-600">
              판정 카드 아래 <b>[본점 질의서 작성]</b>이나 <b>[본점에 재확인 요청]</b>을 누르면 여기에 쌓이고, 본점 회신도 여기서 봅니다.
            </p>
          )}
          {judge && <p className="mt-2 text-[15px] leading-relaxed text-zinc-600">
            창구 판정이 <b>본점 문의·심사위 상정·은행 지침 확인</b>처럼 지점이 확정할 수 없는 결과면, 판정 카드 아래 <b>[본점 질의서 작성]</b>을 누르세요. 가능·불가·조건 충족 시 가능처럼 확정된 판정이라도
            고객 상황과 맞지 않아 보이면 카드 아래 <b>[본점에 재확인 요청]</b>을 누르면 됩니다. 고객 상황·근거 조항·쟁점이 자동으로 채워진 질의서가 본점으로 가고, 회신이 오면 여기서 확인합니다.
          </p>}
          <Link
            href="/?q=%EC%A7%91%20%EC%82%AC%EA%B3%A0%20%EB%93%A4%EC%96%B4%EA%B0%80%EB%A0%A4%20%ED%96%88%EB%8A%94%EB%8D%B0%20%EA%B3%84%EC%95%BD%20%EC%A7%81%ED%9B%84%20%EC%A7%80%EB%B0%A9%20%EB%B0%9C%EB%A0%B9%20%EB%82%98%EC%84%9C%20%ED%95%9C%20%EB%B2%88%EB%8F%84%20%EB%AA%BB%20%EC%82%B4%EC%95%98%EB%8C%80%EC%9A%94.%20%EC%9D%B4%EA%B1%B4%20%EB%B4%90%EC%A3%BC%EC%A3%A0%3F"
            className="mt-4 inline-flex rounded-xl bg-indigo-600 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-indigo-700"
          >
            예시로 해 보기: 발령으로 못 산 집(심사위 상정) →
          </Link>
        </section>
      )}

      {tab === "sent" && sent.length > 0 && (
        <ul className="space-y-3">
          {sent.map((q) => {
            const faq = q.faqId ? faqById.get(q.faqId) : undefined;
            const st = statusOf(q);
            return (
              <li key={q.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge code={q.verdict} size="sm" />
                  {q.kind === "recheck" && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[12px] font-semibold text-violet-700 ring-1 ring-violet-200">재확인 요청</span>}
                  <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ring-1 ${st.tone}`}>{st.label}</span>
                  {fresh.current?.has(q.id) && <span className="rounded-full bg-green-600 px-2 py-0.5 text-[12px] font-semibold text-white">새 소식</span>}
                  <span className="ml-auto text-[13px] text-zinc-400">
                    {q.id} · 보낸 날 {fmt(q.createdAt.slice(0, 10))}
                    {q.status !== "answered" && ` · 회신 기한 ${fmt(q.dueDate)}`}
                    {q.committee?.meeting && q.committee.stage === "submitted" && ` · 심사위 ${fmt(q.committee.meeting)}`}
                  </span>
                </div>
                <p className="mt-3 text-[15px] font-medium leading-relaxed text-zinc-900">&ldquo;{q.question}&rdquo;</p>
                {q.status === "external" && q.external && (
                  <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-[14px] leading-relaxed text-sky-900 ring-1 ring-sky-200">
                    본점이 {q.external.agencies.join(", ")}에 문의했습니다. 고객 안내: &ldquo;{q.external.interimNotice}&rdquo;
                  </p>
                )}
                {q.status === "pending" && <p className="mt-3 text-[14px] text-zinc-500">본점 여신기획부가 검토 중입니다. 고객에게는 &ldquo;본점 확인 후 안내드리겠습니다&rdquo;라고 안내하세요.</p>}
                {faq && (
                  <div className="mt-3 rounded-xl bg-green-50/70 p-4 ring-1 ring-green-200">
                    <p className="text-[13px] font-semibold text-green-700">본점 회신 · {fmt(faq.approvedAt)} 승인</p>
                    <p className="mt-1 text-[16px] font-semibold text-zinc-900">{faq.hqConclusion}</p>
                    <p className="mt-1.5 whitespace-pre-line text-[14px] leading-relaxed text-zinc-700">{faq.answer}</p>
                  </div>
                )}
                {q.committee && <CommitteeBox q={q} />}
              </li>
            );
          })}
        </ul>
      )}

      {tab === "faq" && <FaqLibrary faqs={hq.faqs} kb={kb} />}
    </div>
  );
}

/** 본점 해석 FAQ: 지점이 쓰는 법 안내 + 검색 + 같은 질문으로 바로 판정 */
function FaqLibrary({ faqs, kb }: { faqs: FaqEntry[]; kb: KbVersion }) {
  const judge = useJudge();
  const [q, setQ] = useState("");
  const words = q.trim().split(/\s+/).filter(Boolean);
  const list = faqs.filter((f) => words.every((w) => `${f.question} ${f.title} ${f.hqConclusion} ${f.answer}`.includes(w)));
  return (
    <>
      <section className="rounded-2xl border border-teal-200 bg-teal-50/60 p-5">
        <p className="text-[16px] font-semibold text-zinc-900">본점이 이미 답한 쟁점은 다시 묻지 않습니다</p>
        <ol className="mt-2 space-y-1.5 text-[14px] leading-relaxed text-zinc-700">
          <li>
            <b>1. 판정하면 자동으로 뜹니다.</b>{judge && <> 창구 판정에서 같은 쟁점이 나오면 판정 카드 아래에 &lsquo;본점이 이미 답한 쟁점입니다&rsquo;가 함께 나옵니다. 그 해석과 안내 문구대로 처리하세요.</>}
          </li>
          <li>
            <b>2. 여기서 찾아볼 수 있습니다.</b>{judge && <> 고객 응대 전에 키워드(예: 가계약, 발령, 전입)로 찾아 결론과 안내 문구를 확인하세요.</>}
          </li>
          <li>
            <b>3. &lsquo;재검토 중&rsquo;이면 쓰지 마세요.</b>{judge && <> 정부 후속 지침으로 판정이 바뀌었을 수 있습니다. 다시 판정하고 필요하면 본점에 질의하세요.</>}
          </li>
        </ol>
        <p className="mt-2 text-[12px] text-zinc-500">&lsquo;예시&rsquo; 표시는 시연용으로 미리 등록한 가상 A은행 해석입니다. 해석은 참고용이며 판정 코드는 바꾸지 않습니다.</p>
      </section>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="키워드로 찾기 (예: 가계약, 발령, 전입신고, 다른 은행)"
        className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-[15px] focus:border-indigo-500 focus:outline-none"
      />
      {list.length === 0 && <p className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 px-5 py-4 text-[14px] text-zinc-500">{faqs.length ? "찾는 해석이 없습니다. 창구 판정에서 판정 후 필요하면 본점에 질의하세요." : "아직 승인된 본점 해석이 없습니다."}</p>}
      <ul className="space-y-3">
        {list.map((f) => {
          const review = reviewFaq(f, kb).status === "review";
          return (
            <li key={f.id} className={`rounded-2xl border bg-white p-5 ${review ? "border-amber-300" : "border-zinc-200"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge code={f.verdictAtApproval} size="sm" />
                {review ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[12px] font-semibold text-amber-800">재검토 중 · 쓰지 마세요</span>
                ) : (
                  <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[12px] font-semibold text-teal-700 ring-1 ring-teal-200">사용 가능</span>
                )}
                {f.example && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[12px] font-medium text-zinc-500">예시</span>}
                <span className="ml-auto text-[13px] text-zinc-400">
                  {f.id} · {fmt(f.approvedAt)} 승인 · 근거 {f.facts.join(", ")}
                </span>
              </div>
              <p className="mt-2 text-[14px] text-zinc-500">Q. {f.question}</p>
              <p className="mt-1 text-[16px] font-semibold text-zinc-900">{f.hqConclusion}</p>
              <p className="mt-1.5 whitespace-pre-line text-[14px] leading-relaxed text-zinc-700">{f.answer}</p>
              <Link href={`/?q=${encodeURIComponent(f.question)}`} className="mt-3 inline-flex text-[14px] font-medium text-indigo-700 hover:underline">
                {review ? "이 질문으로 다시 판정하기 →" : "이 질문으로 판정해 보기 → 판정 카드에 이 해석이 함께 나옵니다"}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
