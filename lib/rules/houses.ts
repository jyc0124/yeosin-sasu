// 주택 수 산정과 주택별 예외 판정 (docs/RULES.md §1)
import regions from "@/data/kb/regions.json";
import type { House, KbVersion } from "./types";
import { today } from "./dates";

type Mode = "M1" | "M2";
type RegionMap = Record<string, string[]>;
interface Edition {
  label: string;
  source: string;
  factId: string;
  incomplete?: boolean;
  effectiveFrom?: string;
  depopulation: RegionMap;
  interest: RegionMap;
  aliases?: Record<string, Record<string, string>>;
}
const R = regions as unknown as {
  capital: string[];
  metro: string[];
  border: RegionMap;
  editions: Record<"faq0401" | "gazette2021" | "gazette2026", Edition>;
};

/** 판정 맥락: 지식 버전과 기준일에 따라 인구감소(관심)지역 목록 판본이 달라진다. */
export interface HouseCtx {
  kb: KbVersion;
  asOf: string;
}

/**
 * KB v1 = 4.1 FAQ 참고표(경남 2곳 누락). KB v2 = 행안부 지정 원문 — 기준일이 10.20 이후면 재지정 목록.
 * ➏은 "인구감소(관심)지역"을 행안부 지정에 맡기므로 판정 기준일에 유효한 지정을 쓴다(RULES §1-2).
 */
export function regionEdition(ctx: HouseCtx): Edition {
  if (ctx.kb === "v1") return R.editions.faq0401;
  const g26 = R.editions.gazette2026;
  return ctx.asOf >= (g26.effectiveFrom ?? "9999") ? g26 : R.editions.gazette2021;
}

const defaultCtx = (): HouseCtx => ({ kb: "v2", asOf: today() });

export interface HouseEval {
  house: House;
  status: "counted" | "excluded" | "ask" | "committee" | "hold" | "check";
  reason: string;
  /** 주택 수에 포함된 이유를 고객에게 말하듯 쓴 문장(결론 문장용) */
  plain?: string;
  /** 제외가 나중에 뒤집힐 수 있는 조건(예: 토지거래허가 추후 검증) — 이 제외로 제한을 벗어나면 결론은 조건부 */
  provisional?: string;
  facts: string[];
  docs: string[];
  question?: string;
}

const has = (m: RegionMap, region?: string, sigungu?: string) => !!(region && sigungu && m[region]?.includes(sigungu));
const status = (e: Edition, region: string, sigungu: string) => {
  const sg = e.aliases?.[region]?.[sigungu] ?? sigungu;
  return { dec: has(e.depopulation, region, sg), intr: has(e.interest, region, sg) };
};
/** '수도권'(시도 미상)도 수도권. '비수도권'은 아님 */
export const isCapital = (region?: string) => !!region && (region === "수도권" || R.capital.includes(region));

// 받침에 맞춘 주제 조사(은/는)
export const topic = (w: string) => {
  const c = w.charCodeAt(w.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return `${w}은(는)`;
  return `${w}${(c - 0xac00) % 28 ? "은" : "는"}`;
};
const name = (h: House) => h.label ?? ([h.region, h.sigungu].filter(Boolean).join(" ") || "해당 주택");

/** ➏ 인구감소(관심)지역 주택 판정 */
export function depopulation(h: House, ctx: HouseCtx = defaultCtx()): HouseEval | undefined {
  const { region, sigungu } = h;
  if (!region || !sigungu) return undefined;
  const ed = regionEdition(ctx);
  const { dec, intr } = status(ed, region, sigungu);
  const border = has(R.border, region, sigungu);
  const facts = ["F401-03", ...(ctx.kb === "v2" ? [ed.factId] : [])];
  const docs = ["등기부등본(주소 확인)", "매매계약서(취득 시점 확인)"];
  // 재지정으로 지위가 바뀐 지역은 이유에 함께 적는다(예: 동두천 관심→인구감소, 금정구 관심→인구감소)
  let changed = "";
  if (ed === R.editions.gazette2026) {
    const prev = status(R.editions.gazette2021, region, sigungu);
    const lbl = (x: { dec: boolean; intr: boolean }) => (x.dec ? "인구감소지역" : x.intr ? "인구감소관심지역" : "미지정");
    if (lbl(prev) !== lbl({ dec, intr })) changed = ` ('26.10.20 재지정으로 ${lbl(prev)} → ${lbl({ dec, intr })})`;
  }
  if (!dec && !intr) {
    if (h.claimsDepopulation && ed.incomplete && !isCapital(region) && !(R.metro.includes(region) && !sigungu.endsWith("군"))) {
      return { house: h, status: "check", reason: `${name(h)}은(는) 4.1 참고표 목록에 없음. 표 합계 불일치로 최신 행안부 고시 확인 필요`, facts: [...facts, "G-08"], docs };
    }
    if (h.claimsDepopulation && changed) {
      return { house: h, status: "counted", plain: `${topic(name(h))} 현재 인구감소(관심)지역이 아니어서 예외가 적용되지 않습니다.`, reason: `${name(h)}: 현재 인구감소(관심)지역이 아니라 ➏ 예외 불인정${changed}`, facts, docs: [] };
    }
    return undefined;
  }
  if (isCapital(region) && !(dec && border)) {
    const extra = intr && border ? " (관심지역·접경지역이지만 정부 발표 자료는 '접경지역인 인구감소지역'만 인정 → 해석 확인 권고)" : "";
    return { house: h, status: "counted", plain: `${topic(name(h))} 수도권에 있어 인구감소지역 예외가 적용되지 않습니다.`, reason: `${name(h)}: 수도권 소재라 ➏ 예외 불인정${extra}${changed}`, facts, docs: [] };
  }
  if (R.metro.includes(region) && !sigungu.endsWith("군")) {
    return { house: h, status: "counted", plain: `${topic(name(h))} 광역시의 구(군 제외)에 있어 인구감소지역이어도 예외가 적용되지 않습니다.`, reason: `${name(h)}: 광역시(군 제외) 소재라 ➏ 예외 불인정${changed}`, facts, docs: [] };
  }
  const limit = !isCapital(region) && dec ? 9e8 : 4e8;
  const limitTxt = limit === 9e8 ? "9억 원(비수도권 인구감소지역)" : isCapital(region) ? "4억 원(수도권 접경 인구감소지역)" : "4억 원(관심지역)";
  if (h.baseValueAtAcq === undefined) {
    return {
      house: h,
      status: "ask",
      plain: `${topic(name(h))} ${isCapital(region) ? "수도권이지만 접경지역인 인구감소지역이라" : "인구감소(관심)지역이라"} 주택 수에서 뺄 수 있는 곳입니다. 취득 시 기준시가가 ${limitTxt.replace(/\(.*\)/, "")} 이하인지 확인해야 합니다.`,
      reason: `${name(h)}: ➏ 대상 지역${changed}. 취득 시 기준시가 ${limitTxt} 이하인지 확인 필요`,
      facts,
      docs,
      question: `${name(h)}의 취득 시 기준시가가 ${limitTxt} 이하인가요? (취득 시점 기준시가는 공개 자료로 확인 가능)`,
    };
  }
  if (h.baseValueAtAcq <= limit) {
    return {
      house: h,
      status: "excluded",
      plain: `${topic(name(h))} ${limit === 9e8 ? "비수도권 인구감소지역" : isCapital(region) ? "수도권 접경 인구감소지역" : "인구감소관심지역"}에 있고 취득 시 기준시가가 ${limitTxt.replace(/\(.*\)/, "")} 이하라 주택 수에서 빠집니다.`,
      reason: `${name(h)}: ➏ 인구감소(관심)지역${changed}, 취득 시 기준시가 ${limitTxt} 이하 → 주택 수 제외`,
      facts,
      docs,
    };
  }
  return { house: h, status: "counted", plain: `${topic(name(h))} 취득 시 기준시가가 ${limitTxt}를 넘어 인구감소지역 예외가 적용되지 않습니다.`, reason: `${name(h)}: 기준시가가 ${limitTxt} 초과라 ➏ 예외 불인정${changed}`, facts, docs: [] };
}

export function evalHouse(h: House, mode: Mode, ctx: HouseCtx = defaultCtx()): HouseEval {
  const t = new Set(h.tags ?? []);
  const F = mode === "M1" ? ["F813-04", "F401-03"] : ["F401-03"];
  if (t.has("saleProvisional"))
    return {
      house: h,
      status: "hold",
      reason: `${name(h)}: 가계약만 있음. 매도계약 예외의 가계약 인정 여부는 정부 발표 자료에 없음`,
      facts: [...F, "G-03"],
      docs: [],
      question: "정식 매매계약서가 있나요?",
    };
  if (t.has("landPermitPending"))
    return {
      house: h,
      status: "excluded",
      plain: `${topic(name(h))} 토지거래허가 신청이 접수된 매도계약 주택이라 주택 수에서 빠집니다(➊).`,
      reason: `${name(h)}: ➊ 매도계약 기 체결(토지거래허가 신청 접수) → 주택 수 제외, 추후 허가 여부 검증`,
      facts: F,
      docs: ["매매계약서", "토지거래허가 신청 접수증"],
      provisional: "토지거래허가 신청 접수로 매도계약 예외를 적용했습니다. 추후 허가 여부를 검증하며, 허가가 나지 않으면 그 주택은 주택 수에 다시 포함됩니다(F401-03 ➊).",
    };
  if (t.has("similar"))
    return { house: h, status: "committee", reason: `${name(h)}: '그 밖에 준하는 경우'는 여신심사위 개별 판단`, facts: F, docs: [] };
  const ex: [string, string, string[]][] = [
    ["saleContracted", "➊ 매도계약 기 체결", ["매매계약서", "(토허구역) 토지거래허가 신청 접수증"]],
    ["daycare", "➋ 어린이집", ["어린이집 인가증"]],
    ["unsoldNew", "➌ 준공 후 미분양 최초 매입", ["조특법 특례 확인 날인 서류"]],
    ["privateRental", "➍ 민간건설임대주택", ["임대사업자 등록증"]],
    ["inheritance", "➎ 상속", ["상속 관련 등본"]],
    ["auction", "➎ 채권보전 경매 등 불가피한 취득", ["경매개시 결정문"]],
    ["heritage", "➐ 문화재", ["국가지정문화유산대장"]],
  ];
  // 결론 문장용: 왜 주택 수에서 빠지는지 고객에게 말하듯
  const WHY: Record<string, string> = {
    saleContracted: "이미 매도계약을 맺은 집이라",
    daycare: "어린이집으로 쓰는 집이라",
    unsoldNew: "준공 후 미분양 주택을 처음 산 것이라",
    privateRental: "민간건설임대주택이라",
    inheritance: "상속으로 받은 집이라",
    auction: "채권보전 경매 등으로 불가피하게 취득한 집이라",
    heritage: "문화재라",
  };
  // 집 이름에 이미 사유가 들어 있으면('상속받은 집') 사유를 되풀이하지 않는다
  const KEY: Record<string, string> = { saleContracted: "매도", daycare: "어린이집", unsoldNew: "미분양", privateRental: "임대주택", inheritance: "상속", auction: "경매", heritage: "문화재" };
  for (const [tag, label, docs] of ex) {
    if (t.has(tag as never))
      return { house: h, status: "excluded", plain: `${topic(name(h))} ${name(h).includes(KEY[tag]) ? "" : `${WHY[tag]} `}주택 수에서 빠집니다(${label.slice(0, 1)}).`, reason: `${name(h)}: ${label} → 주택 수 제외`, facts: F, docs };
  }
  if (mode === "M1" && t.has("guarantorExcluded"))
    return { house: h, status: "excluded", plain: `${topic(name(h))} 보증기관 내규상 주택 수 제외 주택입니다.`, reason: `${name(h)}: 보증기관 내규상 주택 수 제외 주택`, facts: ["F813-05"], docs: [] };
  const dep = depopulation(h, ctx);
  if (dep) return dep;
  if (t.has("gift"))
    return { house: h, status: "counted", plain: `${topic(name(h))} 증여로 취득해 예외가 인정되지 않습니다.`, reason: `${name(h)}: 증여 취득은 예외 불인정 → 주택 수에 포함`, facts: ["F401-04", "F401-03"], docs: [] };
  return { house: h, status: "counted", reason: "", facts: [], docs: [] };
}

export interface HouseCount {
  count?: number;
  evals: HouseEval[];
  blocking?: HouseEval; // ask / hold / committee / check 중 첫 번째
  counted: House[];
}

/** 주택 수 산정. houses는 알려진 주택 목록, houseCount는 전체 수(목록이 일부일 때). */
export function countHouses(
  houses: House[] | undefined,
  houseCount: number | undefined,
  mode: Mode,
  ctx: HouseCtx = defaultCtx(),
): HouseCount {
  const list = houses ?? [];
  const evals = list.map((h) => evalHouse(h, mode, ctx));
  const total = houseCount ?? (houses ? houses.length : undefined);
  const blocking = evals.find((e) => e.status !== "counted" && e.status !== "excluded");
  if (total === undefined) return { evals, blocking, counted: [] };
  const excluded = evals.filter((e) => e.status === "excluded").length;
  const counted = evals.filter((e) => e.status === "counted").map((e) => e.house);
  const count = Math.max(0, total - excluded);
  // 주거용 오피스텔·상가주택을 주택 수에 넣는지는 원문에 없다(G-09). 이 집들 때문에 다주택자가 되는 경우만 확정하지 않는다.
  const unclear = evals.filter((e) => e.status === "counted" && e.house.kind);
  if (!blocking && unclear.length && count >= 2 && count - unclear.length <= 1) {
    const kinds = [...new Set(unclear.map((e) => (e.house.kind === "officetel" ? "주거용 오피스텔" : "상가주택")))].join("·");
    const hold: HouseEval = {
      house: unclear[0].house,
      status: "hold",
      reason: `${kinds}을(를) 주택 수에 넣는지는 정부 발표 자료에 기준이 없음(이 집을 빼면 다주택자가 아님)`,
      facts: [mode === "M1" ? "F813-01" : "F401-01", "G-09"],
      docs: [],
      question: `${kinds}이(가) 이번 규제의 주택 수에 포함되는지 본점 확인`,
    };
    return { count, evals: [...evals, hold], blocking: hold, counted };
  }
  return { count, evals, blocking, counted };
}
