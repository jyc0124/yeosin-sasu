"use client";
// 베타 테스터 의견: 판정 결과마다 "현장 판단과 맞나요?"(VerdictFeedback), 화면 전체에 대한 의견(GeneralFeedback).
import { useEffect, useState } from "react";
import { findPii } from "@/lib/hq/guard";

const ROLES = ["지점 창구(수신·여신)", "지점 여신 담당", "본점·심사", "기타"] as const;
const ROLE_KEY = "loandesk:tester-role";

function useRole() {
  const [role, setRole] = useState("");
  useEffect(() => {
    try {
      setRole(localStorage.getItem(ROLE_KEY) ?? "");
    } catch {}
  }, []);
  const save = (r: string) => {
    setRole(r);
    try {
      localStorage.setItem(ROLE_KEY, r);
    } catch {}
  };
  return [role, save] as const;
}

async function send(body: Record<string, unknown>) {
  const res = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `서버 오류 (${res.status})`);
}

function RolePicker({ role, onRole }: { role: string; onRole: (r: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
      <span className="text-zinc-500">직무(선택)</span>
      {ROLES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onRole(role === r ? "" : r)}
          className={`rounded-full px-2.5 py-1 ring-1 ${role === r ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50"}`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

type Rating = "right" | "wrong" | "bank" | "unsure";
// '틀렸어요'(정부 규정 판정 오류)와 '우리 은행 기준은 달라요'(가상 A은행 지침과의 차이)를 나눠 받는다
// off: 고르기 전에도 뜻이 색으로 보이게(연한 색), on: 고른 버튼
const RATING: { id: Rating; label: string; on: string; off: string }[] = [
  { id: "right", label: "맞아요", on: "bg-green-600 text-white ring-green-600", off: "bg-green-50 text-green-800 ring-green-200 hover:bg-green-100" },
  { id: "wrong", label: "틀렸어요", on: "bg-rose-600 text-white ring-rose-600", off: "bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100" },
  { id: "bank", label: "우리 은행 기준은 달라요", on: "bg-violet-600 text-white ring-violet-600", off: "bg-violet-50 text-violet-800 ring-violet-200 hover:bg-violet-100" },
  { id: "unsure", label: "애매해요", on: "bg-amber-500 text-white ring-amber-500", off: "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100" },
];
const PLACEHOLDER: Record<Rating, string> = {
  right: "(선택) 좋았던 점이나 현장에서 더 필요한 내용",
  wrong: "어디가 틀렸나요? 예) 이 경우는 정부 FAQ상 예외에 해당합니다",
  bank: "어느 부분이 다른가요? 예) 받는 서류가 다름 / 심사위 상정 대상이 다름\n※ 은행 내부 규정의 원문이나 구체 수치는 적지 마세요.",
  unsure: "어느 부분이 애매한가요?",
};

export function VerdictFeedback({
  question,
  followUps,
  verdict,
  module,
  kb,
  asOf,
}: {
  question: string;
  followUps: string[];
  verdict?: string;
  module?: string;
  kb?: string;
  asOf?: string;
}) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [comment, setComment] = useState("");
  const [role, setRole] = useRole();
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [err, setErr] = useState<string | null>(null);
  const pii = findPii(comment);

  if (state === "sent")
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-[14px] text-green-800">
        의견 고맙습니다. 다음 고객 건도 편하게 시험해 보세요.
      </div>
    );

  const submit = async () => {
    if (!rating) return;
    setState("sending");
    setErr(null);
    try {
      await send({ kind: "verdict", rating, comment, role, question, followUps, verdict, module, kb, asOf, page: "/" });
      setState("sent");
    } catch (e) {
      setErr((e as Error).message);
      setState("idle");
    }
  };

  // 한 줄: 판정 화면을 무겁게 하지 않도록 질문과 버튼만. 고르면 아래에 의견 칸이 열린다
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-[14px] text-zinc-600">
          <span className="mr-1.5 rounded bg-indigo-600 px-1.5 py-0.5 align-[1px] text-[11px] font-semibold text-white">베타</span>
          이 판정, 현장 판단과 맞나요?
        </p>
        <div className="flex flex-wrap gap-1.5">
          {RATING.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRating(r.id)}
              title={r.id === "bank" ? "결론은 정부 규정 기준입니다. 서류·절차가 다른 건 이것을 눌러 주세요." : undefined}
              className={`rounded-lg px-2.5 py-1 text-[13px] font-semibold ring-1 ${rating === r.id ? r.on : r.off}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {rating && (
        <div className="mt-3 space-y-3">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={PLACEHOLDER[rating]}
            className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[15px] leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-indigo-300"
          />
          <RolePicker role={role} onRole={setRole} />
          {pii.length > 0 && <p className="text-[13px] text-rose-700">개인정보로 보이는 내용({pii.join(", ")})이 있습니다. 지우고 보내 주세요.</p>}
          {err && <p className="text-[13px] text-rose-700">{err}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={state === "sending" || pii.length > 0}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-[15px] font-semibold text-white hover:bg-indigo-700 disabled:bg-zinc-300"
          >
            {state === "sending" ? "보내는 중…" : "의견 보내기"}
          </button>
        </div>
      )}
    </div>
  );
}

export function GeneralFeedback() {
  const [comment, setComment] = useState("");
  const [role, setRole] = useRole();
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [err, setErr] = useState<string | null>(null);
  const pii = findPii(comment);

  const submit = async () => {
    setState("sending");
    setErr(null);
    try {
      await send({ kind: "general", comment, role, page: "/feedback" });
      setState("sent");
      setComment("");
    } catch (e) {
      setErr((e as Error).message);
      setState("idle");
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5">
      {state === "sent" && <p className="rounded-xl bg-green-50 px-4 py-3 text-[15px] text-green-800 ring-1 ring-green-200">의견 고맙습니다. 더 있으면 이어서 적어 주세요.</p>}
      <textarea
        value={comment}
        onChange={(e) => {
          setComment(e.target.value);
          if (state === "sent") setState("idle");
        }}
        rows={7}
        maxLength={2000}
        placeholder={"예)\n- 처음 화면에서 무엇부터 눌러야 할지 헷갈렸어요\n- 창구에서 자주 듣는 ○○ 질문은 못 알아듣네요\n- 고객 안내 문구를 그대로 복사할 수 있으면 좋겠어요"}
        className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[15px] leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-indigo-300"
      />
      <RolePicker role={role} onRole={setRole} />
      {pii.length > 0 && <p className="text-[13px] text-rose-700">개인정보로 보이는 내용({pii.join(", ")})이 있습니다. 지우고 보내 주세요.</p>}
      {err && <p className="text-[13px] text-rose-700">{err}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={state === "sending" || !comment.trim() || pii.length > 0}
        className="rounded-xl bg-indigo-600 px-5 py-2.5 text-[15px] font-semibold text-white hover:bg-indigo-700 disabled:bg-zinc-300"
      >
        {state === "sending" ? "보내는 중…" : "의견 보내기"}
      </button>
    </div>
  );
}
