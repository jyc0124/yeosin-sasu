// 규제별 주택 수 범위 (data/kb/house_scopes.json, docs/RULES.md §1-3)
//
// 같은 고객이라도 규제마다 주택 수를 세는 범위가 다르다:
//   8.13 비거주 1주택자 제한 = 부부합산(+산정 예외), 유주택자 전세대출 한도 = 차주+배우자(예외 없음),
//   1주택자 전세대출 DSR = 세대 기준(예외 없음), 4.1 만기연장 제한 = 세대 기준(+산정 예외).
// 그래서 주택 수는 '하나의 숫자'가 아니라 보유 목록(명의자 포함)에서 규제별로 계산한다.
// 범위 표는 데이터이고(근거 Fact ID 포함), 이 파일은 계산만 한다.
import table from "@/data/kb/house_scopes.json";
import { countHouses, type HouseCount, type HouseCtx } from "./houses";
import type { CountClaim, House, M1Case, M2Case, Owner } from "./types";

export type ScopeReg = "R813" | "R907" | "RDSR" | "R401";
type Scope = "couple" | "household";
interface RegScope {
  label: string;
  scope: Scope | null;
  exceptions: boolean;
  facts: string[];
  gaps?: string[];
  applies: "eq1" | "ge1" | "ge2" | "unknown";
  text: string;
}
export const SCOPES = (table as unknown as { regs: Record<ScopeReg | "RGUAR", RegScope> }).regs;
const SCOPE_WORD: Record<Scope, string> = { couple: "부부합산", household: "세대 기준" };

const COUPLE: (Owner | undefined)[] = [undefined, "self", "spouse", "joint"];

export interface ScopeCount {
  reg: ScopeReg;
  label: string;
  scope: Scope;
  /** 이 규제 기준 주택 수(모르면 undefined) */
  count?: number;
  /** 산정 예외를 적용하는 규제의 주택별 판정(막힘·역질문은 여기서) */
  hc?: HouseCount;
  /** 구성: 화면 표시용(예: '본인·배우자 1 + 같은 세대 가족 1') */
  parts: string;
  facts: string[];
  gaps: string[];
  /** 질문이 범위를 붙여 직접 말한 수를 썼는지 */
  claimed: boolean;
  /**
   * 같은 세대 가족 명의 주택을 뺀 수(그 가족이 세대원이 아닐 때 — 관계 확인용).
   * 두 해석의 결론이 같을 때만 확정한다(lib/rules: decideScope).
   */
  alt?: number;
}

/**
 * 규제 reg 기준 주택 수.
 * - M1 사례: houses·houseCount = 본인·배우자(부부합산) 관례. owner가 household/separated인 주택과 otherHouseholdHouses는 그 밖의 가족.
 * - M2 사례: houses·houseCount = 세대 관례. owner=separated(세대 분리 가족)는 세대 기준에서 뺀다.
 */
export function countFor(c: M1Case | M2Case, reg: ScopeReg, ctx: HouseCtx): ScopeCount {
  const s = SCOPES[reg];
  const scope = s.scope as Scope;
  const base = { reg, label: s.label, scope, facts: [...s.facts], gaps: [...(s.gaps ?? [])] };
  const claim = c.countClaims?.find((x) => x.scope === scope);
  const houses = c.houses ?? [];
  const mode = c.module;

  if (mode === "M1") {
    const couple = houses.filter((h) => COUPLE.includes(h.owner));
    const famHouses = houses.filter((h) => h.owner === "household");
    // other(전 배우자 등)·separated는 어느 범위에도 넣지 않는다
    const famCount = famHouses.length + (c.otherHouseholdHouses ?? 0);
    // 본인·배우자 명의 주택이 목록에 없으면(가족 명의만 있으면) 부부합산 수는 '모름'이다(0채로 보지 않는다)
    const coupleCount = (hc?: HouseCount) => (hc ? hc.count : (c.houseCount ?? (couple.length || undefined)));
    // 범위를 붙여 말한 수가 있으면 그 범위는 그 수로 쓴다(산정 예외를 적용하는 규제는 목록의 예외 주택만큼 뺀다)
    const fixed = claim && scope === "household" && overcounted(claim, houses, houses.filter((h) => h.owner !== "separated" && h.owner !== "other"));
    if (claim && !fixed) return fromClaim(base, s, claim, scope === "couple" ? couple : houses.filter((h) => h.owner !== "separated" && h.owner !== "other"), "M1", ctx);
    if (fixed) return fromList(base, s, claim!, fixed, "M1", ctx);
    if (scope === "couple") {
      const hc = s.exceptions ? countHouses(couple.length ? couple : undefined, c.houseCount, "M1", ctx) : undefined;
      let count = coupleCount(hc);
      // 세대 기준 수만 말했으면 부부합산은 그 이하: 세대 0채 → 0채, 세대 1채이고 본인·배우자 주택이 있으면 1채
      const hh = c.countClaims?.find((x) => x.scope === "household");
      let note = "";
      if (count === undefined && hh && !hh.atLeast) {
        if (hh.count === 0 || (hh.count === 1 && couple.length >= 1)) count = hh.count;
        // 세대 기준 수만 말했고 가족 명의 주택 언급이 없으면, 그 주택을 본인·배우자 명의로 전제한다(카드에 전제를 표시)
        else if (famCount === 0 && !couple.length) {
          count = hh.count;
          note = " — 세대 기준 수만 나와 가족 명의 주택이 없는 것으로 전제";
        }
        if (count !== undefined && s.exceptions && hc) count = Math.max(0, count - hc.evals.filter((e) => e.status === "excluded").length);
      }
      return { ...base, count, hc, parts: count === undefined ? "본인·배우자 주택 수 모름" : `본인·배우자 ${count}채${note}`, claimed: false };
    }
    // 세대 기준 = 부부합산(예외 없이 센 수) + 같은 세대 가족 명의
    const cc = coupleCount();
    const coupleClaim = c.countClaims?.find((x) => x.scope === "couple")?.count;
    const coupleN = cc ?? coupleClaim;
    const count = coupleN === undefined ? undefined : coupleN + famCount;
    return {
      ...base,
      count,
      parts: count === undefined ? "본인·배우자 주택 수 모름" : famCount ? `본인·배우자 ${coupleN} + 같은 세대 가족 ${famCount}` : `본인·배우자 ${coupleN}, 같은 세대 가족 명의 주택 언급 없음`,
      claimed: false,
      ...(famCount && coupleN !== undefined ? { alt: coupleN } : {}),
    };
  }

  // M2: 세대 관례
  const listedM2 = scope === "household" ? houses.filter((h) => h.owner !== "separated" && h.owner !== "other") : houses.filter((h) => COUPLE.includes(h.owner));
  const fixedM2 = claim && scope === "household" && overcounted(claim, houses, listedM2);
  if (claim && !fixedM2) return fromClaim(base, s, claim, listedM2, "M2", ctx);
  if (fixedM2) return fromList(base, s, claim!, fixedM2, "M2", ctx);
  const separated = houses.filter((h) => h.owner === "separated" || h.owner === "other");
  const inScope: House[] = scope === "household" ? houses.filter((h) => h.owner !== "separated" && h.owner !== "other") : houses.filter((h) => COUPLE.includes(h.owner));
  // houseCount는 세대 기준 수(세대 분리 가족 명의는 빼고 센 수 — 추출 관례)
  // 안전장치: 주택 수가 따로 없고 목록에 담보 주택만 있으면 보유 주택 전체를 안다고 볼 수 없다 → 모름(잘못된 '1주택 → 허용' 방지)
  const onlyCollateral = c.houseCount === undefined && inScope.length > 0 && inScope.every((h) => h.isCollateral);
  const total = c.houseCount ?? (c.houses && !onlyCollateral ? inScope.length : undefined);
  // countHouses는 주택 수가 없으면 목록 길이를 쓰므로, 담보 주택만 있는 목록은 넘기지 않는다(주택 수 모름 유지)
  const hc = s.exceptions ? countHouses(c.houses && !onlyCollateral ? inScope : undefined, total, "M2", ctx) : undefined;
  const count = hc ? hc.count : total;
  const sep = separated.length ? `(세대 분리 가족 명의 ${separated.length}채 제외)` : "";
  // 같은 세대 가족(owner=household) 명의로 센 주택 → 그 가족이 세대원이 아니면(형제자매 등) 빠지므로 뺀 수도 계산
  const famCounted = hc ? hc.evals.filter((e) => e.status === "counted" && e.house.owner === "household").length : inScope.filter((h) => h.owner === "household").length;
  const alt = count !== undefined && famCounted ? count - famCounted : undefined;
  return { ...base, count, hc, parts: count === undefined ? "세대 주택 수 모름" : `세대 ${count}채${sep}${famCounted ? `(같은 세대 가족 명의 ${famCounted}채 포함)` : ""}`, claimed: false, ...(alt !== undefined ? { alt } : {}) };
}

/**
 * 범위를 붙여 말한 수 → 이 규제 기준 수. 말한 수는 '보유한 집'의 수이므로, 산정 예외를 적용하는 규제(8.13·4.1)는
 * 목록에 있는 예외 주택(상속 등)만큼 뺀다. '유주택자'(1채 이상)는 정확히 1채인지 보는 규제에서는 모름.
 */
function fromClaim(
  base: Pick<ScopeCount, "reg" | "label" | "scope" | "facts" | "gaps">,
  s: RegScope,
  claim: CountClaim,
  listed: House[],
  mode: "M1" | "M2",
  ctx: HouseCtx,
): ScopeCount {
  const word = `질문에 나온 ${SCOPE_WORD[base.scope]} ${claim.count}채${claim.atLeast ? " 이상" : ""}`;
  const hc = s.exceptions && listed.length ? countHouses(listed, claim.count, mode, ctx) : undefined;
  if (claim.atLeast && s.applies !== "ge1") return { ...base, count: undefined, hc, parts: `${word}(정확한 수 모름)`, claimed: true };
  const count = hc ? hc.count : claim.count;
  const excl = hc ? hc.evals.filter((e) => e.status === "excluded").length : 0;
  return { ...base, count, hc, parts: excl ? `${word}, 산정 예외 ${excl}채 제외 → ${count}채` : word, claimed: true };
}

/**
 * 질문이 말한 범위 주택 수가 '목록의 모든 주택'을 센 수인데, 목록에 그 범위 밖 명의(형제자매·세대 분리 가족 등) 주택이 섞여 있으면
 * 질문의 수는 범위 밖 주택까지 센 것이다(예: '세대 2주택'이라 했지만 한 채는 친동생 명의). 이때는 목록으로 다시 센다.
 * 질문의 수가 목록보다 크면(목록에 없는 주택이 있을 수 있음) 질문의 수를 그대로 쓴다. 세대 기준에만 쓴다(세대원 범위를 직원이 넓게 아는 경우가 많고, 부부합산은 명의 추출 오류 위험이 더 큼).
 */
function overcounted(claim: CountClaim, all: House[], inScope: House[]): House[] | undefined {
  if (claim.atLeast || !all.length || claim.count !== all.length || inScope.length >= claim.count) return undefined;
  if (all.some((h) => h.owner === undefined && !inScope.includes(h))) return undefined;
  return inScope;
}

/** 목록으로 다시 센 수(질문의 수를 바로잡았다고 표시) */
function fromList(
  base: Pick<ScopeCount, "reg" | "label" | "scope" | "facts" | "gaps">,
  s: RegScope,
  claim: CountClaim,
  listed: House[],
  mode: "M1" | "M2",
  ctx: HouseCtx,
): ScopeCount {
  const hc = s.exceptions && listed.length ? countHouses(listed, listed.length, mode, ctx) : undefined;
  const count = hc ? hc.count : listed.length;
  const parts = `질문은 ${SCOPE_WORD[base.scope]} ${claim.count}채라고 했지만, 그중 ${claim.count - listed.length}채는 이 범위에 들지 않는 가족(형제자매·세대 분리 가족 등) 명의라 빼면 ${count}채`;
  return { ...base, facts: [...new Set([...base.facts, "F401-20"])], count, hc, parts, claimed: false };
}

/** 세대 정의(F401-20)를 카드에 드러내는 문장 */
export const HOUSEHOLD_NOTE =
  "같은 세대 가족 명의 주택은 그 가족이 세대원(주민등록표상 배우자·직계존속(배우자의 직계존속 포함)·직계비속과 그 배우자)일 때 세대 기준에 넣습니다(은행업감독규정 <별표6>, 401FAQ 각주 '각 업권법 감독규정 상 세대기준'). 형제자매·전 배우자 등은 세대원이 아니므로 그 명의 주택은 빼야 합니다. 주민등록등본·가족관계증명서로 관계를 확인하세요.";

/**
 * 세대 범위: 같은 세대 가족(owner=household — 추출 관례상 주민등록표상 직계존비속과 그 배우자) 명의 주택을 '세대 기준' 주택 수에 넣는다.
 * 근거: 401FAQ Ⅰ-1 "세대기준* / * 각 업권법 감독규정 상 세대기준" → 은행업감독규정 <별표6> 버목의 세대 정의(F401-20, 2026-11-22 원문 확보).
 * 가족 명의를 넣고 빼는 데 따라 결론이 달라지면, 그 주택이 세대원 명의인지가 결론을 정하므로 관계 확인(note)을 카드에 낸다.
 */
export function decide(sc: ScopeCount): { applies?: boolean; ambiguous: false; text: string; premise?: string } {
  const a = applies(sc.reg, sc.count);
  if (sc.alt === undefined || a === undefined) return { applies: a, ambiguous: false, text: scopeLine(sc) };
  const b = applies(sc.reg, sc.alt);
  if (a === b) {
    const both = `${SCOPE_WORD[sc.scope]}: ${sc.parts} — 같은 세대 가족 명의 주택을 넣든(${sc.count}채) 빼든(${sc.alt}채) 이 규제의 주택 수 요건에 ${a ? "해당" : "해당하지 않음"}.`;
    return { applies: a, ambiguous: false, text: both };
  }
  return {
    applies: a,
    ambiguous: false,
    premise: `${HOUSEHOLD_NOTE} 그 주택이 세대원 명의가 아니면 ${sc.alt}채가 되어 결론이 달라집니다.`,
    text: `${SCOPE_WORD[sc.scope]}: ${sc.parts} — 같은 세대 가족(세대원) 명의 주택을 넣어 ${sc.count}채 → 이 규제의 주택 수 요건에 ${a ? "해당" : "해당하지 않음"}(은행업감독규정 <별표6> 세대 정의).`,
  };
}

/** 이 규제의 대상 주택 수 조건에 해당하나(모르면 undefined) */
export function applies(reg: ScopeReg, n: number | undefined): boolean | undefined {
  if (n === undefined) return undefined;
  const a = SCOPES[reg].applies;
  return a === "eq1" ? n === 1 : a === "ge1" ? n >= 1 : a === "ge2" ? n >= 2 : undefined;
}

/** 범위가 서로 다른 규제의 주택 수가 실제로 달라지는지(화면에 '규제별 주택 수'를 보여 줄지) */
export function scopesDiffer(c: M1Case | M2Case, regs: ScopeReg[], ctx: HouseCtx): boolean {
  const ns = regs.map((r) => countFor(c, r, ctx).count);
  return ns.some((n) => n !== undefined) && new Set(ns.map(String)).size > 1;
}

/** 한 줄 설명: '1주택자 전세대출 DSR: 세대 기준 2채(본인·배우자 1 + 같은 세대 가족 1) → 대상 아님' */
export function scopeLine(sc: ScopeCount): string {
  const a = applies(sc.reg, sc.count);
  const verdict = a === undefined ? "" : a ? " → 이 규제의 주택 수 요건에 해당" : " → 이 규제의 주택 수 요건에 해당하지 않음";
  return `${SCOPE_WORD[sc.scope]}: ${sc.parts}${verdict}. (${SCOPES[sc.reg].text})`;
}
