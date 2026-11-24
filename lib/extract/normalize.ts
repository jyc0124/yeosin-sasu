// Router 추출 결과(null = 모름) → 규칙 엔진 Case(undefined = 모름).
// 코드가 하는 일: null 제거, 날짜·숫자 검증, 시도·시군구 표기 정규화. 값을 새로 지어내지 않는다.
import regions from "@/data/kb/regions.json";
import kbFacts from "@/data/kb/facts.json";
import type { Case, CountClaim, House, HouseTag, M0Topic, M1Case, M2Case } from "@/lib/rules";
import { M0_TOPICS } from "@/lib/rules";
import { AREA, SIDO, type RawExtraction, type RawHouse } from "./schema";
import { CONCEPTS, REGS } from "@/lib/basis/vocab";
import type { BasisQuery } from "@/lib/basis";

function toBasis(b: RawExtraction["basis"]): BasisQuery | undefined {
  if (!b) return undefined;
  const regs = [...new Set((b.regs ?? []).filter((r) => REGS.includes(r)))];
  const concepts = [...new Set((b.concepts ?? []).filter((c) => CONCEPTS.includes(c)))];
  const subQuestions = (b.subQuestions ?? []).filter((q) => typeof q === "string" && q.trim()).map((q) => q.trim()).slice(0, 5);
  if (!regs.length && !concepts.length) return undefined;
  return { subQuestions, regs, concepts };
}

export interface Normalized {
  module: "M1" | "M2" | "M0" | "Q" | "OUT";
  /** 기준 질문(Q) 또는 범위 안 요소가 섞인 OUT: 하위 질문과 규제·개념 태그 */
  basis?: BasisQuery;
  /** M1/M2 사례인데 묻는 것은 기준 자체(basis로 기준 답변을 주 카드로) */
  asksCriteria?: boolean;
  case?: Case;
  /** 같은 고객 건의 다른 규제 판단(M1+M2 함께) */
  also?: M1Case | M2Case;
  /** 범위 밖(OUT) 질문 중 범위 안에서 답할 수 있는 부분(M0 주제) */
  related?: M0Topic[];
  assumptions: string[];
  warnings: string[];
}

type RegionMap = Record<string, string[]>;
const R = regions as unknown as { border: RegionMap; editions: Record<string, { depopulation: RegionMap; interest: RegionMap }> };

/** 시도별 알려진 시군구 이름(지역표 전체 판본 + 접경지역). 접미사 없는 입력 보정용. */
const KNOWN: Record<string, Set<string>> = (() => {
  const m: Record<string, Set<string>> = {};
  const add = (map: RegionMap) => {
    for (const [sido, list] of Object.entries(map)) for (const s of list) (m[sido] ??= new Set()).add(s);
  };
  add(R.border);
  for (const e of Object.values(R.editions)) {
    add(e.depopulation);
    add(e.interest);
  }
  return m;
})();

const SIDO_ALIASES: Record<string, string> = {
  서울특별시: "서울", 서울시: "서울", 부산광역시: "부산", 부산시: "부산", 대구광역시: "대구", 대구시: "대구",
  인천광역시: "인천", 인천시: "인천", 광주광역시: "광주", 대전광역시: "대전", 대전시: "대전", 울산광역시: "울산",
  세종특별자치시: "세종", 세종시: "세종", 경기도: "경기", 강원도: "강원", 강원특별자치도: "강원",
  충청북도: "충북", 충청남도: "충남", 전라북도: "전북", 전북특별자치도: "전북", 전라남도: "전남",
  경상북도: "경북", 경상남도: "경남", 제주도: "제주", 제주특별자치도: "제주",
};

export function normRegion(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if ((SIDO as readonly string[]).includes(s) || (AREA as readonly string[]).includes(s)) return s;
  return SIDO_ALIASES[s];
}

const CAPITAL_SIDO = ["서울", "인천", "경기"];
/** '수도권'·'비수도권'인데 시군구가 있으면 그 시군구가 있는 시도로 좁힌다(하나로 정해질 때만) */
export function refineArea(region: string | undefined, sigungu: string | undefined): string | undefined {
  if (!sigungu || (region !== "수도권" && region !== "비수도권")) return region;
  const pool = Object.keys(KNOWN).filter((sd) => (region === "수도권") === CAPITAL_SIDO.includes(sd) && KNOWN[sd].has(sigungu));
  return pool.length === 1 ? pool[0] : region;
}

export function normSigungu(region: string | undefined, v: unknown): string | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  let s = v.trim().replace(/\s+/g, " ");
  // "강원 평창군" → "평창군"
  const parts = s.split(" ");
  if (parts.length > 1 && (normRegion(parts[0]) || parts[0] === region)) s = parts.slice(1).join(" ");
  if (/[시군구]$/.test(s)) return s;
  const known = region ? KNOWN[region] : undefined;
  if (known) {
    const hit = ["군", "시", "구"].map((suf) => `${s}${suf}`).find((n) => known.has(n));
    if (hit) return hit;
  }
  return s;
}

export const isDate = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

const HOUSE_TAGS = new Set<HouseTag>([
  "saleContracted", "saleProvisional", "landPermitPending", "daycare", "unsoldNew", "privateRental",
  "inheritance", "auction", "heritage", "similar", "guarantorExcluded", "gift",
]);

/** null·undefined·빈 배열·빈 객체 키 제거 */
function prune<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

class Ctx {
  warnings: string[] = [];
  date(field: string, v: unknown): string | undefined {
    if (v === null || v === undefined) return undefined;
    if (isDate(v)) return v;
    this.warnings.push(`${field}: 날짜 형식 오류(${String(v)}) → 모름으로 처리`);
    return undefined;
  }
  bool(v: unknown): boolean | undefined {
    return typeof v === "boolean" ? v : undefined;
  }
  /** true만 의미 있는 필드: false는 '언급 없음'과 구분할 수 없어 모름으로 둔다(엔진은 undefined로 쟁점 유무를 본다) */
  flag(v: unknown): true | undefined {
    return v === true ? true : undefined;
  }
  int(field: string, v: unknown): number | undefined {
    if (v === null || v === undefined) return undefined;
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
    this.warnings.push(`${field}: 정수 아님(${String(v)}) → 모름으로 처리`);
    return undefined;
  }
  /** 원 단위 금액. 1,000만 원 미만은 단위 오류(예: '3억'을 3으로)로 보고 고치지 않고 모름 처리 */
  won(field: string, v: unknown): number | undefined {
    if (v === null || v === undefined) return undefined;
    if (typeof v === "number" && Number.isFinite(v) && v >= 1e7) return Math.round(v);
    this.warnings.push(`${field}: 금액 단위 의심(${String(v)}) → 모름으로 처리`);
    return undefined;
  }
  oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
    return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
  }
  house(h: Partial<RawHouse>): House | undefined {
    const area = normRegion(h.region);
    const region = refineArea(area, normSigungu(area, h.sigungu));
    const tags = (h.tags ?? []).filter((t): t is HouseTag => HOUSE_TAGS.has(t as HouseTag));
    const out = prune({
      label: typeof h.label === "string" && h.label.trim() ? h.label.trim() : undefined,
      region,
      sigungu: normSigungu(region, h.sigungu),
      isApt: this.bool(h.isApt),
      owner: this.oneOf(h.owner, ["self", "spouse", "joint", "household", "separated", "other"] as const),
      kind: this.oneOf(h.kind, ["officetel", "mixed_use"] as const),
      regulated: this.bool(h.regulated),
      baseValueAtAcq: this.won("baseValueAtAcq", h.baseValueAtAcq),
      tags,
      claimsDepopulation: this.flag(h.claimsDepopulation),
      isCollateral: this.flag(h.isCollateral),
    }) as House;
    // label만 있는 주택은 정보가 없으므로 버린다
    const informative = Object.keys(out).some((k) => k !== "label");
    return informative ? out : undefined;
  }
  houses(list: unknown): House[] | undefined {
    if (!Array.isArray(list)) return undefined;
    const hs = list.map((h) => this.house(h ?? {})).filter((h): h is House => !!h);
    if (hs.length < list.length) this.warnings.push(`정보 없는 주택 ${list.length - hs.length}건 제외(주택 수에는 반영 안 됨)`);
    return hs.length ? hs : undefined;
  }
}

/** 범위를 붙여 말한 주택 수(규제별 주택 수 계산에 씀). 범위가 같은 것이 여럿이면 첫 값 */
function countClaims(v: unknown): CountClaim[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: CountClaim[] = [];
  for (const x of v) {
    const sc = (x as { scope?: unknown })?.scope;
    const n = (x as { count?: unknown })?.count;
    const atLeast = (x as { atLeast?: unknown })?.atLeast === true;
    if ((sc === "couple" || sc === "household") && Number.isInteger(n) && (n as number) >= 0 && (n as number) < 50 && !out.some((o) => o.scope === sc))
      out.push(atLeast ? { scope: sc, count: Math.max(1, n as number), atLeast } : { scope: sc, count: n as number });
  }
  return out.length ? out : undefined;
}

function toM1(m: RawExtraction["m1"], x: Ctx): M1Case {
  return {
    module: "M1",
    ...prune({
      action: x.oneOf(m.action, ["new", "renewal"] as const),
      increase: x.bool(m.increase),
      maturityDate: x.date("maturityDate", m.maturityDate),
      plannedRenewalDate: x.date("plannedRenewalDate", m.plannedRenewalDate),
      applicationDate: x.date("applicationDate", m.applicationDate),
      contractAndDepositBy1231: x.bool(m.contractAndDepositBy1231),
      bankIntakeBy1231: x.bool(m.bankIntakeBy1231),
      houses: x.houses(m.houses),
      houseCount: x.int("houseCount", m.houseCount),
      leasedOut: x.bool(m.leasedOut),
      tenantIsFamily: x.bool(m.tenantIsFamily),
      everLived: x.bool(m.everLived),
      livedEvidence: x.oneOf(m.livedEvidence, ["resident_register", "move_in_only", "move_in_record_only", "unverified_docs"] as const),
      exception: x.oneOf(m.exception, [
        "legal_obligation", "succession", "deposit_unreturned", "short_extension", "other_inevitable", "none",
      ] as const),
      targetAsserted: x.flag(m.targetAsserted),
      depositIncrease: x.bool(m.depositIncrease),
      loanAmount: x.won("loanAmount", m.loanAmount),
      newLoanAmount: x.won("newLoanAmount", m.newLoanAmount),
      rentalRegion: normRegion(m.rentalRegion),
      rentalRegulated: x.bool(m.rentalRegulated),
      sameHome: x.bool(m.sameHome),
      firstLeaseBy0907: x.bool(m.firstLeaseBy0907),
      refinance: x.flag(m.refinance),
      otherHouseholdHouses: x.int("otherHouseholdHouses", m.otherHouseholdHouses) || undefined,
      dsrRatio: typeof m.dsrRatio === "number" && m.dsrRatio > 0 && m.dsrRatio < 200 ? m.dsrRatio : undefined,
      lenderSector: x.oneOf(m.lenderSector, ["bank", "nonbank"] as const),
      countClaims: countClaims(m.countClaims),
      leaseDepositDate: x.date("leaseDepositDate", m.leaseDepositDate),
      intakeDate: x.date("intakeDate", m.intakeDate),
      policyLoan: x.bool(m.policyLoan),
    }),
  };
}

function toM2(m: RawExtraction["m2"], x: Ctx): M2Case {
  const col = m.collateral ?? {};
  const colArea = normRegion(col.region);
  const colRegion = refineArea(colArea, normSigungu(colArea, col.sigungu));
  const collateral = prune({
    region: colRegion,
    sigungu: normSigungu(colRegion, col.sigungu),
    isApt: x.bool(col.isApt),
    regulated: x.bool(col.regulated),
    tags: (() => {
      const t = (Array.isArray(col.tags) ? col.tags : []).filter((v): v is HouseTag => HOUSE_TAGS.has(v as HouseTag));
      return t.length ? t : undefined;
    })(),
  }) as House;

  // 세입자·등록임대: 'mentioned' 플래그와 하위 값이 어긋나면 값 쪽을 믿되(있는 예외를 잃지 않게) 경고를 남긴다.
  // 언급됐는데 값이 비면 빈 객체로 남겨 엔진이 '임차인 있음/등록임대'로 진행하게 한다.
  const t = m.tenant ?? { mentioned: false };
  const tenantVals = prune({
    contractValidAt0401: x.bool(t.contractValidAt0401),
    originalEnd: x.date("tenant.originalEnd", t.originalEnd),
    renewal: x.oneOf(t.renewal, ["none", "implicit", "claim", "agreed"] as const),
    renewalDate: x.date("tenant.renewalDate", t.renewalDate),
    renewedEnd: x.date("tenant.renewedEnd", t.renewedEnd),
    provisional: x.flag(t.provisional),
  });
  // 후속 임차인 신규계약(F401-06)
  const tt = t as Record<string, unknown>;
  const successor = prune({
    signedDate: x.date("tenant.successorSignedDate", tt.successorSignedDate),
    end: x.date("tenant.successorEnd", tt.successorEnd),
    provisional: x.flag(tt.successorProvisional),
  });
  if (Object.keys(successor).length) (tenantVals as Record<string, unknown>).successor = successor;
  const tenantHasDates = !!(tenantVals.originalEnd || tenantVals.renewedEnd || tenantVals.renewalDate || tenantVals.renewal || Object.keys(successor).length);
  if (!t.mentioned && tenantHasDates) x.warnings.push("세입자 언급 표시는 없지만 계약 정보가 있어 반영");
  // '세입자 없다'는 언급이어도 임차인 예외가 아니다(2026-11-18 N04: 세입자 없음 → 임차인 예외 허용 오답)
  const absent = x.flag((t as { absent?: unknown }).absent) === true;
  if (absent && tenantHasDates) x.warnings.push("세입자 없음 표시와 계약 정보가 함께 있어 계약 정보를 반영");
  const tenant = (t.mentioned && !absent) || tenantHasDates ? tenantVals : undefined;

  const rr = m.registeredRental ?? { mentioned: false };
  const rrVals = prune({
    mandatoryEnd: x.date("registeredRental.mandatoryEnd", rr.mandatoryEnd),
    voluntaryCancel: x.flag(rr.voluntaryCancel),
    voluntaryCancelDate: x.date("registeredRental.voluntaryCancelDate", rr.voluntaryCancelDate),
  });
  const rrHasVals = Object.keys(rrVals).length > 0;
  if (!rr.mentioned && rrHasVals) x.warnings.push("등록임대 언급 표시는 없지만 등록임대 정보가 있어 반영");
  const registeredRental = rr.mentioned || rrHasVals ? rrVals : undefined;

  const out = {
    module: "M2",
    ...prune({
      borrowerType: x.oneOf(m.borrowerType, ["individual", "individual_landlord", "corporate_landlord"] as const),
      houses: x.houses(m.houses),
      houseCount: x.int("houseCount", m.houseCount),
      houseCountIsMinimum: x.flag(m.houseCountIsMinimum),
      conditionalDisposal: x.flag(m.conditionalDisposal),
      loanPurpose: x.oneOf(m.loanPurpose, ["general", "living", "interim", "relocation", "commercial"] as const),
      collateral,
      maturityDate: x.date("maturityDate", m.maturityDate),
      legalObligation: x.flag(m.legalObligation),
      legalObligationEnd: x.date("legalObligationEnd", m.legalObligationEnd),
      notifiedBy0401: x.flag(m.notifiedBy0401),
      notifiedProof: x.oneOf(m.notifiedProof, ["record", "none"] as const),
      asksNextMaturity: x.flag(m.asksNextMaturity),
      publicInterest: x.flag(m.publicInterest),
      otherException: x.flag(m.otherException),
      homsAvailable: x.bool(m.homsAvailable),
      consentRefused: x.flag(m.consentRefused),
      landlordMainBusiness: x.oneOf(m.landlordMainBusiness, ["rental", "other"] as const),
      countClaims: countClaims(m.countClaims),
    }),
  } as M2Case;
  // 빈 객체여도 '언급됨'은 의미가 있으므로 prune 뒤에 붙인다
  if (tenant) out.tenant = tenant;
  if (registeredRental) out.registeredRental = registeredRental;
  // '예외 사유 없음' 답: 임차인 외 예외(등록임대·법적 의무·4.1 이전 통보)가 모두 명시적으로 없을 때만 표시(false는 위 flag()에서 버려지므로 원문 값으로 본다).
  // 임차인이 없다고 했으면 '모두 없음', 임차인 사정이 이미 있으면 '다른 예외 사유 없음'으로 쓰인다(m2_renewal).
  const othersNone = rr.mentioned === false && !rrHasVals && m.legalObligation === false && m.notifiedBy0401 === false && m.otherException !== true;
  if (othersNone && (absent || tenant)) out.exceptionsNone = true;
  return out;
}

/** 규칙에 없는 사실·관례로 채운 날짜를 사례에 붙인다(판정 엔진이 보류·'일자 확인' 표시에 씀). */
const FACT_IDS = new Set((kbFacts.facts as { id: string }[]).map((f) => f.id));

function withSafety<T extends M1Case | M2Case>(c: T, raw: RawExtraction, assumptions: string[], warn?: string[]): T {
  if (raw.avoidanceAsked === true) c = { ...c, avoidanceAsked: true };
  // 규칙 밖 사실: 판정의 어느 부분을 바꾸는지 댈 수 있는 것만 남긴다('판정과 무관'·이유 없음은 버리고 경고로만 남김)
  const unmodeled: string[] = [];
  const info: NonNullable<M1Case["unmodeledInfo"]> = [];
  for (const f of raw.unmodeledFacts ?? []) {
    if (typeof f === "string") {
      if (f.trim()) {
        unmodeled.push(f.trim());
        info.push({ fact: f.trim(), sources: [] });
      }
      continue;
    }
    if (!f || typeof f.fact !== "string" || !f.fact.trim()) continue;
    const relevant = f.changes !== "판정과 무관" && typeof f.how === "string" && f.how.trim().length > 0;
    if (relevant) {
      unmodeled.push(f.fact.trim());
      // 원문 대조 단계의 근거 ID는 실제 판정 근거 자료에 있는 Fact만 남긴다(지어낸 ID 차단)
      const sources = (Array.isArray(f.sourceFacts) ? f.sourceFacts : []).filter((id) => typeof id === "string" && FACT_IDS.has(id));
      info.push({ fact: f.fact.trim(), changes: f.changes, sources });
    } else warn?.push(`판정과 무관한 사실로 분류해 판정에 쓰지 않음: ${f.fact.trim()}`);
  }
  if (unmodeled.length) {
    c.unmodeled = unmodeled;
    c.unmodeledInfo = info;
  }
  // 프롬프트 관례: 월만 있으면 그 달 15일로 넣고 '… → YYYY-MM-15로 가정'이라고 적는다
  const approx = [...new Set(assumptions.flatMap((a) => [...a.matchAll(/(\d{4}-\d{2}-15)로 가정/g)].map((m) => m[1])))];
  if (approx.length) c.approxDates = approx;
  return c;
}

export function normalize(raw: RawExtraction): Normalized {
  const x = new Ctx();
  const assumptions = (raw.assumptions ?? []).filter((a) => typeof a === "string" && a.trim()).map((a) => a.trim());
  switch (raw.module) {
    case "M1":
    case "M2": {
      const m1 = () => withSafety(toM1(raw.m1 ?? ({} as RawExtraction["m1"]), x), raw, assumptions, x.warnings);
      const m2 = () => withSafety(toM2(raw.m2 ?? ({} as RawExtraction["m2"]), x), raw, assumptions, x.warnings);
      const main = raw.module === "M1" ? m1() : m2();
      // 같은 고객 건에 다른 규제도 걸리면 그 모듈도 판정한다(판정은 각 모듈 규칙 엔진이 따로)
      const other = raw.alsoModule && raw.alsoModule !== raw.module ? (raw.alsoModule === "M1" ? m1() : m2()) : undefined;
      // 고객 사실이 있어도 기준 자체를 묻는 질문: 기준 답변(근거 조회)을 주 카드로, 고객 건 판정은 함께 보여 준다
      const criteria = raw.asksCriteria === true && process.env.LOANDESK_NO_Q !== "1" ? toBasis(raw.basis) : undefined;
      return { module: raw.module, case: main, ...(other ? { also: other } : {}), ...(criteria?.regs.length ? { basis: criteria, asksCriteria: true } : {}), assumptions, warnings: x.warnings };
    }
    case "M0": {
      const topic = x.oneOf(raw.topic, M0_TOPICS as M0Topic[]);
      if (!topic) return { module: "OUT", assumptions, warnings: [...x.warnings, `M0 주제 분류 실패(${String(raw.topic)})`] };
      const region = normRegion(raw.region);
      return { module: "M0", case: { module: "M0", topic, ...(region ? { region } : {}) }, assumptions, warnings: x.warnings };
    }
    case "Q": {
      const basis = toBasis(raw.basis);
      if (!basis) return { module: "OUT", assumptions, warnings: [...x.warnings, "기준 질문 태그 없음"] };
      return { module: "Q", basis, assumptions, warnings: x.warnings };
    }
    default: {
      const basisOut = toBasis(raw.basis);
      const related = [...new Set((raw.relatedTopics ?? []).map((t) => x.oneOf(t, M0_TOPICS as M0Topic[])).filter((t): t is M0Topic => !!t))];
      return { module: "OUT", ...(related.length ? { related } : {}), ...(basisOut?.regs.length ? { basis: basisOut } : {}), assumptions, warnings: x.warnings };
    }
  }
}
