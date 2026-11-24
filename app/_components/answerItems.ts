// 고객 확인 질문 → 항목별 답변 칸(선택지·입력 형식). 판정 로직은 없다: 고른 답은 '고객에게 확인한 답' 문장으로 바뀌어
// 같은 고객 건의 추가 확인 내용으로 다시 판정된다(조건 추출 → 규칙 엔진). 현장 피드백(11/22) UI 상세 수정안 §4.
//
// 질문 문장(규칙 엔진이 만든 376종 이상)마다 선택지를 따로 정하지 않고, 문장 구조에서 뽑는다:
//  ①~⑤ 목록 / 'A인지, B인지' 나열 → 여러 개 고르기 + 해당 없음, '몇 채' → 주택 수, 날짜 → 날짜 입력,
//  '…인가요?·있나요?' 한 가지 사실 → 예/아니오. 그 밖은 짧은 글 입력. 모든 항목에 '미확인'이 있다.

export type ItemKind = "multi" | "single" | "date" | "text";
export interface AnswerItem {
  /** 답을 저장하는 열쇠(같은 카드 안에서 유일). 한 질문에 칸이 하나면 질문 문장 그대로 */
  q: string;
  /** 한 질문에 칸이 여러 개일 때 칸 이름(예: '통보한 연장 기한'). 보낼 문장에서도 이 이름을 쓴다 */
  label?: string;
  kind: ItemKind;
  options: string[];
  /** 고르면 다른 선택을 지우는 선택지(해당 없음) */
  none?: string;
  placeholder?: string;
}
export type AnswerState = { picks: string[]; text: string; unknown: boolean };
export const EMPTY: AnswerState = { picks: [], text: "", unknown: false };

/** 본점·기관이 확인할 항목(고객에게 묻는 질문이 아님) */
export const isHqItem = (q: string) => /본점 확인\s*$|본점에 확인|기관에 확인/.test(q);

const strip = (q: string) => q.replace(/^\(참고\)\s*/, "");

export function itemFor(q0: string): AnswerItem {
  const q = strip(q0);
  // ①②③ 목록
  const circled = [...q.matchAll(/[①②③④⑤⑥⑦⑧]\s*([^①②③④⑤⑥⑦⑧]+)/g)].map((m) => m[1].trim().replace(/[,·]$/, "").replace(/\s*\(.*$/, ""));
  if (circled.length >= 2) return { q: q0, kind: "multi", options: circled, none: "해당 없음" };
  // 'X: a인지, b인지, c인지' 나열(콜론 뒤)
  const colon = q.match(/^[^:]{2,30}:\s*(.+)$/);
  if (colon) {
    const parts = colon[1]
      .split(/,\s*/)
      .map((s) =>
        s
          .trim()
          .replace(/\s*\([^)]*\)\s*$/, "") // 끝의 보충 설명(계약 기간)은 입력칸으로
          .replace(/[이가] 있는지$/, " 있음")
          .replace(/받았는지$/, "받음")
          .replace(/했는지$/, "함")
          .replace(/인지$/, "")
          .replace(/\s*여부$/, ""),
      )
      .filter((s) => s.length > 1);
    if (parts.length >= 2 && /인지|있는지|받았는지|했는지/.test(colon[1])) return { q: q0, kind: "multi", options: parts, none: "해당 없음", placeholder: "기간·날짜 등 덧붙일 내용(선택)" };
  }
  // 'A인가요, B인가요, C인가요?' 중 하나 고르기
  const alts = q.split(/인가요[,?]\s*/).map((s) => s.trim()).filter(Boolean);
  if (alts.length >= 3 && q.trim().endsWith("인가요?")) {
    const opts = alts.map((s) => s.replace(/^.*?(세입자가|임차인이)\s*/, "").replace(/(한 것|것)$/, "").trim());
    return { q: q0, kind: "single", options: opts };
  }
  if (/연장하는 건인가요, 새로 받는/.test(q)) return { q: q0, kind: "single", options: ["지금 대출 연장", "새로 받는 대출(신규)"] };
  if (/계속 사는 갱신인가요, 이사하나요/.test(q)) return { q: q0, kind: "single", options: ["같은 집에서 갱신", "이사"], placeholder: "전셋집 소재지(예: 서울 마포구)" };
  // 임대 여부 + 임차인이 가족인지(두 질문이 붙은 문장)
  if (/임대/.test(q) && /가족/.test(q) && (q.match(/\?/g) ?? []).length >= 2 && !/소재지/.test(q))
    return { q: q0, kind: "single", options: ["임대하지 않음", "임대 중 · 임차인이 가족(부모·자녀)", "임대 중 · 임차인이 가족 아님"] };
  // 주택 수
  if (/몇 채|보유 주택 수/.test(q)) return { q: q0, kind: "single", options: ["무주택", "1채", "2채", "3채 이상"], placeholder: "각 주택 설명이 필요하면 적어 주세요" };
  // 소재지·유형
  if (/소재지/.test(q) && /아파트/.test(q)) return { q: q0, kind: "single", options: ["아파트", "아파트 아님"], placeholder: "소재지(예: 서울 송파구, 부산 금정구)" };
  // 규제지역 지정 여부(소재지를 묻는 말이 섞여 있어도 예/아니오)
  if (/규제지역.*지정돼 있나요|규제지역으로 지정/.test(q)) return { q: q0, kind: "single", options: ["규제지역으로 지정됨", "지정 안 됨"], placeholder: "소재지(선택, 예: 서울 마포구)" };
  // 시도를 묻는 소재지: 수도권 세 곳 + 그 밖
  if (/소재지\(시도\)/.test(q)) return { q: q0, kind: "single", options: ["서울", "경기", "인천", "그 밖의 지역"], placeholder: "시군구(선택, 예: 마포구 · 그 밖이면 시도도)" };
  if (/소재지/.test(q)) return { q: q0, kind: "text", options: [], placeholder: "소재지(예: 서울 마포구, 경기 성남시)" };
  // 기준시가 4억 원 이하인지
  if (/기준시가가 4억 원.*이하인가요/.test(q)) return { q: q0, kind: "single", options: ["4억 원 이하", "4억 원 초과"] };
  // '종류(a·b·c)' → 그중 하나
  const kinds = q.match(/^(.{2,12}종류)\(([^)]+)\)\s*$/);
  if (kinds) return { q: q0, kind: "single", options: kinds[2].split("·").map((x) => x.trim()), placeholder: "그 밖이면 적어 주세요(선택)" };
  // 날짜(한 가지만 묻는 경우 — 보충 설명 괄호는 빼고 본다)
  const base = q.replace(/\([^)]*\)/g, "");
  if (/(언제|만기일|종료일|며칠)/.test(base) && !/각각|금액|,/.test(base)) return { q: q0, kind: "date", options: [], placeholder: "예: 2027.3.31" };
  // 한 가지 사실을 묻는 예/아니오
  // (언제·몇·어디·얼마·각각을 묻는 문장은 예/아니오가 아니다)
  // 대출금액 증액: 예/아니오로 종전·변경 규정이 갈리고, 늘린다면 금액은 한도 2억원 판단에 쓰인다(선택 입력)
  if (/대출\s?금액을 늘리나요|대출금?(액)?을? 증액하나요/.test(q))
    return { q: q0, kind: "single", options: ["늘림(증액)", "그대로(증액 없음)"], placeholder: "늘린다면 금액(선택, 예: 2억 → 2.3억)" };
  // '…나요?·…가요?·…까요?'로 끝나는 질문 하나(뒤에 붙은 보충 괄호는 빼고 본다. 예: "늘리나요? (대출금액 기준)")
  if (/(나요|가요|까요|니까)\?/.test(base) && (q.match(/\?/g) ?? []).length === 1 && !/언제|몇|어디|얼마|무엇|각각|어떤|어느|누구|어떻게|왜/.test(base)) {
    if (/실거주/.test(q)) return { q: q0, kind: "single", options: ["산 적 있음", "산 적 없음"] };
    if (/직계존비속|가족/.test(q)) return { q: q0, kind: "single", options: ["가족(부모·자녀)", "가족 아님"] };
    if (/담보 주택인가요/.test(q)) return { q: q0, kind: "single", options: ["이 대출의 담보 주택", "다른 집"] };
    return { q: q0, kind: "single", options: ["예", "아니오"] };
  }
  return { q: q0, kind: "text", options: [], placeholder: "고객 답을 짧게 적어 주세요" };
}

/** 항목 상태 → 답 문장(빈 항목은 null) */
/** 목록 선택지를 '아니다'로: '임차인 있음' → '임차인 없음', '통보받음' → '통보받지 않음', 그 밖은 '… 아님' */
export function negate(o: string): string {
  if (/있음$/.test(o)) return o.replace(/있음$/, "없음");
  if (/받음$/.test(o)) return o.replace(/받음$/, "받지 않음");
  if (/함$/.test(o)) return o.replace(/함$/, "하지 않음");
  return `${o} 아님`;
}

export function answerLine(item: AnswerItem, s: AnswerState, context?: string): string | null {
  // 목록형 질문(①~⑤, 'X: a인지, b인지')은 앞 제목만 남긴다(고른 답에 항목 이름이 들어 있다)
  // 한 질문을 여러 칸으로 나눴으면 칸 이름 앞에 질문 제목을 붙여 무엇에 대한 답인지 함께 보낸다(예: '보유 주택의 소재지·유형과 임대 여부: 소재지 → 서울 송파구')
  const ctx = context && item.label && !/[가나까]요$/.test(item.label) ? `${strip(context).replace(/\?$/, "")}: ` : "";
  const full = item.label ? ctx + item.label : strip(item.q).replace(/\s*\([^)]*\)\s*$/, "").trim();
  const q = item.kind === "multi" && full.includes(":") ? full.slice(0, full.indexOf(":")).trim() : full;
  if (s.unknown) return `${q} → 고객도 모름(미확인)`;
  // 목록형은 고른 것과 고르지 않은 것을 모두 적는다('해당 없음'만 보내면 무엇이 없는지 추출이 알 수 없다)
  if (item.kind === "multi" && s.picks.length) {
    const yes = s.picks.filter((p) => p !== item.none);
    const no = item.options.filter((o) => !yes.includes(o)).map(negate);
    if (!yes.length) return `${q} → 예외 사유 없음(${no.join(", ")})${s.text.trim() ? ` / ${s.text.trim()}` : ""}`.replace(/^(.*?예외 사유) → 예외 사유 없음/, "$1 → 없음");
    const parts = [`해당: ${yes.join(", ")}`, no.length ? `그 밖에는 ${no.join(", ")}` : "", s.text.trim()].filter(Boolean);
    return `${q} → ${parts.join(" / ")}`;
  }
  const v = [...s.picks, s.text.trim()].filter(Boolean).join(", ");
  return v ? `${q} → ${v}` : null;
}

export const status = (s: AnswerState | undefined): "empty" | "unknown" | "done" =>
  !s ? "empty" : s.unknown ? "unknown" : s.picks.length || s.text.trim() ? "done" : "empty";

/** 날짜 형식 검사(정책 판단과 무관한 형식만): 2027.3.31 · 2027-03-31 · 27.3.31 */
export function dateError(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(/^(\d{2}|\d{4})[.\-/\s]\s?(\d{1,2})[.\-/\s]\s?(\d{1,2})\.?$/);
  if (!m) return "날짜를 2027.3.31 형식으로 입력해 주세요";
  const y = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
  const d = new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return "실제 있는 날짜를 입력해 주세요";
  return null;
}

/** 여러 답을 한 번에 보낼 문장(같은 고객 건의 추가 확인 내용). 새 질문으로 읽히지 않게 머리말을 붙인다 */
export function composeAnswers(lines: string[]): string {
  return `고객에게 확인한 답(새 질문 아님, 다른 조건은 그대로):\n${lines.map((l, i) => `${i + 1}) ${l}`).join("\n")}`;
}

/** 조건 정정 문장 */
export function composeCorrection(changes: { k: string; from: string; to: string }[], added: string): string {
  const lines = changes.map((c) => `${c.k}: ${c.from} → ${c.to}`);
  if (added.trim()) lines.push(`추가 조건: ${added.trim()}`);
  return `조건 정정(새 질문 아님, 아래 항목만 바꾸고 다른 조건은 그대로):\n${lines.map((l) => `- ${l}`).join("\n")}`;
}

/** 한 질문(번호 하나) = 제목 + 보충 설명 + 칸 여러 개 */
export interface AnswerGroup {
  q: string;
  title: string;
  hint?: string;
  items: AnswerItem[];
}

/** 끝에 붙은 보충 괄호를 제목에서 떼어 설명으로 */
function splitHint(q: string): { title: string; hint?: string } {
  const m = q.match(/^(.*?[?)가-힣])\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/);
  if (m && m[1].trim().length >= 6 && !/^[①-⑧]/.test(m[2])) return { title: m[1].trim(), hint: m[2].trim() };
  return { title: q };
}

const sub = (q0: string, label: string, it: Omit<AnswerItem, "q" | "label">): AnswerItem => ({ q: `${q0} ▸ ${label}`, label, ...it });
const DATE = { kind: "date" as const, options: [], placeholder: "예: 2027.3.31" };

/**
 * 질문 하나를 화면의 한 묶음으로: 두세 가지를 한 번에 묻는 문장은 칸을 나눈다.
 * (판정 로직 없음. 나눈 칸의 답은 '칸 이름 → 답'으로 보내 조건 추출이 다시 읽는다)
 */
export function groupFor(q0: string): AnswerGroup {
  const q = strip(q0);
  const ref = q0 !== q ? "(참고) " : "";
  // 목록형: 제목은 콜론 앞
  const one = itemFor(q0);
  if (one.kind === "multi") {
    const head = q.includes(":") ? q.slice(0, q.indexOf(":")).trim() : splitHint(q).title;
    // ①~⑤ 선택지에서 뗀 괄호 설명(예: '토허구역 매수 등', '여신심사위원회 인정 필요')은 버리지 않고 설명 줄로
    const notes = [...q.matchAll(/([①②③④⑤⑥⑦⑧])\s*[^①②③④⑤⑥⑦⑧(]+\(([^)]+)\)/g)].map((m) => `${one.options["①②③④⑤⑥⑦⑧".indexOf(m[1])] ?? m[1]}: ${m[2]}`);
    return { q: q0, title: ref + head, hint: notes.length ? notes.join(" · ") : undefined, items: [one] };
  }
  // 'A과 B은 각각 언제인가요?' → 날짜 두 칸
  const both = q.match(/^(.+?)[과와]\s(.+?)[은는] 각각 언제/);
  if (both) return { q: q0, title: ref + q.replace(/\s*\([^)]*\)\s*$/, ""), items: [sub(q0, both[1].trim(), DATE), sub(q0, both[2].trim(), DATE)] };
  // '전세대출 만기일, 현재 대출금액과 늘리려는 금액'
  if (/만기일, 현재 대출금액과 늘리려는 금액/.test(q))
    return {
      q: q0,
      title: ref + q,
      items: [sub(q0, "전세대출 만기일", DATE), sub(q0, "현재 대출금액", { kind: "text", options: [], placeholder: "예: 2억" }), sub(q0, "늘리려는 금액", { kind: "text", options: [], placeholder: "예: 2.3억 · 그대로면 '그대로'" })],
    };
  // '세대 기준 주택 수와 각 주택의 취득 경위'
  if (/주택 수와 각 주택의 취득 경위/.test(q))
    return {
      q: q0,
      title: ref + q.replace(/\s*\([^)]*\)\s*$/, ""),
      items: [sub(q0, "세대 기준 주택 수", { kind: "single", options: ["무주택", "1채", "2채", "3채 이상"] }), sub(q0, "각 주택의 취득 경위", { kind: "text", options: [], placeholder: "예: 1채는 상속, 1채는 매수" })],
    };
  // 소재지·유형(아파트)과 임대 여부(임차인이 가족)
  if (/소재지/.test(q) && /아파트/.test(q) && /임대/.test(q))
    return {
      q: q0,
      title: ref + "보유 주택의 소재지·유형과 임대 여부",
      items: [
        sub(q0, "소재지", { kind: "text", options: [], placeholder: "예: 서울 송파구" }),
        sub(q0, "유형", { kind: "single", options: ["아파트", "아파트 아님"] }),
        sub(q0, "임대 여부", { kind: "single", options: ["임대하지 않음", "임대 중 · 임차인이 가족(부모·자녀)", "임대 중 · 임차인이 가족 아님"] }),
      ],
    };
  // 소재지와 아파트 여부 → 두 칸
  if (/소재지/.test(q) && /아파트/.test(q)) {
    const { title, hint } = splitHint(q);
    return { q: q0, title: ref + title, hint, items: [sub(q0, "아파트 여부", { kind: "single", options: ["아파트", "아파트 아님"] }), sub(q0, "소재지", { kind: "text", options: [], placeholder: "예: 서울 송파구, 부산 금정구" })] };
  }
  // 물음표가 둘 이상인 질문(이미 한 칸으로 정한 것 제외) → 문장마다 칸
  // 괄호로만 된 조각('… 인가요? (그렇지 않으면 대상 아님)')은 앞 질문의 설명이지 따로 물을 칸이 아니다
  const sentences = q.split(/(?<=\?)\s+(?!\()/).filter(Boolean);
  if (sentences.length >= 2 && one.kind === "text") {
    return { q: q0, title: ref + q, items: sentences.map((x) => ({ ...itemFor(x), q: `${q0} ▸ ${x}`, label: x.replace(/\?$/, "") })) };
  }
  const { title, hint } = splitHint(q);
  // 날짜를 묻는데 설명에서 다른 내용도 알려 달라고 하면(갱신 방식 등) 덧붙일 칸을 함께
  if (one.kind === "date" && hint && /알려|방식/.test(hint))
    return { q: q0, title: ref + title, hint, items: [{ ...one, q: `${q0} ▸ 날짜`, label: title.replace(/\?$/, "") }, sub(q0, "덧붙일 내용", { kind: "text", options: [], placeholder: "예: 합의 재계약, 2028.5.31 종료" })] };
  return { q: q0, title: ref + title, hint, items: [one] };
}
