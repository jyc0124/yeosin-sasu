"use client";
// '이번 판단에 사용한 조건' + [조건 수정] (현장 피드백 11/22 · UI 상세 수정안 §5).
// - 접혀 있어도 '조건 수정' 버튼은 보인다.
// - 수정은 같은 화면에서 펼쳐서 한다. 바꾼 항목만 '기존 → 변경'으로 보이고, 나머지는 그대로 둔다.
// - 변경이 없으면 다시 판정 버튼을 막는다. '수정 취소'는 이번 편집만 버린다.
// - 보낼 때는 바꾼 항목만 '조건 정정' 문장으로 같은 고객 건에 덧붙여 다시 판정한다(조건 추출 → 규칙 엔진).
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { composeCorrection } from "./answerItems";

export function ConditionPanel({
  rows,
  extra,
  meta,
  canEdit,
  busy,
  onEditing,
  onSubmit,
  children,
}: {
  rows: [string, string][];
  /** 펼쳤을 때 조건 아래에 붙는 내용(가정·경고) */
  extra?: React.ReactNode;
  meta?: string;
  canEdit: boolean;
  busy?: boolean;
  onEditing?: (on: boolean) => void;
  onSubmit: (text: string) => void;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [vals, setVals] = useState<string[]>([]);
  const [unknown, setUnknown] = useState<boolean[]>([]);
  const [added, setAdded] = useState("");
  const editBtn = useRef<HTMLButtonElement>(null);
  const firstInput = useRef<HTMLInputElement>(null);

  const start = () => {
    setVals(rows.map(([, v]) => v));
    setUnknown(rows.map(() => false));
    setAdded("");
    setEditing(true);
    setOpen(true);
    onEditing?.(true);
  };
  const cancel = () => {
    setEditing(false);
    onEditing?.(false);
    window.setTimeout(() => editBtn.current?.focus(), 0);
  };
  useEffect(() => {
    if (editing) firstInput.current?.focus();
  }, [editing]);
  // 다시 판정이 시작되면(조건이 바뀌면) 편집을 닫는다
  const key = rows.map((r) => r.join("=")).join("|");
  useEffect(() => {
    setEditing(false);
    onEditing?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const changes = rows
    .map(([k, v], i) => ({ k, from: v, to: unknown[i] ? "모름(확인 안 됨)" : (vals[i] ?? v).trim() }))
    .filter((c) => c.to !== c.from && c.to !== "");
  const dirty = changes.length > 0 || added.trim().length > 0;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left text-[14px]">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-green-100 text-green-700">
            <Icon name="check" className="h-3 w-3" />
          </span>
          <span className="font-semibold text-zinc-800">이번 판단에 사용한 조건</span>
          <span className="text-zinc-400">
            · {rows.length}개{meta ? ` ${meta}` : ""}
          </span>
          <Icon name="chevron" className={`ml-auto h-3.5 w-3.5 shrink-0 text-zinc-400 transition ${open ? "rotate-90" : ""}`} />
        </button>
        {canEdit && !editing && (
          <button
            ref={editBtn}
            type="button"
            onClick={start}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-[13px] font-semibold text-zinc-700 hover:border-indigo-400 hover:text-indigo-700 disabled:opacity-40"
          >
            조건 수정
          </button>
        )}
      </div>

      {open && !editing && (
        <div className="border-t border-zinc-100 px-4 py-3">
          {rows.length > 0 ? (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-[14px] sm:grid-cols-2">
              {rows.map(([k, v], i) => (
                <div key={i} className="flex gap-2">
                  <dt className="w-28 shrink-0 text-zinc-500">{k}</dt>
                  <dd className="min-w-0 font-medium text-zinc-900">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-[14px] text-zinc-500">판정에 쓸 구체적 조건이 질문에 없습니다.</p>
          )}
          {extra}
          {children}
        </div>
      )}

      {editing && (
        <form
          className="border-t border-zinc-100 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!dirty || busy) return;
            onSubmit(composeCorrection(changes, added));
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
          }}
        >
          <p className="text-[14px] font-semibold text-zinc-800">조건 수정</p>
          <p className="mb-3 text-[13px] text-zinc-500">틀린 항목만 고치세요. 다른 조건은 그대로 두고, 수정한 값은 다시 판정한 뒤 반영됩니다.</p>
          <ul className="space-y-2.5">
            {rows.map(([k, v], i) => {
              const changed = unknown[i] || (vals[i] ?? v).trim() !== v;
              return (
                <li key={i} className={`rounded-lg px-2.5 py-2 ${changed ? "bg-amber-50 ring-1 ring-inset ring-amber-200" : ""}`}>
                  <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                    <span className="w-32 shrink-0 text-[14px] text-zinc-600">{k}</span>
                    <input
                      ref={i === 0 ? firstInput : undefined}
                      value={unknown[i] ? "" : vals[i] ?? v}
                      disabled={unknown[i] || busy}
                      onChange={(e) => setVals((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
                      placeholder={unknown[i] ? "모름(확인 안 됨)" : ""}
                      className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[15px] outline-none focus:border-zinc-400 disabled:bg-zinc-50"
                    />
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={!!unknown[i]}
                      onClick={() => setUnknown((p) => p.map((x, j) => (j === i ? !x : x)))}
                      className={`shrink-0 self-start rounded-full border border-dashed px-2.5 py-1 text-[13px] sm:self-auto ${unknown[i] ? "border-zinc-600 bg-zinc-600 text-white" : "border-zinc-300 text-zinc-500 hover:border-zinc-500"}`}
                    >
                      모름
                    </button>
                  </label>
                  {changed && (
                    <p className="mt-1 text-[13px] text-amber-800 sm:pl-[8.75rem]">
                      기존: {v} → 변경: <b className="font-semibold">{unknown[i] ? "모름(확인 안 됨)" : (vals[i] ?? v).trim() || "(빈칸 — 바꾸지 않음)"}</b>
                    </p>
                  )}
                </li>
              );
            })}
            <li className="px-2.5">
              <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <span className="w-32 shrink-0 text-[14px] text-zinc-600">빠진 조건 추가</span>
                <input
                  value={added}
                  onChange={(e) => setAdded(e.target.value)}
                  placeholder="예: 담보 주택은 서울 송파구 아파트"
                  className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[15px] outline-none focus:border-zinc-400"
                />
              </label>
            </li>
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={cancel} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-[14px] font-medium text-zinc-700 hover:border-zinc-400">
              수정 취소
            </button>
            <span className="text-[13px] text-zinc-500" aria-live="polite">
              {dirty ? `바꾼 항목 ${changes.length + (added.trim() ? 1 : 0)}개 · 아직 판정에 반영하지 않은 변경사항입니다` : "변경한 항목이 없습니다"}
            </span>
            <button type="submit" disabled={!dirty || busy} className="ml-auto rounded-lg bg-zinc-900 px-3.5 py-2 text-[14px] font-semibold text-white hover:bg-indigo-700 disabled:bg-zinc-300">
              변경사항 반영하고 다시 판정
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
