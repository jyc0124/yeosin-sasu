// 화면 표기: 판정 코드 색·설명, 추출 항목 이름. 판정 로직은 없다(lib/rules 담당).
import { CONCEPT_LABEL, REG_LABEL } from "@/lib/basis/vocab";
import type { VerdictCode } from "@/lib/rules/types";

export const VERDICT_STYLE: Record<VerdictCode, { label: string; fg: string; light: string; badge: string; solid: string; dot: string; tint: string; ring: string; action: string; meaning: string }> = {
  허용: { label: "가능", fg: "text-green-700", light: "bg-green-600", badge: "bg-green-50 text-green-800 ring-green-200", solid: "bg-green-700 text-white ring-green-700", dot: "bg-green-600", tint: "from-green-100/70", ring: "border-green-200", action: "서류 징구 후 진행", meaning: "규정상 가능" },
  조건부: { label: "조건 충족 시 가능", fg: "text-sky-700", light: "bg-sky-500", badge: "bg-sky-50 text-sky-700 ring-sky-200", solid: "bg-sky-700 text-white ring-sky-700", dot: "bg-sky-500", tint: "from-sky-100/70", ring: "border-sky-200", action: "아래 조건을 지키면 진행", meaning: "조건을 지키면 가능" },
  불허: { label: "불가", fg: "text-rose-600", light: "bg-rose-500", badge: "bg-rose-50 text-rose-700 ring-rose-200", solid: "bg-rose-600 text-white ring-rose-600", dot: "bg-rose-500", tint: "from-rose-100/70", ring: "border-rose-200", action: "고객 안내 · 다른 예외 재확인", meaning: "규정상 불가" },
  심사위: { label: "심사위 상정", fg: "text-violet-700", light: "bg-violet-600", badge: "bg-violet-700 text-white ring-violet-700", solid: "bg-violet-600 text-white ring-violet-600", dot: "bg-white/80", tint: "from-violet-100/70", ring: "border-violet-200", action: "여신심사위 상정 서류 준비", meaning: "지점이 확답할 수 없음" },
  내부지침: { label: "은행 지침 확인", fg: "text-zinc-700", light: "bg-zinc-500", badge: "bg-zinc-100 text-zinc-700 ring-zinc-300", solid: "bg-zinc-600 text-white ring-zinc-600", dot: "bg-zinc-500", tint: "from-zinc-100/70", ring: "border-zinc-300", action: "A은행 지침 조회", meaning: "은행 내부 기준으로 결정" },
  보류: { label: "본점 문의", fg: "text-amber-700", light: "bg-amber-500", badge: "bg-amber-50 text-amber-800 ring-amber-200", solid: "bg-amber-600 text-white ring-amber-600", dot: "bg-amber-500", tint: "from-amber-100/70", ring: "border-amber-200", action: "본점 질의 · 최신 정보 확인", meaning: "정부 발표 자료에 답이 없음" },
  안내: { label: "안내", fg: "text-indigo-700", light: "bg-indigo-500", badge: "bg-indigo-50 text-indigo-800 ring-indigo-200", solid: "bg-indigo-700 text-white ring-indigo-700", dot: "bg-indigo-500", tint: "from-indigo-100/70", ring: "border-indigo-200", action: "확인된 기준으로 고객 안내", meaning: "정부 발표 자료로 확인된 기준" },
  역질문: { label: "고객 확인 필요", fg: "text-orange-600", light: "bg-orange-500", badge: "bg-orange-50 text-orange-700 ring-orange-200", solid: "bg-orange-600 text-white ring-orange-600", dot: "bg-orange-500", tint: "from-orange-100/70", ring: "border-orange-200", action: "고객에게 질문하고 답으로 다시 판정", meaning: "확인할 사실이 남음" },
};

/** 화면에 보이는 판정 이름(코드는 그대로, 표기만 창구 말로). 시중은행 지점 직원 의견 반영 */
export const verdictLabel = (code: string) => (VERDICT_STYLE as Record<string, { label: string }>)[code]?.label ?? code;

export const KB_LABEL = {
  v1: "근거 자료 v1 · 보도자료·FAQ만",
  v2: "근거 자료 v2 · 8.28 행정지도·10.20 재지정 반영",
} as const;

export const MODULE_LABEL: Record<string, string> = {
  M1: "8.13 비거주 1주택자 전세대출 제한",
  M2: "4.1 다주택자 주담대 만기연장 제한",
  M0: "정책 정보 질문",
  Q: "기준 질문 · 근거 조회",
  OUT: "범위 밖",
};

/** 추출 항목 → 창구 표기. 값 변환도 함께 */
const yes = (v: unknown) => (v === true ? "예" : v === false ? "아니오" : String(v));
const ENUMS: Record<string, Record<string, string>> = {
  action: { new: "신규", renewal: "만기연장" },
  borrowerType: { individual: "개인", individual_landlord: "개인 임대사업자", corporate_landlord: "법인 임대사업자" },
  loanPurpose: { general: "일반", living: "생활안정자금", interim: "중도금", relocation: "이주비", commercial: "상가 등 임대사업용" },
  livedEvidence: { resident_register: "주민등록 거주 이력", move_in_only: "전입신고만", move_in_record_only: "전입 기록만", unverified_docs: "기준 없는 서류만" },
  lenderSector: { bank: "은행권", nonbank: "비은행권" },
  notifiedProof: { record: "상담 기록·문자 이력 있음", none: "기록 없음" },
  exceptionsNone: { true: "없음(확인함)" },
  landlordMainBusiness: { rental: "주택임대업", other: "그 외" },
  topic: {
    guarantee_ratio: "전세대출 보증비율",
    exception_scope: "주택 수 예외의 적용 범위",
    first_home_inherited_share: "생애최초와 상속 지분",
    dsr_parental_leave: "육아휴직과 DSR",
    rw_rate_impact: "위험가중치와 금리",
    youth_mortgage_rate: "청년 정책모기지 금리",
    move_in_only_residence: "전입만 한 경우 실거주",
    residence_proof_record: "실거주 증빙",
    provisional_sale_contract: "가계약과 매도계약 예외",
    regulated_area_change: "규제지역 변경",
    loan_cap_ltv_dsr: "LTV·DSR·한도",
    other_bank_precedent: "다른 은행 사례",
    title_split_avoidance: "명의 분산",
    increase_definition: "증액 연장의 뜻",
    jeonse_basis_date: "규정 적용 기준일",
    renewal_vs_refinance: "연장·증액·대환 구분",
    house_count_scope: "주택 수 합산 범위",
    household_scope_consent: "세대 범위와 조회 동의",
    early_renewal_procedure: "만기 전 연장 처리",
  },
  renewal: { none: "갱신 없음", implicit: "묵시적 갱신", claim: "갱신청구권", agreed: "합의 재계약" },
  exception: {
    legal_obligation: "① 법적 의무로 실거주 예정",
    succession: "② 임대차 승계 조건부 취득",
    deposit_unreturned: "③ 보증금 미반환",
    short_extension: "④ 퇴거 일정 조정(단기)",
    other_inevitable: "⑤ 그 밖의 불가피한 비거주",
    none: "없음",
  },
};
const TAGS: Record<string, string> = {
  saleContracted: "매도계약 체결",
  saleProvisional: "가계약만",
  daycare: "어린이집",
  unsoldNew: "준공 후 미분양",
  privateRental: "민간건설임대",
  inheritance: "상속",
  auction: "채권보전 경매",
  heritage: "문화재",
  similar: "그 밖에 준하는 경우",
  guarantorExcluded: "보증기관 제외",
  gift: "증여",
};
export const FIELD_LABEL: Record<string, string> = {
  action: "대출 구분",
  increase: "대출금액 증액",
  depositIncrease: "임차보증금 증액",
  loanAmount: "현재 대출금액",
  newLoanAmount: "늘린 뒤 대출금액",
  rentalRegion: "전셋집 소재지",
  rentalRegulated: "전셋집 규제지역",
  sameHome: "같은 전셋집 계속 거주",
  firstLeaseBy0907: "최초 임대차 '25.9.7까지",
  refinance: "대환(갈아타기)",
  otherHouseholdHouses: "부모 등 가족 명의 주택",
  maturityDate: "대출 만기",
  plannedRenewalDate: "미리 연장하려는 날",
  applicationDate: "신청(예정)일",
  contractAndDepositBy1231: "12.31까지 계약·계약금",
  bankIntakeBy1231: "12.31까지 전산 접수",
  houseCount: "주택 수",
  houseCountIsMinimum: "주택 수는 최소치('다주택')",
  leasedOut: "보유 주택 임대 중",
  tenantIsFamily: "임차인이 가족",
  everLived: "본인·배우자 실거주 이력",
  livedEvidence: "실거주 증빙",
  exception: "예외 사유",
  targetAsserted: "비거주 1주택자 전제",
  borrowerType: "차주 유형",
  conditionalDisposal: "처분조건부",
  loanPurpose: "대출 용도",
  legalObligationEnd: "법적 의무 종료일",
  notifiedBy0401: "4.1 이전 연장 통보",
  publicInterest: "공익 법인",
  otherException: "그 밖의 예외",
  homsAvailable: "HOMS 조회 가능",
  landlordMainBusiness: "주된 영업",
  topic: "주제",
  region: "지역",
  dsrRatio: "차주단위 DSR",
  lenderSector: "금융업권",
  leaseDepositDate: "임대차계약·계약금 완료일",
  intakeDate: "전산 접수일",
  policyLoan: "정책 목적 전세대출",
  legalObligation: "법적 의무로 매도 불가",
  notifiedProof: "4.1 이전 통보 기록",
  exceptionsNone: "4.1 예외 사유",
  asksNextMaturity: "다음 만기를 물음",
  consentRefused: "주택보유 확인 동의 거부",
  subQuestions: "하위 질문",
  regs: "관련 규제",
  concepts: "묻는 개념",
};
const OWNER: Record<string, string> = { self: "본인 명의", spouse: "배우자 명의", joint: "부부 공동명의", household: "같은 세대 가족 명의", separated: "세대 분리 가족 명의", other: "그 밖의 사람 명의" };
/** 판정에는 쓰지만 창구 화면 조건 목록에는 보이지 않는 내부 항목 */
const HIDDEN = new Set(["unmodeledInfo", "approxDates", "avoidanceAsked", "basis", "asksCriteria"]);
const HOUSE_FIELDS: Record<string, string> = {
  region: "",
  sigungu: "",
  isApt: "",
  regulated: "규제지역",
  baseValueAtAcq: "취득 시 기준시가",
};

function houseText(h: Record<string, unknown>): string {
  const place = [h.region, h.sigungu].filter(Boolean).join(" ");
  const kind = h.isApt === true ? "아파트" : h.isApt === false ? "아파트 아님" : "";
  const owner = OWNER[h.owner as string];
  const type = h.kind === "officetel" ? "주거용 오피스텔" : h.kind === "mixed_use" ? "상가주택" : "";
  const parts = [owner, h.label as string | undefined, place, kind, type].filter(Boolean);
  if (h.regulated !== undefined) parts.push(`${HOUSE_FIELDS.regulated} ${yes(h.regulated)}`);
  if (typeof h.baseValueAtAcq === "number") parts.push(`기준시가 ${(h.baseValueAtAcq / 1e8).toLocaleString("ko-KR")}억`);
  if (Array.isArray(h.tags) && h.tags.length) parts.push(h.tags.map((t) => TAGS[t] ?? t).join("·"));
  if (h.claimsDepopulation) parts.push("인구감소지역 주장");
  return parts.join(" · ") || "정보 없음";
}

const fmtDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v.slice(2, 4)}.${Number(v.slice(5, 7))}.${Number(v.slice(8))}` : undefined);

/** 추출된 Case → [항목, 값] 목록 (화면 '추출한 조건') */
export function caseRows(c: Record<string, unknown> | undefined): [string, string][] {
  if (!c) return [];
  const rows: [string, string][] = [];
  for (const [k, v] of Object.entries(c)) {
    if (k === "module" || k === "asOf" || k === "kb" || v === undefined) continue;
    if (k === "houses" && Array.isArray(v)) {
      v.forEach((h, i) => rows.push([`보유 주택 ${i + 1}`, houseText(h)]));
    } else if ((k === "regs" || k === "concepts") && Array.isArray(v)) {
      const L = k === "regs" ? REG_LABEL : CONCEPT_LABEL;
      rows.push([FIELD_LABEL[k], v.map((x) => L[x as string] ?? String(x)).join(", ")]);
    } else if (k === "subQuestions" && Array.isArray(v)) {
      v.forEach((q, i) => rows.push([`${FIELD_LABEL.subQuestions} ${i + 1}`, String(q)]));
    } else if (k === "collateral") {
      rows.push(["담보 주택", houseText(v as Record<string, unknown>)]);
    } else if (k === "tenant") {
      const t = v as Record<string, unknown>;
      const p: string[] = [];
      if (t.provisional) p.push("가계약");
      if (t.contractValidAt0401 === false) p.push("4.1 기준 유효 계약 아님");
      if (t.originalEnd) p.push(`종료 ${fmtDate(t.originalEnd)}`);
      if (t.renewal) p.push(ENUMS.renewal[t.renewal as string] ?? String(t.renewal));
      if (t.renewalDate) p.push(`갱신일 ${fmtDate(t.renewalDate)}`);
      if (t.renewedEnd) p.push(`갱신 후 종료 ${fmtDate(t.renewedEnd)}`);
      rows.push(["임차인", p.join(" · ") || "있음(계약 정보 없음)"]);
    } else if (k === "registeredRental") {
      const r = v as Record<string, unknown>;
      const p: string[] = [];
      if (r.mandatoryEnd) p.push(`의무기간 종료 ${fmtDate(r.mandatoryEnd)}`);
      if (r.voluntaryCancel) p.push("자진말소 예정");
      if (r.voluntaryCancelDate) p.push(`말소일 ${fmtDate(r.voluntaryCancelDate)}`);
      rows.push(["등록임대", p.join(" · ") || "등록임대사업자"]);
    } else if (k === "countClaims" && Array.isArray(v)) {
      // 범위를 붙여 말한 주택 수(예: 부부합산 1주택, 세대 2주택)
      for (const x of v as { scope?: string; count?: number; atLeast?: boolean }[]) {
        const scope = x.scope === "couple" ? "부부합산" : x.scope === "household" ? "세대 기준" : "범위 미상";
        rows.push([`주택 수(${scope})`, typeof x.count === "number" ? `${x.count}채${x.atLeast ? " 이상" : ""}` : "확인 필요"]);
      }
    } else if (k === "unmodeled" && Array.isArray(v)) {
      if (v.length) rows.push(["판정 항목 밖 사실", v.map(String).join(", ")]);
    } else {
      // 화면에 이름이 정해진 항목만 보여 준다(내부 필드명·객체 문자열을 그대로 내보내지 않는다)
      const label = FIELD_LABEL[k];
      if (!label || HIDDEN.has(k)) continue;
      const money = (k === "loanAmount" || k === "newLoanAmount") && typeof v === "number" ? `${(v / 1e8).toLocaleString("ko-KR")}억원` : undefined;
      const val =
        money ??
        ENUMS[k]?.[v as string] ??
        fmtDate(v) ??
        (typeof v === "boolean" ? yes(v) : k === "otherHouseholdHouses" ? `${v}채` : k === "dsrRatio" ? `${v}%` : typeof v === "object" ? undefined : String(v));
      if (val !== undefined) rows.push([label, val]);
    }
  }
  return rows;
}

/** 스트리밍 중인 추출 결과(원형) → 화면 '읽는 중' 조건 목록. 판정과 무관한 표시용. 빈 값·언급 없음은 뺀다 */
export function partialRows(raw: unknown): [string, string][] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Record<string, unknown>;
  const rows: [string, string][] = [];
  const m = r.module;
  if (m === "M1" || m === "M2") rows.push(["주제", MODULE_LABEL[m]]);
  const sub = m === "M1" ? r.m1 : m === "M2" ? r.m2 : undefined;
  if (!sub || typeof sub !== "object") return rows;
  const clean = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(clean).filter((v) => v !== undefined);
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      if (o.mentioned === false) return undefined;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(o)) {
        if (k === "mentioned") continue;
        const c = clean(v);
        if (c === undefined || c === null || (Array.isArray(c) && !c.length)) continue;
        if (typeof c === "object" && !Array.isArray(c) && !Object.keys(c as object).length) continue;
        out[k] = c;
      }
      return out;
    }
    return x === null ? undefined : x;
  };
  const c = clean(sub) as Record<string, unknown>;
  const known: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c ?? {})) if (k in FIELD_LABEL || ["houses", "tenant", "collateral", "registeredRental"].includes(k)) known[k] = v;
  return [...rows, ...caseRows(known)];
}
