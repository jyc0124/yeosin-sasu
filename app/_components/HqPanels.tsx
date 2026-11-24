"use client";
// 창구 판정 카드 아래: 본점 질의서 작성(보류·심사위·내부지침), 확정 판정의 재확인 요청(허용·불허·조건부), 승인된 본점 해석(FAQ) 표시
import Link from "next/link";
import { useState } from "react";
import { reviewFaq, type FaqEntry } from "@/lib/hq/faq";
import type { InquiryDraft } from "@/lib/hq/inquiry";
import type { KbVersion } from "@/lib/rules/types";
import { submitInquiry, useHq } from "./hqStore";
import { findOpenExternal } from "@/lib/hq/external";
import { findPii } from "@/lib/hq/guard";
import { LabeledLines, Lines } from "./Lines";
import { verdictLabel } from "./labels";

const fmt = (d: string) => `${d.slice(0, 4)}.${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;

/** 질의 본문. noteSlot을 주면 '지점 의견' 칸에 입력란을 넣는다(지점 작성 화면). */
export function InquiryDoc({ d, note, noteSlot }: { d: InquiryDraft; note?: string; noteSlot?: React.ReactNode }) {
  return (
    <div className="space-y-3 text-sm">
      <Row label="고객 상황">
        <p className="text-slate-800">{d.question}</p>
        {d.followUps.length > 0 && <p className="mt-1 text-xs text-slate-500">추가 확인: {d.followUps.join(" / ")}</p>}
        {d.summary.length > 0 && (
          <ul className="mt-1.5 grid grid-cols-1 gap-x-4 text-xs text-slate-600 sm:grid-cols-2">
            {d.summary.map(([k, v], i) => (
              <li key={i}>
                <span className="text-slate-400">{k}</span> {v}
              </li>
            ))}
          </ul>
        )}
      </Row>
      <Row label="관련 정책·조항">
        <ul className="space-y-1">
          {d.policies.map((p) => (
            <li key={p.id} className="text-xs text-slate-700">
              <span className="font-mono font-semibold">{p.id}</span> <span className="text-slate-400">{p.source}</span> — {p.text}
            </li>
          ))}
        </ul>
      </Row>
      <Row label="지점 의견">
        <p className="text-slate-800">{d.branchOpinion}</p>
        {note && <p className="mt-1 text-slate-800">{note}</p>}
        {noteSlot}
      </Row>
      {d.confirmed && d.confirmed.length > 0 && (
        <Row label="확인된 기준">
          <ul className="list-disc space-y-0.5 pl-4 text-slate-800">
            {d.confirmed.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Row>
      )}
      <Row label="확인할 쟁점">
        <ul className="list-disc space-y-0.5 pl-4 text-slate-800">
          {d.issues.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </Row>
      <Row label="요청 판단">
        <ul className="list-disc space-y-0.5 pl-4 text-slate-800">
          {d.asks.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </Row>
      <Row label="고객 일정">
        <p className="text-slate-800">
          {d.schedule.length ? d.schedule.join(" · ") : "질문에 일정 정보 없음"} · 회신 기한 {fmt(d.dueDate)}(3영업일)
          {d.urgent && <span className="ml-1 rounded bg-rose-600 px-1.5 py-0.5 text-[12px] font-semibold text-white">긴급</span>}
        </p>
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[6.5rem_1fr]">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function InquiryPanel({ draft, faq }: { draft: InquiryDraft; faq?: FaqEntry }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState(false);
  const [sent, setSent] = useState<{ id: string; due: string; saved: boolean } | null>(null);
  const recheck = draft.kind === "recheck";
  const pii = findPii(draft.question, ...draft.followUps, note);
  const needNote = recheck && note.trim().length < 5; // 재확인은 왜 다르게 보는지가 질의의 핵심
  const dup = findOpenExternal(useHq().inquiries, draft.key);
  const dupNote = dup && (
    <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-[13px] text-sky-900 ring-1 ring-sky-200">
      <span className="block">
        같은 쟁점으로 본점이 이미 외부기관({dup.external?.agencies.join(", ")})에 문의했습니다({dup.id}, {fmt(dup.external?.postedAt ?? dup.createdAt.slice(0, 10))} 등록).
      </span>
      <span className="block">질의를 보내면 그 회신에 묶입니다.</span>
      <span className="block">고객에게는 &ldquo;관계기관 확인 후 안내드리겠습니다&rdquo;라고 안내하세요.</span>
    </p>
  );

  if (sent) {
    return (
      <p className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-900">
        본점 질의 <b>{sent.id}</b>를 보냈습니다. 회신 기한 {fmt(sent.due)}.<br />
        <Link href="/inquiries" className="font-medium underline">
          내 질의에서 진행 상황 보기
        </Link>
        <span className="mt-1 block text-xs text-green-800">고객에게는 &ldquo;본점 확인 후 안내드리겠습니다&rdquo;라고 안내하세요(A은행 지침 제7조 2항).</span>
        {!sent.saved && (
          <span className="mt-1 block text-xs font-medium text-rose-700">브라우저 저장소에 저장하지 못해 이 탭에서만 보입니다(저장 공간 부족 또는 저장 차단).</span>
        )}
      </p>
    );
  }
  // 같은 쟁점의 승인된 본점 해석이 위에 있으면 질의는 '사정이 다를 때'로 낮춘다(심사위는 상정 요청이 필요해 그대로)
  if (!open && faq && draft.verdict !== "심사위") {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[14px] text-zinc-500">
        <span className="w-full">위 본점 해석대로 처리하면 됩니다.</span>
        <span>고객 사정이 달라 그래도 확인이 필요하면</span>
        <button onClick={() => setOpen(true)} className="font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900">
          본점 질의서 작성
        </button>
        {dupNote && <div className="w-full">{dupNote}</div>}
      </div>
    );
  }
  if (!open && recheck) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[14px] text-zinc-500">
        <span>이 판정이 고객 상황과 맞지 않나요?</span>
        <button onClick={() => setOpen(true)} className="font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900">
          본점에 재확인 요청
        </button>
        {dupNote && <div className="w-full">{dupNote}</div>}
      </div>
    );
  }
  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50/60 px-5 py-4">
        <div>
          <p className="text-[16px] font-semibold text-zinc-900">{faq ? "본점 해석에 따라 심사위 상정을 요청하세요" : "지점에서 확정할 수 없는 판정입니다"}</p>
          <p className="mt-0.5 text-[14px] text-zinc-600">
            <Lines text={faq ? "안건 등록과 개최일은 본점이 정합니다. 요청서는 판정 카드로 자동 작성됩니다." : "A은행 지침 제6조에 따라 본점에 질의하세요. 질의서는 판정 카드로 자동 작성됩니다."} />
          </p>
          {dupNote}
        </div>
        <button onClick={() => setOpen(true)} className="ml-auto rounded-xl bg-violet-600 px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-violet-700">
          {faq ? "심사위 상정 요청" : "본점 질의서 작성"}
        </button>
      </div>
    );
  }
  const subject = draft.title.replace(/^\[재확인·/, "[재확인 요청·");
  const factIds = draft.policies.map((p) => p.id);
  const blocked = !checked || pii.length > 0 || needNote;
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      {/* 메일 머리: 받는 곳·보내는 곳·제목이 이미 채워져 있어 지점은 의견만 쓰고 보내면 된다 */}
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50 px-5 py-3">
        <h3 className="text-[14px] font-semibold text-zinc-900">{recheck ? "본점 재확인 요청" : faq ? "심사위 상정 요청" : "본점 질의"}</h3>
        <span className="text-[12px] text-zinc-500">판정 카드로 자동 작성됨</span>
      </div>
      <dl className="divide-y divide-zinc-100 border-b border-zinc-200 px-5 text-[13px]">
        <MailField label="받는 곳">
          가상 A은행 본점 여신기획부
        </MailField>
        <MailField label="보내는 곳">지점 여신 창구</MailField>
        <MailField label="제목">
          <span className="font-semibold text-zinc-900">{subject}</span>
        </MailField>
        <MailField label="회신 기한">
          {fmt(draft.dueDate)} (3영업일, A은행 지침 제6조)
          {draft.urgent && <span className="ml-1.5 rounded bg-rose-600 px-1.5 py-0.5 text-[12px] font-semibold text-white">긴급</span>}
        </MailField>
      </dl>

      <div className="px-5 py-4">
        <p className="text-[14px] text-zinc-800">
          {recheck
            ? "여신기획부 담당자님, 아래 건은 여신 사수가 확정 판정을 냈으나 고객 상황과 맞는지 지점에서 판단하기 어려워 재확인을 요청드립니다."
            : "여신기획부 담당자님, 아래 건은 지점에서 확정할 수 없어 판단을 요청드립니다."}
        </p>
        {dupNote}
        <div className="mt-4">
          <InquiryDoc
            d={draft}
            noteSlot={
              <label className="mt-2 block">
                <span className="text-[12px] font-medium text-zinc-500">
                  {recheck ? "판정과 다르게 보는 이유(필수)" : "덧붙일 의견(선택)"}
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder={recheck ? "예: 임대차계약서상 종료일이 갱신청구권 행사로 바뀌었다고 고객이 말함" : "예: 고객이 발령 공문 사본을 가지고 있음"}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal focus:border-teal-600 focus:outline-none"
                />
                {needNote && note.length > 0 && <span className="block text-xs text-slate-500">판정과 다르게 보는 이유를 조금 더 적어 주세요.</span>}
              </label>
            }
          />
        </div>
        <p className="mt-4 text-[14px] text-zinc-800">검토 후 회신 부탁드립니다.</p>
        <p className="text-[14px] text-zinc-500">— 지점 여신 창구 드림</p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px] text-zinc-500">
          <span>첨부</span>
          <span className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-zinc-700">판정 카드 ({verdictLabel(draft.verdict)} · 근거 자료 {draft.kb} · 기준일 {fmt(draft.asOf)})</span>
          {factIds.length > 0 && <span className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-zinc-700">{factIds.join(", ")}</span>}
        </div>
      </div>

      <div className="border-t border-zinc-100 bg-zinc-50 px-5 py-3">
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          고객 이름·연락처·주민번호 등 개인정보가 들어 있지 않음을 확인했습니다(지침 제6조 2항)
        </label>
        {pii.length > 0 && (
          <p className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-800">
            질문 또는 지점 의견에 개인정보로 보이는 내용({pii.join(", ")})이 있어 보낼 수 없습니다. 질문에 있다면 창구 화면에서 지우고 다시 판정하세요.
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            disabled={blocked}
            onClick={(e) => {
              e.currentTarget.disabled = true; // 중복 전송 방지
              const { inquiry, saved } = submitInquiry(draft, note);
              setSent({ id: inquiry.id, due: inquiry.dueDate, saved });
            }}
            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-40"
          >
            본점에 보내기
          </button>
          <button onClick={() => setOpen(false)} className="rounded-md px-3 py-2 text-sm text-slate-500 hover:text-slate-800">
            닫기
          </button>
          <span className="ml-auto text-[12px] text-zinc-400">
            {blocked ? (recheck && needNote ? "다르게 보는 이유와 개인정보 확인 후 보낼 수 있습니다" : "개인정보 확인 후 보낼 수 있습니다") : "보내면 본점 여신기획부 질의함에 바로 등록됩니다"}
          </span>
        </div>
      </div>
    </section>
  );
}

function MailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-baseline gap-2 py-2">
      <dt className="text-[12px] text-zinc-500">{label}</dt>
      <dd className="min-w-0 text-zinc-800">{children}</dd>
    </div>
  );
}

/** 같은 쟁점의 승인된 본점 해석. 판정 코드는 바꾸지 않고 참고로만 보여 준다. */
export function FaqHit({ faq, kbNow, applied }: { faq: FaqEntry; kbNow: KbVersion; applied?: boolean }) {
  const rv = reviewFaq(faq, kbNow);
  const review = rv.status === "review";
  // 심사위 유형: 본점이 정한 것은 '상정 대상·받을 서류'까지이고, 인정 여부는 건마다 심사위가 정한다
  const committee = faq.verdictAtApproval === "심사위";
  return (
    <section className={`rounded-2xl border p-5 ${review ? "border-amber-300 bg-amber-50" : "border-teal-200 bg-teal-50"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-semibold text-white ${review ? "bg-amber-600" : "bg-teal-700"}`}>
          {review ? "본점 해석 재검토 필요" : committee ? "본점이 처리 방법을 정한 유형입니다" : "본점이 이미 답한 쟁점입니다"}
        </span>
        {faq.example && <span className="rounded bg-white px-1.5 py-0.5 text-[12px] font-medium text-slate-500 ring-1 ring-slate-200">예시</span>}
        <span className="text-xs text-slate-500">
          {faq.id} · {faq.approver} · 승인 {fmt(faq.approvedAt)} · 근거 자료 {faq.kb} 기준 · 같은 쟁점의 &lsquo;{faq.verdictAtApproval}&rsquo; 사례
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-600">
        <span className="block">가상 A은행 내부 해석입니다.</span>
        <span className="block">{committee ? "판정(심사위 상정)은 정부 발표 자료 기준 규칙 엔진 결과 그대로이고, 이 해석은 상정 준비 방법을 정합니다." : "판정 코드는 정부 발표 자료 기준 규칙 엔진 결과 그대로이고, 정부 발표 자료에 답이 없는 부분을 이 해석으로 처리합니다."}</span>
      </p>
      {!review && (
        <p className="mt-2 text-[13px] font-medium text-teal-800">
          {applied
            ? <><span className="block">같은 쟁점의 본점 회신이 있어 판정 카드의 &lsquo;다음 할 일&rsquo;과 고객 안내 문구에 반영했습니다.</span><span className="block">본점에 다시 묻지 않아도 됩니다.</span></>
            : committee
              ? <><span className="block">본점은 이 유형을 &lsquo;여신심사위 상정 대상&rsquo;으로 정하고 받을 서류를 정해 두었습니다.</span><span className="block">인정 여부는 건마다 여신심사위원회가 정하므로, 지점은 &lsquo;심사위에 올려야 하나요?&rsquo;를 따로 묻지 않고 서류를 받아 바로 상정을 요청하면 됩니다.</span></>
              : <><span className="block">같은 쟁점의 본점 회신입니다.</span><span className="block">아래 서류와 안내 문구로 준비하세요.</span></>}
        </p>
      )}
      <p className="mt-2 text-sm font-semibold text-slate-900">{faq.hqConclusion}</p>
      <LabeledLines text={faq.answer} className="mt-2 text-sm leading-relaxed text-slate-700" />
      {review && (
        <p className="mt-2 text-xs font-medium text-amber-800">
          <Lines text={rv.reason ?? ""} />
        </p>
      )}
    </section>
  );
}
