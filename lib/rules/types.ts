// 규칙 엔진 입력·출력 타입. 명세: docs/RULES.md
// 원칙: 값이 없으면(undefined) "모름"이다. 추출기는 질문에 없는 값을 채우지 않는다.

/** 안내 = 고객 건 판정이 아니라 정부 발표 자료로 확인된 기준을 알려 주는 답(해석·범위·기준일 질문). 남은 쟁점이 있으면 보류 */
export type VerdictCode = "허용" | "불허" | "조건부" | "심사위" | "보류" | "역질문" | "내부지침" | "안내";
export type KbVersion = "v1" | "v2";
export type ModuleId = "M1" | "M2" | "M0";
export type ISODate = string; // "2026-12-20"

export type HouseTag =
  | "saleContracted" // ➊ 매도계약 기 체결(정식 계약)
  | "saleProvisional" // ➊ 가계약만 (G-03)
  | "landPermitPending" // ➊ 토지거래허가구역 매도계약: 허가 신청 접수, 허가 전(추후 허가 여부 검증 — F401-03)
  | "daycare" // ➋
  | "unsoldNew" // ➌
  | "privateRental" // ➍
  | "inheritance" // ➎
  | "auction" // ➎
  | "heritage" // ➐
  | "similar" // ➑ 그 밖에 준하는 경우 → 심사위
  | "guarantorExcluded" // M1 전용: 보증기관 내규상 제외(20㎡ 이하 등)
  | "gift"; // 증여(예외 아님)

/**
 * 주택 명의자(규제별 주택 수 범위 계산용 — data/kb/house_scopes.json, lib/rules/scope.ts).
 * self=본인, spouse=배우자, joint=부부 공동명의(1채), household=같은 세대의 다른 가족(부모·자녀 등), separated=세대를 분리한 가족(배우자 제외),
 * other=그 밖의 사람(전 배우자·친척 등 — 어느 범위에도 넣지 않음).
 * 없으면 모듈 관례: M1은 본인·배우자, M2는 세대 구성원.
 */
export type Owner = "self" | "spouse" | "joint" | "household" | "separated" | "other";
/** 범위를 붙여 말한 주택 수(예: 'DSR상 세대 1주택', '부부합산 2주택') */
export interface CountClaim {
  scope: "couple" | "household";
  count: number;
  /** '유주택자'·'집이 있다'처럼 수 없이 보유만 말함 → count=1, '1채 이상' */
  atLeast?: boolean;
}

export interface House {
  label?: string;
  owner?: Owner;
  region?: string; // 시도 약칭: 서울, 인천, 경기, 부산 ...
  sigungu?: string;
  isApt?: boolean;
  kind?: "officetel" | "mixed_use"; // 주택 수 산정 기준이 원문에 없는 유형(주거용 오피스텔·상가주택) → G-09
  regulated?: boolean; // 비수도권 규제지역 여부
  baseValueAtAcq?: number; // 취득 시 기준시가(원)
  tags?: HouseTag[];
  claimsDepopulation?: boolean; // 질문이 "인구감소지역이라던데"라고 주장
  /** M2: 이 주택이 만기연장하려는 대출의 담보(보유 목록과 담보를 연결 — 담보 주택 자체의 예외 판정에 씀) */
  isCollateral?: boolean;
}

export interface CaseCommon {
  asOf?: ISODate;
  kb?: KbVersion;
  /** 판정 항목에 담기지 않았지만 결론을 바꿀 수 있는 사실(추출기가 보고). 있으면 확정 판정 대신 보류 */
  unmodeled?: string[];
  /**
   * 규칙 밖 사실의 세부(unmodeled와 같은 순서): 판정의 어느 부분을 바꾼다고 했는지(changes),
   * 원문 대조 단계에서 관련 기준이 있다고 확인된 Fact(sources). sources가 없으면 '판정 근거 자료에서 기준을 찾지 못함'.
   */
  unmodeledInfo?: { fact: string; changes?: string; sources: string[] }[];
  /** 일(日)을 관례로 채운 날짜(월만 알려진 날짜). 화면 문장에서 '일자 확인 필요'로 표시 */
  approxDates?: ISODate[];
  /** 질문이 규제를 피하는 방법(계약일 소급, 용도 표시 변경, 명의 이전 등)을 묻거나 제안. 추출기는 실제 사실만 넣고 이 표시를 한다 */
  avoidanceAsked?: boolean;
}

export type M1Exception =
  | "legal_obligation" // ① 법적 의무로 실거주 예정
  | "succession" // ② 임대차 승계 조건부 취득
  | "deposit_unreturned" // ③ 보증금 미반환
  | "short_extension" // ④ 퇴거 일정 조정
  | "other_inevitable" // ⑤ 그 밖의 불가피성 → 심사위
  | "none";

export interface M1Case extends CaseCommon {
  module: "M1";
  action?: "new" | "renewal";
  increase?: boolean;
  maturityDate?: ISODate;
  plannedRenewalDate?: ISODate;
  applicationDate?: ISODate;
  contractAndDepositBy1231?: boolean;
  bankIntakeBy1231?: boolean;
  houses?: House[];
  houseCount?: number; // 부부합산 주택 수(목록이 일부만 있을 때 전체 수)
  leasedOut?: boolean;
  tenantIsFamily?: boolean;
  everLived?: boolean; // 본인 또는 배우자
  /** unverified_docs = 실거주했다고 하나 증빙이 정부 자료에 정해지지 않은 서류(입주자카드·통신 설치내역 등)뿐 — 인정 기준 G-01 */
  livedEvidence?: "resident_register" | "move_in_only" | "move_in_record_only" | "unverified_docs";
  exception?: M1Exception;
  targetAsserted?: boolean; // 질문이 "비거주 1주택 해당자"를 전제
  /** 임차보증금이 늘어남(대출금액 증액과 별개). increase=false와 함께면 '보증금만 증액' → 증액 연장 아님(F828-01 기준은 대출금액) */
  depositIncrease?: boolean;
  loanAmount?: number; // 현재 전세대출 금액(원)
  newLoanAmount?: number; // 증액·신규 후 전세대출 금액(원)
  rentalRegion?: string; // 고객이 사는(빌리는) 전셋집 시도
  rentalRegulated?: boolean; // 비수도권 전셋집이 규제지역인지(명시된 경우만)
  sameHome?: boolean; // 기존 전셋집에 계속 거주하며 갱신(이사 아님)
  firstLeaseBy0907?: boolean; // 그 전셋집의 최초 임대차계약이 '25.9.7까지 체결
  refinance?: boolean; // 다른 대출로 갈아타는 대환(G-15)
  dsrRatio?: number; // 질문에 나온 차주단위 DSR(%), 전세대출 반영 후
  lenderSector?: "bank" | "nonbank"; // 은행권(40%) / 비은행권(50%)
  otherHouseholdHouses?: number; // 본인·배우자 외 같은 세대원(부모 등) 명의 주택 수 — 8.13 부부합산에는 안 들어감
  countClaims?: CountClaim[];
  /** 임대차계약 체결과 계약금 납부를 모두 마친 날(둘 중 늦은 날). 규제별 경과조치 기준일과 비교 */
  leaseDepositDate?: ISODate;
  /** 금융회사 전산 대출 신청 접수일 */
  intakeDate?: ISODate;
  /** 버팀목·은행-지자체 협약 등 정책 목적 전세대출이면 true(1주택자 전세대출 DSR 제외, F828-11), 일반 상품이면 false */
  policyLoan?: boolean;
}

export interface Tenant {
  contractValidAt0401?: boolean;
  originalEnd?: ISODate;
  renewal?: "none" | "implicit" | "claim" | "agreed";
  renewalDate?: ISODate;
  renewedEnd?: ISODate;
  provisional?: boolean;
  /** 후속 임차인(새 세입자)과의 신규계약(F401-06): 정식 계약일·종료일·가계약 여부. provisional은 기존 계약에 대한 것 */
  successor?: { signedDate?: ISODate; end?: ISODate; provisional?: boolean };
}

export interface M2Case extends CaseCommon {
  module: "M2";
  borrowerType?: "individual" | "individual_landlord" | "corporate_landlord";
  houses?: House[];
  houseCount?: number; // 세대 기준 주택 수
  houseCountIsMinimum?: boolean; // '다주택'처럼 최소 수만 앎(정확한 수 아님) → 제외 후 1채 이하여도 확정하지 않음
  conditionalDisposal?: boolean;
  loanPurpose?: "general" | "living" | "interim" | "relocation" | "commercial";
  collateral?: House;
  maturityDate?: ISODate;
  tenant?: Tenant;
  registeredRental?: { mandatoryEnd?: ISODate; voluntaryCancel?: boolean; voluntaryCancelDate?: ISODate };
  legalObligation?: boolean; // 전매제한·실거주의무 등 법적 의무로 즉시 매도 불가(종료일 모를 수 있음)
  legalObligationEnd?: ISODate;
  notifiedBy0401?: boolean;
  /** 4.1 이전 통보의 기록: record=상담 기록·문자 이력 있음, none=기록 없다고 함(고객 진술만으로는 불인정, A은행 지침 제5조 4항) */
  notifiedProof?: "record" | "none";
  /** 4.1 예외 사유(임차인·등록임대·법적 의무·4.1 이전 통보)가 모두 없다고 명시적으로 확인됨. 같은 질문을 다시 묻지 않게 하는 표시이고 결론은 바꾸지 않는다 */
  exceptionsNone?: true;
  /** maturityDate는 이미 지난(그때 연장한) 만기이고, 질문은 그 다음 만기를 묻는다 */
  asksNextMaturity?: boolean;
  publicInterest?: boolean;
  otherException?: boolean; // ⑥ 그 밖에 준하는 경우 → 심사위
  homsAvailable?: boolean;
  /** 주택보유 확인 동의서 제출(법인은 확약)을 거부함 → 만기연장 불허(F828-08) */
  consentRefused?: boolean;
  landlordMainBusiness?: "rental" | "other";
  countClaims?: CountClaim[];
}

export type M0Topic =
  | "guarantee_ratio"
  | "exception_scope"
  | "first_home_inherited_share"
  | "dsr_parental_leave"
  | "rw_rate_impact"
  | "youth_mortgage_rate"
  | "move_in_only_residence"
  | "residence_proof_record"
  | "provisional_sale_contract"
  | "regulated_area_change"
  | "loan_cap_ltv_dsr"
  | "other_bank_precedent"
  | "title_split_avoidance"
  | "increase_definition" // 증액 연장의 뜻(대출금액 기준)
  | "jeonse_basis_date" // 규정 적용 기준일(연장=만기도래일, 신규=신청일)
  | "renewal_vs_refinance" // 단순 연장·증액 연장·대환(신규)의 적용 기준 구분
  | "house_count_scope" // 규제별 주택 수 합산 범위(부부합산·배우자 포함·세대 기준)
  | "household_scope_consent" // 4.1 세대 기준의 세대 범위와 HOMS 조회 동의 대상
  | "early_renewal_procedure"; // 만기 전 연장 심사·약정·처리일(절차는 범위 밖, 적용 기준만)

export interface M0Case extends CaseCommon {
  module: "M0";
  topic: M0Topic;
  /** 질문에 나온 지역(시도). regulated_area_change에서 수도권이면 규제지역 해제와 무관하게 결론을 낸다 */
  region?: string;
}

export type Case = M1Case | M2Case | M0Case;

export interface TraceStep {
  step: string;
  result: string;
  facts: string[];
}

/** 확인된 기준 한 줄(규제별): 정부 발표 자료 Fact로 확인된 것만 */
export interface BasisItem {
  label: string; // 예: "8.13 비거주 1주택자 제한"
  text: string;
  facts: string[];
  /** 이 기준의 대상(무주택·1주택·다주택)이 질문의 고객과 다를 때 붙이는 안내(문장은 원문 그대로 두고 따로 표시) */
  note?: string;
}

export interface Verdict {
  verdict: VerdictCode;
  module: ModuleId;
  headline: string;
  conditions: string[];
  documents: string[];
  questions: string[];
  facts: string[];
  gaps: string[];
  needsLatest: boolean;
  trace: TraceStep[];
  kb: KbVersion;
  /** 확인된 기준(규제별). 해석·범위형 질문과, 함께 적용되는 다른 규제를 보여 줄 때 */
  basis?: BasisItem[];
  /** 결론의 전제: 확인하지 않은 사실을 이렇게 가정하고 낸 결론이라는 표시(결론 문장 바로 아래에 보인다). 판정 코드는 바꾸지 않는다 */
  premise?: string;
  /** 갈림길 답: 역질문일 때 그 사실의 값마다 규칙 엔진이 낸 결론(lib/rules/branches.ts) */
  branches?: { on: string; options: { when: string; verdict: VerdictCode; headline: string }[] };
}
