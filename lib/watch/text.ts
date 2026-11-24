// 원문 대조용 텍스트 유틸. PDF 추출본은 띄어쓰기가 빠지거나 늘어나므로 공백을 지우고 비교한다.

/** 공백·따옴표 변형·특수 공백을 지운 비교용 문자열 */
export function squash(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[\s 　]+/g, "")
    .replace(/[·‧ㆍ・]/g, "·");
}

/** 인용문이 원문에 그대로(공백 무시) 있는가. 너무 짧은 인용은 근거로 인정하지 않는다. */
export function quoteFound(quote: string, source: string, minLen = 12): boolean {
  const q = squash(quote).replace(/^[.…]+|[.…]+$/g, "");
  return q.length >= minLen && squash(source).includes(q);
}

function bigrams(s: string): Map<string, number> {
  const t = squash(s);
  const m = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** 문자 bigram Dice 유사도(0~1). 한국어 짧은 조항 요약끼리 대응 여부를 볼 때 쓴다. */
export function similarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  let total = 0;
  for (const [g, n] of A) {
    inter += Math.min(n, B.get(g) ?? 0);
    total += n;
  }
  for (const n of B.values()) total += n;
  return total ? (2 * inter) / total : 0;
}

/** start 표지부터 end 표지 직전까지(없으면 끝까지). 표지는 공백을 무시하지 않고 그대로 찾는다. */
export function sliceSection(text: string, start: string, end?: string): string | undefined {
  const i = text.indexOf(start);
  if (i < 0) return undefined;
  const j = end ? text.indexOf(end, i + start.length) : -1;
  return text.slice(i, j > i ? j : undefined);
}
