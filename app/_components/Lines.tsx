// 문장마다 줄을 나눠 문장 중간에서 줄이 넘어가지 않게 한다(한국어 화면 줄바꿈 규칙: 문장 단위 + 어절 단위)
import type { ReactNode } from "react";

/** 문장 끝(. ? ! 뒤 닫는 따옴표 포함)에서 나눈다. '8.13'·'26.12.31'처럼 숫자 사이 점은 나누지 않는다. */
export function splitSentences(text: string): string[] {
  return text
    .split("\n")
    .flatMap((line) => line.split(/(?<=[.?!]["”’']?)\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 문장마다 한 줄(block). render로 문장별 모양을 바꿀 수 있다(마지막 문장에 인용 번호 등). */
export function Lines({ text, render }: { text: string; render?: (sentence: string, last: boolean) => ReactNode }) {
  const parts = splitSentences(text);
  return (
    <>
      {parts.map((s, i) => (
        <span key={i} className="block">
          {render ? render(s, i === parts.length - 1) : s}
        </span>
      ))}
    </>
  );
}

/** '판단 근거: …' 같은 이름표 붙은 여러 줄 글: 이름표는 굵게, 내용은 문장마다 한 줄 */
export function LabeledLines({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {text.split("\n").map((line, i) => {
        const m = line.match(/^([^:"“]{1,10}):\s*(.*)$/);
        return m ? (
          <div key={i} className="grid gap-x-2 sm:grid-cols-[5.5rem_1fr]">
            <span className="font-semibold text-slate-600">{m[1]}</span>
            <span>
              <Lines text={m[2]} />
            </span>
          </div>
        ) : (
          <div key={i}>
            <Lines text={line} />
          </div>
        );
      })}
    </div>
  );
}
