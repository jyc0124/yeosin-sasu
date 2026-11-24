// 심사위원용 화면(이야기·심사 안내·평가 결과)의 시각 부품: 3초 안에 보이고, 필요하면 '자세히'로 펼친다.
// 색의 뜻은 하나로: 초록 = 좋음, 빨강 = 위험, 주황 = 한계·부분, 회색 = 중립. 서버 컴포넌트에서도 쓸 수 있게 상태(hook)를 쓰지 않는다.
import type { ReactNode } from "react";

/** 접힌 세부 내용. 요약은 밖에 두고, 문단·조건·한계는 이 안에 */
export function More({ children, label = "자세히 보기", className = "" }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <details className={`group mt-2 ${className}`}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md text-[13px] font-medium text-zinc-500 hover:text-indigo-700 [&::-webkit-details-marker]:hidden">
        <span className="transition group-open:rotate-90">▸</span>
        <span className="group-open:hidden">{label}</span>
        <span className="hidden group-open:inline">접기</span>
      </summary>
      <div className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-zinc-600">{children}</div>
    </details>
  );
}

export type MarkKind = "ok" | "part" | "bad" | "none";
const MARK: Record<MarkKind, { sym: string; cls: string }> = {
  ok: { sym: "✓", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  part: { sym: "△", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  bad: { sym: "✗", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
  none: { sym: "–", cls: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
};
/** ✓ △ ✗ 결과 칩 */
export function Mark({ kind, children }: { kind: MarkKind; children?: ReactNode }) {
  const m = MARK[kind];
  return (
    <span className={`inline-flex items-start gap-1.5 rounded-lg px-2 py-1 text-[13px] leading-snug ring-1 ring-inset ${m.cls}`}>
      <b className="shrink-0">{m.sym}</b>
      {children && <span>{children}</span>}
    </span>
  );
}

export type Seg = { n: number; label: string; tone: "ok" | "part" | "bad" | "none" };
const SEG_CLS: Record<Seg["tone"], string> = { ok: "bg-emerald-500", part: "bg-amber-400", bad: "bg-rose-500", none: "bg-zinc-300" };
const SEG_TXT: Record<Seg["tone"], string> = { ok: "text-emerald-700", part: "text-amber-700", bad: "text-rose-700", none: "text-zinc-500" };
/** 맞음·부분·위험을 한 줄 막대로 */
export function StackBar({ name, segs, note, strong }: { name: string; segs: Seg[]; note?: string; strong?: boolean }) {
  const total = segs.reduce((a, s) => a + s.n, 0) || 1;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className={`text-[14px] ${strong ? "font-bold text-zinc-900" : "font-semibold text-zinc-700"}`}>{name}</p>
        <p className="flex flex-wrap gap-x-2.5 text-[13px] font-semibold">
          {segs.map((s) => (
            <span key={s.label} className={SEG_TXT[s.tone]}>
              {s.label} {s.n}
            </span>
          ))}
        </p>
      </div>
      <div className="mt-1.5 flex h-4 overflow-hidden rounded-full bg-zinc-100">
        {segs.map((s) => (s.n ? <div key={s.label} className={SEG_CLS[s.tone]} style={{ width: `${(100 * s.n) / total}%` }} /> : null))}
      </div>
      {note && <p className="mt-1 text-[12px] text-zinc-500">{note}</p>}
    </div>
  );
}

/** 전 → 후 막대(정답률 같은 백분율) */
export function BeforeAfter({ label, before, after, beforeLabel = "전", afterLabel = "후" }: { label: string; before: number; after: number; beforeLabel?: string; afterLabel?: string }) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-zinc-700">{label}</p>
      {(
        [
          [beforeLabel, before, "bg-zinc-300", "text-zinc-500"],
          [afterLabel, after, "bg-indigo-600", "text-indigo-700"],
        ] as const
      ).map(([t, v, bar, txt]) => (
        <div key={t} className="mt-1.5 flex items-center gap-2">
          <span className="w-12 shrink-0 text-[12px] text-zinc-500">{t}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-zinc-100">
            <div className={`h-full rounded-full ${bar}`} style={{ width: `${v}%` }} />
          </div>
          <span className={`w-12 shrink-0 text-right text-[14px] font-bold tabular-nums ${txt}`}>{v}%</span>
        </div>
      ))}
    </div>
  );
}

/** 단계 흐름(→). 좁은 화면에서는 세로로 */
export function Flow({ steps }: { steps: { title: string; sub?: string; tone?: "liner" | "code" | "human" | "plain" }[] }) {
  const tone = { liner: "bg-indigo-600 text-white", code: "bg-zinc-900 text-white", human: "bg-amber-100 text-amber-900 ring-1 ring-amber-300", plain: "bg-white text-zinc-800 ring-1 ring-zinc-200" };
  return (
    <ol className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
      {steps.map((s, i) => (
        <li key={s.title} className="flex flex-1 items-center gap-2 sm:flex-col sm:items-stretch">
          <div className={`flex-1 rounded-xl px-3 py-2.5 text-center ${tone[s.tone ?? "plain"]}`}>
            <p className="text-[15px] font-bold leading-tight">{s.title}</p>
            {s.sub && <p className="mt-0.5 text-[12px] leading-snug opacity-80">{s.sub}</p>}
          </div>
          {i < steps.length - 1 && <span className="shrink-0 text-center text-[18px] font-bold text-zinc-300 sm:hidden">↓</span>}
        </li>
      )).flatMap((el, i) => (i < steps.length - 1 ? [el, <li key={`a${i}`} aria-hidden className="hidden shrink-0 items-center text-[20px] font-bold text-zinc-300 sm:flex">→</li>] : [el]))}
    </ol>
  );
}

/** 큰 숫자 + 한 줄 */
export function Stat({ value, label, tone = "indigo", sub }: { value: string; label: string; tone?: "indigo" | "green" | "amber" | "rose" | "zinc"; sub?: string }) {
  const c = { indigo: "text-indigo-700", green: "text-emerald-700", amber: "text-amber-700", rose: "text-rose-700", zinc: "text-zinc-700" }[tone];
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
      <p className={`text-[26px] font-bold leading-none tracking-tight tabular-nums ${c}`}>{value}</p>
      <p className="mt-2 text-[14px] font-semibold leading-snug text-zinc-900">{label}</p>
      {sub && <p className="mt-0.5 text-[12px] leading-snug text-zinc-500">{sub}</p>}
    </div>
  );
}
