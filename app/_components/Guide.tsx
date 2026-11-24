// 화면 사용법 안내 상자(처음 보는 사람용). 접어 둘 수 있다.
export function Guide({ title, steps, children }: { title: string; steps: string[]; children?: React.ReactNode }) {
  return (
    <details open className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
      <summary className="cursor-pointer text-xs font-semibold text-slate-500">{title}</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {children && <p className="mt-2 text-xs leading-relaxed text-slate-500">{children}</p>}
    </details>
  );
}
