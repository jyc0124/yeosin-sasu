// 판정 카드 빌더: 판정 경로(trace)와 근거 Fact ID를 함께 쌓는다.
import type { BasisItem, KbVersion, ModuleId, Verdict, VerdictCode } from "./types";

export class Card {
  private trace: Verdict["trace"] = [];
  private facts = new Set<string>();
  private gaps = new Set<string>();
  conditions: string[] = [];
  documents: string[] = [];
  questions: string[] = [];
  needsLatest = false;
  basisItems: BasisItem[] = [];
  /** 결론이 유지되려면 지켜야 하는 의무·추후 검증(예: 실거주 시점에 전세대출 종료). 허용이어도 결론 문장에 반드시 함께 쓴다 */
  obligations: string[] = [];

  constructor(
    private module: ModuleId,
    private kb: KbVersion,
  ) {}

  step(step: string, result: string, facts: string[] = []) {
    this.trace.push({ step, result, facts });
    facts.forEach((f) => (f.startsWith("G-") ? this.gaps.add(f) : this.facts.add(f)));
    return this;
  }
  fact(...ids: string[]) {
    ids.forEach((f) => (f.startsWith("G-") ? this.gaps.add(f) : this.facts.add(f)));
    return this;
  }
  cond(...c: string[]) {
    this.conditions.push(...c);
    return this;
  }
  /** 의무 조건: 조건 목록과 결론 문장에 반드시 함께 나오게 한다(조건이 있는 허용을 조건 없이 내지 않게 — docs/QUALITY_PRINCIPLES.md) */
  oblige(...c: string[]) {
    for (const x of c) if (!this.obligations.includes(x)) this.obligations.push(x);
    return this.cond(...c.filter((x) => !this.conditions.includes(x)));
  }
  doc(...d: string[]) {
    for (const x of d) if (!this.documents.includes(x)) this.documents.push(x);
    return this;
  }
  ask(...q: string[]) {
    for (const x of q) if (!this.questions.includes(x)) this.questions.push(x);
    return this;
  }
  /** 확인된 기준(규제별). Fact는 근거 목록에도 넣는다 */
  basis(label: string, text: string, facts: string[], note?: string) {
    if (!this.basisItems.some((b) => b.label === label && b.text === text)) this.basisItems.push({ label, text, facts, ...(note ? { note } : {}) });
    this.fact(...facts);
    return this;
  }
  latest() {
    this.needsLatest = true;
    return this;
  }

  done(verdict: VerdictCode, headline: string, facts: string[] = []): Verdict {
    this.fact(...facts);
    // 의무 조건이 결론 문장에 없으면 붙인다. 답변 코드 정의상 '조건을 지키면 가능'은 조건부다(scripts/codex/VERDICTS.md)
    // → 의무 조건이 있는 허용은 조건부로 낸다(11/22: 테스트셋 A16 정답도 정의에 맞춰 조건부로 정정)
    const missing = this.obligations.filter((o) => !headline.includes(o.replace(/[.。]$/, "")));
    if (missing.length) headline = `${headline} ${missing.join(" ")}`.trim();
    if (verdict === "허용" && this.obligations.length) verdict = "조건부";
    return {
      verdict,
      module: this.module,
      headline,
      conditions: this.conditions,
      documents: this.documents,
      questions: this.questions,
      facts: [...this.facts],
      gaps: [...this.gaps],
      needsLatest: this.needsLatest || [...this.gaps].some((g) => ["G-01", "G-07", "G-08"].includes(g)),
      trace: this.trace,
      kb: this.kb,
      ...(this.basisItems.length ? { basis: this.basisItems } : {}),
    };
  }
}
