// 설명 문장 원문 대조 검증기(결정적, LLM 없음). CLAUDE.md 원칙 3: 대조를 통과한 문장만 화면에 낸다.
// 한계: 어휘·숫자·표현 규칙으로 거르는 검사다. 의미를 이해하지 않으므로 교묘한 뒤집기를 모두 막지는 못한다(docs/RULES.md §6-3).
// 그래서 실패 방향을 '좋은 문장을 버리는 쪽'으로 둔다. 판정 코드는 이 문장들과 무관하게 규칙 엔진이 정한다.
import { findAvoidance } from "@/lib/hq/guard";
import { similarity } from "@/lib/watch/text";
import type { Verdict } from "@/lib/rules/types";

export interface DraftSentence {
  text: string;
  facts: string[];
}
export interface CheckedSentence extends DraftSentence {
  ok: boolean;
  reasons: string[]; // 탈락 사유(화면에는 내보내지 않고 건수·로그로만)
  score: number; // 인용 Fact·카드 항목과의 최대 유사도
  source: "fact" | "card"; // card = 카드 문장(결론·서류·확인 질문)을 옮긴 것이라 인용 Fact를 표시하지 않음
}

/** 인용 Fact 또는 카드 항목과의 최소 유사도(어휘 겹침). 의미 일치를 뜻하지 않는다. */
export const MIN_SIMILARITY = 0.15;
/** 인용 Fact와 직접 겹쳐야 그 ID를 근거로 표시한다 */
export const MIN_FACT_SIMILARITY = 0.12;

// ── 숫자·날짜 토큰 ─────────────────────────────────────────────
type NumTok =
  | { kind: "date"; y?: number; m: number; d: number }
  | { kind: "month"; y?: number; m: number }
  | { kind: "year"; y: number }
  | { kind: "num"; v: number; unit: string };

const UNIT: Record<string, string> = {
  "%": "%", 퍼센트: "%", "%p": "%p", 억: "억", 만원: "만원", 원: "원", 개월: "개월", 달: "개월", 년: "년", 해: "년",
  일: "일", 영업일: "영업일", 채: "채", 주택: "채", 세: "세", 배: "배", 주: "주", 번: "번", 회: "번", 명: "명",
};
const KNUM: Record<string, number> = { 한: 1, 일: 1, 두: 2, 이: 2, 세: 3, 석: 3, 삼: 3, 네: 4, 넉: 4, 사: 4, 다섯: 5, 오: 5, 여섯: 6, 육: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10, 십: 10 };
const yr = (s: string) => (s.length === 2 ? 2000 + Number(s) : Number(s));

/** 문장·출처에서 숫자 토큰을 뽑는다. 날짜는 (연)월일로, 수량은 값+단위로 비교한다. */
export function numTokens(text: string): NumTok[] {
  let t = text.replace(/[‘’`´]/g, "'");
  const out: NumTok[] = [];
  const take = (re: RegExp, f: (m: RegExpMatchArray) => NumTok | undefined) => {
    t = t.replace(re, (...args) => {
      const m = args.slice(0, -2) as unknown as RegExpMatchArray;
      const tok = f(m);
      if (tok) out.push(tok);
      return " ";
    });
  };
  // 금액 '2억 3천만원'·'5천만원' → 억 단위 값(카드는 '2.3억원'으로 쓴다)
  take(/(\d+)\s*억\s*(\d)\s*천\s*(?:만\s*)?원?/g, (m) => ({ kind: "num", v: Number(m[1]) + Number(m[2]) / 10, unit: "억" }));
  take(/(?<![\d억])(\d)\s*천\s*만\s*원/g, (m) => ({ kind: "num", v: Number(m[1]) / 10, unit: "억" }));
  // 소수 금액 '2.3억'(날짜 2.3으로 읽지 않게 날짜보다 먼저)
  take(/(\d+\.\d+)\s*억/g, (m) => ({ kind: "num", v: Number(m[1]), unit: "억" }));
  // 2026.12.31 · '26.12.31 · 2026년 12월 31일 · 2026-12-31
  take(/'?(\d{4}|\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/g, (m) => ({ kind: "date", y: yr(m[1]), m: Number(m[2]), d: Number(m[3]) }));
  // 12월 31일
  take(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g, (m) => ({ kind: "date", m: Number(m[1]), d: Number(m[2]) }));
  // 2027년 1월 · 12월(일 없음)
  take(/(?:'?(\d{4}|\d{2})\s*년\s*)?(\d{1,2})\s*월(?!\s*\d)/g, (m) => ({ kind: "month", y: m[1] ? yr(m[1]) : undefined, m: Number(m[2]) }));
  // 2027년 · '27년
  take(/'?(\d{4}|\d{2})\s*년(?!\s*\d)/g, (m) => ({ kind: "year", y: yr(m[1]) }));
  // 12.31 · 4/10 (월.일)
  take(/(?<![\d.])(\d{1,2})\s*[./]\s*(\d{1,2})(?![\d.%])/g, (m) => ({ kind: "date", m: Number(m[1]), d: Number(m[2]) }));
  // 한글 수사 + 단위(세 달, 두 채)
  // 고유어 수사(한·두·세·석…) + 달·해·채·배·번, 한자어 수사(일·이·삼…)는 년·개월에만('이번'·'일해' 같은 말을 숫자로 읽지 않게)
  take(/(?<![가-힣])(한|두|세|석|네|넉|다섯|여섯|일곱|여덟|아홉|열)\s*(달|개월|해|년|채|배|번)/g, (m) => ({ kind: "num", v: KNUM[m[1]], unit: UNIT[m[2]] }));
  take(/(?<![가-힣])(일|이|삼|사|오|육|십)\s*(년|개월)/g, (m) => ({ kind: "num", v: KNUM[m[1]], unit: UNIT[m[2]] }));
  // 숫자 + 단위
  take(/(\d+(?:\.\d+)?)\s*(%p|%|퍼센트|억|만\s*원|원|개월|달|영업일|년|일|채|주택|세|배|주|번|회|명)/g, (m) => ({
    kind: "num",
    v: Number(m[1]),
    unit: UNIT[m[2].replace(/\s/g, "")] ?? m[2],
  }));
  // 나머지 맨 숫자
  take(/\d+(?:\.\d+)?/g, (m) => ({ kind: "num", v: Number(m[0]), unit: "" }));
  return out;
}

function supported(tok: NumTok, src: NumTok[]): boolean {
  if (tok.kind === "date")
    return src.some((s) => s.kind === "date" && s.m === tok.m && s.d === tok.d && (tok.y === undefined || s.y === undefined || s.y === tok.y));
  if (tok.kind === "month")
    return src.some((s) => (s.kind === "date" || s.kind === "month") && s.m === tok.m && (tok.y === undefined || s.y === undefined || s.y === tok.y));
  if (tok.kind === "year") return src.some((s) => (s.kind === "year" || s.kind === "date" || s.kind === "month") && s.y === tok.y);
  // 수량: 같은 값·같은 단위. 단위가 없는 맨 숫자는 같은 값이 출처에 있으면 인정
  return src.some((s) => s.kind === "num" && s.v === tok.v && (tok.unit === "" || s.unit === "" || s.unit === tok.unit));
}

const show = (t: NumTok) =>
  t.kind === "date" ? `${t.y ? `${t.y}.` : ""}${t.m}.${t.d}` : t.kind === "month" ? `${t.m}월` : t.kind === "year" ? `${t.y}년` : `${t.v}${t.unit}`;

// ── 판정과 어긋나는 단정 ───────────────────────────────────────
const UNCERTAIN = new Set(["보류", "심사위", "역질문", "내부지침"]);
/** 확정하지 않는 말투: 먼저 지우고 남은 부분에 긍정 단정이 있는지 본다 */
const HEDGES = [
  /[가-힣]*(되는지|된다는지|인지|한지|할 수 있는지|받을 수 있는지|가능한지|여부)(는|를|가)?/g,
  /확인(한|하신|해 드린)? (후|뒤)[^.]*?(안내|말씀)드리겠습니다/g,
  /심사를? (받으셔야|거쳐야|받을 수 있습니다|받으실 수 있습니다)/g,
  /(확정|확답|단정)(해 드릴|할|하기) 수 없|(확정|확답|단정)하기 어렵/g,
  /(달라질|바뀔|변경될) 수 있/g,
  /(확인|안내|검토|설명)(해\s?드리겠|하겠|드리겠|해 드릴게)[가-힣]*/g,
  /알려\s?주시(겠어요|겠습니까|면)|준비해\s?주시|확인해\s?주시|말씀해\s?주시/g,
];
const POSITIVE =
  /(가능|인정(되|받|돼)|수 있|문제(없|가 없)|충족|될 것|됩니다|돼요|돼서|허용|괜찮|해 드리겠|해 드릴게|(으)?로 봅니다|걱정\s?(마|않|하지 마)|해당하십니다|맞습니다|되십니다|진행하겠|처리하겠)/;
/** 부정·제한 표현: 불허 판정에서 이것이 있는 문장은 '된다'는 약속이 아니다 */
const NEGATION =
  /(안 됩니다|안 돼요|않습니다|않아요|않으며|제한됩니다|제한돼|제한되어|제한을 받|제한(이|에|에만|을)?\s?(적용|대상)|불가합니다|불가해|어렵습니다|어려워|없습니다|불허됩니다)/;
/** 불허 판정에서 막아야 할 것: 대출·연장이 된다는 약속 */
const LOAN_PROMISE =
  /(연장|대출|진행|처리)[^.]{0,12}?(가능|됩니다|돼요|되세요|이루어|나갑니다|드립니다|해\s?드리|하겠습니다|받으실 수 있|하실 수 있|허용)|(가능합니다|허용됩니다|해 드리겠습니다|해 드릴게요)/;
/** 결론의 핵심어와 반대 핵심어. 카드 결론에 앞의 말이 있는데 문장이 뒤의 말을 단서 없이 쓰면 결론을 뒤집은 것 */
const OPPOSITES: [string, string][] = [
  ["종전 규정", "신규 규정"],
  ["종전 규정", "신규 규제"],
];
const OPPOSITE_QUALIFIER = /(증액|다음 만기|이후 만기|'?27년|2027|시행일 이후)/;
/** 불허 판정에서 막아야 할 것: 요건을 인정·충족한다는 말(예: 실거주로 인정됩니다) */
const RECOGNITION = /(인정(됩|되|될|받|돼)|충족|문제(없|가 없)|걱정\s?(마|않|하지 마))/;
/** 조건부: 조건을 지우는 단정 */
const UNCONDITIONAL = /(자동(으로)?|무조건|(확인|심사|서류|조건|증빙)\s?없이|바로 연장|당연히|그냥 연장)/;
/** 불허에서 '가능'을 말해도 되는 경우: 예외 사유를 조건으로 거는 구절 */
const EXCEPTION_CLAUSE = /예외(\s?사유)?(에|가)\s?해당(하시|되시|하)?면|예외가 인정되면|예외 사유가 확인되면/;
/** 근거와 반대로 말하는 대조 구문(…이 아니라 …) */
const CONTRAST = /(이|가)?\s?아니라|아닌\s|말고|대신(에)?\s/;

/**
 * 규제 이름 속 숫자(8.13 대책·4.1 방안 등)는 날짜·수치가 아니라 이름이다 → 숫자 검사에서 뺀다.
 * 뒤에 대책·제한·방안·행정지도 같은 말이 붙은 경우만(날짜로 쓴 '4.1까지'는 그대로 검사).
 */
const REG_NAME = /(?<![\d.])(8\.13|4\.1|8\.28|9\.7|10\.15|10\.20|6\.27)(?=\s*(대책|방안|제한|규제|행정지도|비거주|다주택|만기연장|가계부채|금융|고시|발표))/g;
export const stripRegNames = (t: string) => t.replace(/[‘’`´]/g, "'").replace(REG_NAME, "규제명");

/** 인용 Fact 전체 또는 그 항목(➊~➑·①~⑨·'/'·';'로 나뉜 부분, 이웃 두 항목 묶음)과의 최대 유사도 */
export function factSimilarity(text: string, fact: string): number {
  const parts = fact.split(/(?=[➊➋➌➍➎➏➐➑①②③④⑤⑥⑦⑧⑨])|\s\/\s|;\s?/).map((x) => x.trim()).filter((x) => x.length >= 8);
  const windows = parts.length > 1 ? [...parts, ...parts.slice(1).map((p, i) => `${parts[i]} ${p}`)] : [];
  return Math.max(similarity(text, fact), ...windows.map((w) => similarity(text, w)));
}

export function checkSentence(
  s: DraftSentence,
  card: Pick<Verdict, "verdict" | "facts" | "headline" | "conditions" | "documents" | "questions" | "basis">,
  factText: (id: string) => string | undefined,
  customerFacts: string[] = [],
): CheckedSentence {
  const reasons: string[] = [];
  const cited = [...new Set(s.facts)];
  const allowed = new Set(card.facts);
  const text = s.text.trim();

  // 1. 카드가 쓴 근거만 인용
  const foreign = cited.filter((f) => !allowed.has(f));
  if (foreign.length) reasons.push(`카드에 없는 근거 인용(${foreign.join(",")})`);
  const texts = cited.map(factText).filter((t): t is string => !!t);
  // 확인된 기준(규제별)도 카드 항목이다(이름 '4.1 …'과 문장 모두)
  const cardItems = [card.headline, ...card.conditions, ...card.documents, ...card.questions, ...(card.basis ?? []).map((b) => `${b.label}: ${b.text}`)];

  // 2. 숫자·날짜: 인용 근거·카드에 있어야. 질문(고객 사실관계)에서는 날짜만 인정한다
  const src = [...texts, ...cardItems].flatMap(numTokens).concat(customerFacts.flatMap(numTokens).filter((t) => t.kind !== "num"));
  const bad = numTokens(stripRegNames(text)).filter((t) => !supported(t, src));
  if (bad.length) reasons.push(`출처에 없는 숫자(${bad.map(show).join(",")})`);

  // 3. 내용: 인용 Fact와 겹치면 그 근거로, 아니면 카드 항목을 옮긴 문장으로만 인정
  // 긴 Fact(예외 8가지 등)의 한 항목만 말하는 문장도 그 항목과 비교한다(인용 Fact 안에서만)
  const factScore = Math.max(0, ...texts.map((t) => factSimilarity(text, t)));
  const cardScore = Math.max(0, ...cardItems.map((t) => similarity(text, t)));
  const score = Math.max(factScore, cardScore);
  let source: CheckedSentence["source"] = "fact";
  if (score < MIN_SIMILARITY) reasons.push(`근거와 내용이 겹치지 않음(${score.toFixed(2)})`);
  else if (factScore < MIN_FACT_SIMILARITY || !cited.length) {
    // 인용 ID와 내용이 따로 논다 → 카드 문장을 옮긴 것으로 볼 만큼 가까울 때만 '카드' 출처로 통과(ID는 표시하지 않음)
    if (cardScore >= 0.25) source = "card";
    else reasons.push(`인용 근거와 내용이 맞지 않음(${factScore.toFixed(2)})`);
  }

  // 4. 판정과 어긋나는 단정
  if (UNCERTAIN.has(card.verdict)) {
    const rest = HEDGES.reduce((acc, re) => acc.replace(re, " "), text);
    if (POSITIVE.test(rest)) reasons.push(`'${card.verdict}' 판정에서 단정 표현`);
  }
  if (card.verdict === "조건부" && UNCONDITIONAL.test(text)) reasons.push("'조건부' 판정에서 조건을 지우는 표현");
  if (card.verdict === "불허" && !EXCEPTION_CLAUSE.test(text)) {
    // 유보 표현을 지우고, 부정·제한이 없는데 '된다·해 드린다'가 남으면 연장을 약속한 것
    const rest = HEDGES.reduce((acc, re) => acc.replace(re, " "), text);
    if (LOAN_PROMISE.test(rest) && !NEGATION.test(rest)) reasons.push("'불허' 판정에서 가능·약속 표현");
    else if (RECOGNITION.test(rest) && !NEGATION.test(rest)) reasons.push("'불허' 판정에서 인정·충족 표현");
  }
  // 결론 핵심어 뒤집기('종전 규정' 결론에 '신규 규정'을 단서 없이)
  for (const [keep, flip] of OPPOSITES) {
    if (card.headline.includes(keep) && !card.headline.includes(flip) && text.includes(flip) && !OPPOSITE_QUALIFIER.test(text)) {
      reasons.push(`결론과 반대 핵심어(${flip})`);
      break;
    }
  }
  // 카드 단서('단, 증액하면 …')의 조건어를 '…해도/하셔도'로 뒤집는 문장
  for (const m of text.matchAll(/([가-힣]{2,})(하셔도|해도|하더라도|하시더라도)/g)) {
    if (cardItems.some((c) => c.includes(`${m[1]}하면`) || c.includes(`${m[1]} 시`) || c.includes(`${m[1]}하지 않`))) {
      reasons.push(`카드 단서와 반대(${m[0]})`);
      break;
    }
  }
  // '…이 아니라 …' 대조는 근거·카드에 같은 대조가 있을 때만
  if (CONTRAST.test(text) && ![...texts, ...cardItems].some((t) => CONTRAST.test(t))) reasons.push("근거에 없는 대조(…이 아니라)");

  // 5. 규제 회피 안내 금지
  const avoid = findAvoidance(text);
  if (avoid.length) reasons.push(`규제 회피 표현(${avoid.join(",")})`);

  return { ...s, facts: source === "card" ? [] : cited, ok: reasons.length === 0, reasons, score: Math.round(score * 100) / 100, source };
}
