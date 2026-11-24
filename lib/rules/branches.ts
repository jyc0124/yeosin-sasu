// 갈림길 답(쓸모 있는 역질문): 결론이 고객 사실 하나에 달려 확정하지 못할 때, 그 사실의 가능한 값마다 규칙 엔진을 다시 돌려
// "○○이면 → [판정] …"을 함께 보여 준다. 판정 코드는 바꾸지 않는다(여전히 역질문) — 직원이 답을 듣기 전에도 갈 길을 안다.
// 값마다 결론은 규칙 엔진이 낸다(LLM 아님). 적어도 한 갈래가 그 사실만으로 확정될 때 보여 준다(남는 갈래는 추가 확인 표시).
import type { Case, M1Case, M2Case, Verdict, VerdictCode } from "./types";

export interface Branch {
  /** 무엇에 따라 갈리는가(예: '임차인이 가족인지') */
  on: string;
  options: { when: string; verdict: VerdictCode; headline: string }[];
}

type Opt<C> = { when: string; patch: Partial<C> };
type Def<C> = { on: string; unknown: (c: C) => boolean; options: Opt<C>[] };

const M1_DEFS: Def<M1Case>[] = [
  {
    on: "부부합산 보유 주택 수",
    unknown: (c) => c.houseCount === undefined && !c.houses?.length && !c.countClaims?.length && !c.targetAsserted,
    options: [
      { when: "무주택", patch: { houseCount: 0 } },
      { when: "1주택", patch: { houseCount: 1 } },
      { when: "2주택 이상", patch: { houseCount: 2 } },
    ],
  },
  {
    on: "보유 주택을 세 줬는지",
    unknown: (c) => c.leasedOut === undefined && !c.targetAsserted,
    options: [
      { when: "세를 주지 않음", patch: { leasedOut: false } },
      { when: "세를 줌(가족 아님)", patch: { leasedOut: true, tenantIsFamily: false } },
    ],
  },
  {
    on: "임차인이 본인·배우자의 부모·자녀인지",
    unknown: (c) => c.leasedOut !== false && c.tenantIsFamily === undefined && !c.targetAsserted,
    options: [
      { when: "임차인이 부모·자녀(직계)", patch: { tenantIsFamily: true } },
      { when: "임차인이 가족 아님", patch: { tenantIsFamily: false } },
    ],
  },
  {
    on: "본인·배우자가 그 집에 산 적이 있는지",
    unknown: (c) => c.everLived === undefined && !c.targetAsserted,
    options: [
      { when: "본인 또는 배우자가 산 적 있음", patch: { everLived: true } },
      { when: "부부 모두 산 적 없음", patch: { everLived: false } },
    ],
  },
  {
    on: "전세대출 금액을 늘리는지",
    unknown: (c) => c.action === "renewal" && c.increase === undefined,
    options: [
      { when: "대출금 증액 없음", patch: { increase: false } },
      { when: "대출금 증액", patch: { increase: true } },
    ],
  },
];

const M2_DEFS: Def<M2Case>[] = [
  {
    on: "세대 기준 보유 주택 수",
    unknown: (c) => c.houseCount === undefined && !c.houses?.length && !c.countClaims?.length,
    options: [
      { when: "세대 1주택", patch: { houseCount: 1 } },
      { when: "세대 2주택 이상", patch: { houseCount: 2 } },
    ],
  },
  {
    on: "담보가 수도권·규제지역 아파트인지",
    unknown: (c) => !c.collateral || c.collateral.isApt === undefined,
    options: [
      { when: "수도권 아파트 담보", patch: { collateral: { region: "서울", isApt: true } } },
      { when: "아파트 아님", patch: { collateral: { isApt: false } } },
    ],
  },
  {
    // 아파트인 건 알지만 소재지를 모를 때(현장 피드백 11/24: 소재지 미확인인데 '불가'가 먼저 보임)
    on: "담보 아파트가 수도권·규제지역인지",
    unknown: (c) => c.collateral?.isApt === true && !c.collateral.region,
    options: [
      { when: "수도권·규제지역 아파트", patch: { collateral: { region: "서울", isApt: true } } },
      { when: "수도권 밖 비규제지역 아파트", patch: { collateral: { region: "비수도권", isApt: true, regulated: false } } },
    ],
  },
  {
    on: "지금 임대차계약을 4.1 이전에 맺었는지",
    unknown: (c) => !!c.tenant && c.tenant.contractValidAt0401 === undefined,
    options: [
      { when: "'26.4.1 당시 이미 유효한 계약", patch: {} },
      { when: "'26.4.2 이후 새로 맺은 계약", patch: {} },
    ],
  },
];
// 임차인 계약 시점은 tenant 안의 값이라 patch를 따로 만든다
const tenantPatch = (c: M2Case, when: string): Partial<M2Case> => ({ tenant: { ...(c.tenant ?? {}), contractValidAt0401: when.startsWith("'26.4.1") } });

export function branchesFor(c: Case, v: Verdict, run: (c: Case) => Verdict): Branch | undefined {
  if (v.verdict !== "역질문" || (c.module !== "M1" && c.module !== "M2")) return undefined;
  const defs = (c.module === "M1" ? M1_DEFS : M2_DEFS) as Def<Case>[];
  for (const d of defs) {
    if (!d.unknown(c)) continue;
    const options = d.options.map((o) => {
      const patch = d.on.startsWith("지금 임대차계약") ? tenantPatch(c as M2Case, o.when) : o.patch;
      const r = run({ ...c, ...patch } as Case);
      return { when: o.when, verdict: r.verdict, headline: r.headline };
    });
    // 적어도 한 갈래는 이 사실만으로 결론이 나고(역질문·보류 아님), 갈래마다 결론이 실제로 다를 때만.
    // 더 확인할 게 남는 갈래는 '추가 확인'으로 보여 준다(그 갈래의 역질문 문장 그대로).
    const settled = (o: { verdict: VerdictCode }) => o.verdict !== "역질문" && o.verdict !== "보류";
    if (options.some(settled) && new Set(options.map((o) => o.verdict + o.headline)).size > 1) return { on: d.on, options };
  }
  return undefined;
}
