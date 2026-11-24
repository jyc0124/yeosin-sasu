// 조건 추출용 JSON Schema (Liner Router response_format=json_schema, strict).
// strict 모드라 모든 키가 required이고, "모름"은 null로 표현한다. 정규화는 normalize.ts.
import { M0_TOPICS } from "@/lib/rules";
import { CONCEPTS, REGS } from "@/lib/basis/vocab";

export const SIDO = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
] as const;

type J = Record<string, unknown>;
/** 시도를 말하지 않고 '수도권'·'비수도권'만 말한 경우(창구에서 흔함). 엔진은 수도권 여부만 쓰고, 시도가 필요한 판단(인구감소지역 등)은 모름으로 둔다 */
/** 규칙 밖 사실이 바꿀 수 있는 판정 부분. '판정과 무관'으로 분류한 사실은 코드가 버린다(보류 남발 방지) */
export const UNMODELED_EFFECTS = ["주택 수", "규제 대상 여부", "예외 인정", "적용 시점·경과조치", "판정과 무관"];

export const AREA = ["수도권", "비수도권"] as const;
export const REGION = [...SIDO, ...AREA];

const nul = (t: string, description?: string): J => ({ type: [t, "null"], ...(description ? { description } : {}) });
const en = (values: readonly string[], description?: string): J => ({
  type: ["string", "null"],
  enum: [...values, null],
  ...(description ? { description } : {}),
});
const date = (description: string): J => nul("string", `YYYY-MM-DD. ${description}`);
const obj = (properties: Record<string, J>, description?: string): J => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
  ...(description ? { description } : {}),
});

const HOUSE_TAGS = [
  "saleContracted", "saleProvisional", "landPermitPending", "daycare", "unsoldNew", "privateRental",
  "inheritance", "auction", "heritage", "similar", "guarantorExcluded", "gift",
];

const house = obj({
  label: nul("string", "질문 속 표현 그대로 짧게 (예: '증여받은 주택')"),
  owner: en(["self", "spouse", "joint", "household", "separated", "other"], "명의자: self=본인, spouse=배우자, joint=부부 공동명의, household=같은 주민등록표의 직계 가족(부모·배우자의 부모·자녀·손자녀·자녀의 배우자), separated=세대를 분리한 가족(배우자 제외 — 세대 분리한 배우자는 spouse), other=그 밖의 사람(형제자매·전 배우자·친척 등, 같은 등본이어도). 질문에 없으면 null"),
  region: en(REGION, "시도 약칭. 시도 없이 '수도권'·'비수도권'만 말하면 그 값"),
  sigungu: nul("string", "시군구 정식 명칭 (예: 평창군, 해운대구, 동두천시)"),
  isApt: nul("boolean", "아파트면 true, 오피스텔·빌라·단독·시골집이면 false"),
  kind: en(["officetel", "mixed_use"], "주거용 오피스텔이면 officetel, 상가와 주택이 섞인 상가주택이면 mixed_use, 그 밖은 null"),
  regulated: nul("boolean", "비수도권 주택이 규제지역인지 질문에 명시된 경우만"),
  baseValueAtAcq: nul("number", "취득 시 기준시가(원 단위 정수). 1억 = 100000000"),
  tags: { type: "array", items: { type: "string", enum: HOUSE_TAGS }, description: "해당하는 주택 예외 태그. 없으면 []" },
  claimsDepopulation: nul("boolean", "질문이 '인구감소(관심)지역이라던데'처럼 주장하면 true"),
  isCollateral: nul("boolean", "M2: 이 주택이 만기연장하려는 주담대의 담보이면 true(담보 주택도 houses에 넣고 표시)"),
});

const m1 = obj(
  {
    action: en(["new", "renewal"], "전세대출 신규(new) / 만기연장(renewal)"),
    increase: nul("boolean", "연장하면서 증액하면 true"),
    maturityDate: date("기존 전세대출 만기"),
    plannedRenewalDate: date("만기 전에 미리 연장하려는 날"),
    applicationDate: date("신규 전세대출 신청(예정)일"),
    contractAndDepositBy1231: nul("boolean", "'26.12.31까지 임대차계약 체결+계약금 납부"),
    bankIntakeBy1231: nul("boolean", "'26.12.31까지 금융회사 전산 접수"),
    houses: { type: "array", items: house, description: "보유 주택(명의자 owner와 함께). 본인·배우자 것 외에 같은 세대 가족(owner=household) 것도 넣을 수 있다. 언급 없으면 []" },
    houseCount: nul("integer", "부부합산(본인·배우자) 주택 수가 명시된 경우"),
    leasedOut: nul("boolean", "보유 주택을 임대(전세·월세) 중"),
    tenantIsFamily: nul("boolean", "보유 주택 임차인이 본인·배우자의 부모·자녀 등 직계존비속"),
    everLived: nul("boolean", "true=본인 또는 배우자가 실거주한 적 있음. false=본인과 배우자 모두 없음이 명시됨"),
    livedEvidence: en(["resident_register", "move_in_only", "move_in_record_only", "unverified_docs"], "move_in_only=전입신고만 하고 실제로는 안 삶(고객이 안 살았다고 함). move_in_record_only=실제로 살았다고 하나 증빙이 전입신고 기록뿐(보조 서류 없음). unverified_docs=실제로 살았다고 하나 증빙이 그 밖의 서류(입주자카드·통신 설치내역 등)뿐이라 실거주가 확인되지 않음"),
    exception: en(
      ["legal_obligation", "succession", "deposit_unreturned", "short_extension", "other_inevitable", "none"],
      "8.13 예외 사유",
    ),
    targetAsserted: nul("boolean", "질문이 고객을 비거주 1주택자로 전제"),
    depositIncrease: nul("boolean", "임차보증금(전세금)이 오르면 true. 대출금액 증액(increase)과 별개"),
    loanAmount: nul("number", "현재 전세대출 금액(원 단위 정수). 2억 = 200000000"),
    newLoanAmount: nul("number", "늘린 뒤(또는 신규) 전세대출 금액(원 단위 정수)"),
    rentalRegion: en(REGION, "고객이 사는(빌리는) 전셋집의 시도(또는 '수도권'·'비수도권'). 보유 주택 소재지와 다름"),
    rentalRegulated: nul("boolean", "비수도권 전셋집이 규제지역인지 명시된 경우만"),
    sameHome: nul("boolean", "지금 전셋집에 계속 살며 갱신하면 true, 다른 집으로 이사하면 false"),
    firstLeaseBy0907: nul("boolean", "그 전셋집의 최초 임대차계약이 2025.9.7까지 체결"),
    refinance: nul("boolean", "기존 전세대출을 다른 대출로 갈아타는 대환이면 true"),
    dsrRatio: nul("number", "질문에 나온 차주단위 DSR(%, 전세대출 반영 후). 44%면 44"),
    lenderSector: en(["bank", "nonbank"], "은행이면 bank, 저축은행·상호금융 등 2금융권이면 nonbank. 언급 없으면 null"),
    otherHouseholdHouses: nul("integer", "본인·배우자가 아닌 같은 세대 가족(같이 사는 부모 등) 명의 주택 수(목록이 없을 때). houseCount에는 넣지 않는다"),
    leaseDepositDate: date("임대차계약 체결과 계약금 납부를 모두 마친 날(둘이 다르면 늦은 날)"),
    intakeDate: date("금융회사 전산 대출 신청 접수일"),
    policyLoan: nul("boolean", "버팀목·은행-지자체 협약 등 정책 목적 전세대출이면 true, 일반(은행재원) 상품이라고 하면 false. 회사 이자 지원 등은 정책 목적이 아님"),
    countClaims: {
  type: "array",
  items: obj({ scope: { type: "string", enum: ["couple", "household"] }, count: { type: "integer" }, atLeast: { type: "boolean", description: "'유주택자'·'국내 주택 보유'처럼 수 없이 보유만 말하면 true(count=1)" } }),
  description: "질문이 범위를 붙여 말한 주택 수(예: 'DSR상 세대 1주택' → household 1, '부부합산 2주택' → couple 2, '유주택자(배우자 포함)' → couple 1 atLeast). 범위 없이 말한 수는 houseCount. 없으면 []",
},
  },
  "module=M1일 때만 채운다. 아니면 모든 값 null, 배열은 []",
);

const m2 = obj(
  {
    borrowerType: en(["individual", "individual_landlord", "corporate_landlord"], "차주 유형"),
    houses: { type: "array", items: house, description: "세대 보유 주택 중 질문에 나온 것(명의자 owner와 함께). 세대를 분리한 가족 명의는 owner=separated로 넣는다. 없으면 []" },
    houseCount: nul("integer", "세대 기준 주택 수(세대 분리 가족 명의 제외)"),
    houseCountIsMinimum: nul("boolean", "'다주택'·'여러 채'처럼 정확한 수 없이 2채 이상임만 알 때 true(houseCount는 2)"),
    conditionalDisposal: nul("boolean", "처분조건부 1주택"),
    loanPurpose: en(["general", "living", "interim", "relocation", "commercial"], "대출 용도"),
    collateral: obj({
      region: en(REGION, "담보 주택 시도(또는 '수도권'·'비수도권')"),
      sigungu: nul("string", "담보 주택 시군구"),
      isApt: nul("boolean", "담보가 아파트인가"),
      regulated: nul("boolean", "비수도권 담보가 규제지역인지 명시된 경우만"),
      tags: { type: "array", items: { type: "string", enum: HOUSE_TAGS }, description: "담보 주택 자체가 주택 예외(상속·채권보전 경매·어린이집·미분양 최초 매입·민간건설임대·문화재·매도계약 등)이면 그 태그. 없으면 []" },
    }),
    maturityDate: date("주담대 약정서상 만기"),
    asksNextMaturity: nul("boolean", "maturityDate가 이미 지나 그때 연장했고, 질문이 그 다음 만기를 묻는 경우 true"),
    tenant: obj({
      mentioned: { type: "boolean", description: "질문에 담보 주택 임차인(세입자) 이야기가 있으면 true" },
      absent: nul("boolean", "'세입자 없다'·'본인이 산다'처럼 세입자가 없다고 하면 true"),
      contractValidAt0401: nul("boolean", "'26.4.1 기준 유효하게 체결된 임대차(가계약 아님)"),
      originalEnd: date("4.1 기준 임대차 종료일"),
      renewal: en(["none", "implicit", "claim", "agreed"], "implicit=묵시적 갱신, claim=갱신청구권, agreed=합의 재계약. 구분 불가면 null"),
      renewalDate: date("갱신이 일어난 날"),
      renewedEnd: date("갱신계약 종료일"),
      provisional: nul("boolean", "4.1 당시 계약이 가계약이면 true(후속 계약의 가계약은 successorProvisional)"),
      successorSignedDate: date("후속 임차인(새 세입자)과 정식 계약한 날"),
      successorEnd: date("후속 임차인 신규계약 종료일"),
      successorProvisional: nul("boolean", "후속 임차인과 정식 계약 없이 가계약만 했으면 true"),
    }),
    registeredRental: obj({
      mentioned: { type: "boolean", description: "질문에 등록임대사업자(의무임대기간·자진말소) 이야기가 있으면 true" },
      mandatoryEnd: date("등록임대 의무임대기간 종료일"),
      voluntaryCancel: nul("boolean", "자진말소(예정)"),
      voluntaryCancelDate: date("자진말소일"),
    }),
    legalObligation: nul("boolean", "전매제한·실거주의무 등 법적 의무 때문에 지금 그 집을 팔 수 없음"),
    legalObligationEnd: date("전매제한·실거주의무 등 법적 의무 종료일"),
    notifiedBy0401: nul("boolean", "'26.4.1까지 은행이 만기연장을 통보(문자·서면 등)"),
    notifiedProof: en(["record", "none"], "그 통보의 기록: 상담 기록·문자 발송 이력 등이 있으면 record, 기록이 없다고 하면 none, 언급 없으면 null"),
    publicInterest: nul("boolean", "민간임대리츠·공익법인 등 공익적 목적이 존재하는 차주(두 유형은 예시)"),
    otherException: nul("boolean", "위 예외 외에 그에 준하는 불가피한 사정"),
    homsAvailable: nul("boolean", "법인 HOMS 조회 가능 여부"),
    consentRefused: nul("boolean", "차주가 주택보유 확인(HOMS 조회) 동의서 제출이나 법인 확약을 거부한다고 명시하면 true"),
    landlordMainBusiness: en(["rental", "other"], "임대사업자의 주된 영업이 주택임대업(rental)인가"),
    countClaims: {
  type: "array",
  items: obj({ scope: { type: "string", enum: ["couple", "household"] }, count: { type: "integer" }, atLeast: { type: "boolean", description: "'유주택자'·'국내 주택 보유'처럼 수 없이 보유만 말하면 true(count=1)" } }),
  description: "질문이 범위를 붙여 말한 주택 수(예: 'DSR상 세대 1주택' → household 1, '부부합산 2주택' → couple 2, '유주택자(배우자 포함)' → couple 1 atLeast). 범위 없이 말한 수는 houseCount. 없으면 []",
},
  },
  "module=M2일 때만 채운다. 아니면 모든 값 null, 배열은 [], mentioned=false",
);

export const EXTRACT_SCHEMA = {
  name: "loandesk_case",
  schema: obj({
    // 평가 A/B: LOANDESK_NO_Q=1이면 기준 질문(Q) 경로 없이(11/21 이전 구조) 추출한다
    module: { type: "string", enum: process.env.LOANDESK_NO_Q === "1" ? ["M1", "M2", "M0", "OUT"] : ["M1", "M2", "M0", "Q", "OUT"], description: "Q = 제도·기준을 묻는 해석형 질문(M0 주제에 꼭 맞지 않을 때). OUT = 두 대책과 무관한 질문" },
    alsoModule: en(["M1", "M2"], "같은 고객 건에 다른 규제도 함께 판단해야 하면(예: 주담대 만기연장 + 전세대출) 그 모듈. 그 모듈 객체도 채운다. 아니면 null"),
    basis: obj(
      {
        subQuestions: { type: "array", items: { type: "string" }, description: "질문을 답할 단위로 나눈 하위 질문 1~5개(짧게). Q·OUT·asksCriteria일 때만, 아니면 []" },
        regs: { type: "array", items: { type: "string", enum: REGS }, description: "관련 규제. Q·OUT·asksCriteria일 때만, 아니면 []" },
        concepts: { type: "array", items: { type: "string", enum: CONCEPTS }, description: "묻는 개념. Q·OUT·asksCriteria일 때만, 아니면 []" },
      },
      "module=Q(또는 범위 안 요소가 섞인 OUT), 또는 asksCriteria=true일 때 채운다",
    ),
    topic: en(M0_TOPICS, "module=M0일 때만"),
    region: en(SIDO, "module=M0일 때 질문에 나온 지역의 시도(예: '경기도 ○○시' → 경기). 없거나 M0가 아니면 null"),
    m1,
    m2,
    relatedTopics: {
      type: "array",
      items: { type: "string", enum: M0_TOPICS },
      description: "module=OUT일 때, 질문 일부가 겹치는 M0 주제(범위 안에서 답할 수 있는 부분). 없거나 OUT이 아니면 []",
    },
    asksCriteria: { type: "boolean", description: "고객 사실이 있어도 그 고객의 가능·해당 여부는 전혀 묻지 않고 기준·정의·구분·적용 범위의 설명만 물으면 true(이때 basis도 채운다). 가능·해당 여부를 하나라도 물으면 false" },
    avoidanceAsked: { type: "boolean", description: "규제를 피하는 방법(계약일 소급·서류 날짜 조정, 대출 용도 표시 변경, 명의 이전, 조기 처리 등)을 묻거나 제안하면 true" },
    unmodeledFacts: {
      type: "array",
      items: obj({
        fact: { type: "string", description: "질문 표현 그대로 짧게" },
        changes: { type: "string", enum: UNMODELED_EFFECTS, description: "이 사실이 판정의 어느 부분을 바꿀 수 있나. 바꿀 곳을 댈 수 없으면 '판정과 무관'" },
        how: { type: "string", description: "이 사실이 있을 때와 없을 때 결론이 어떻게 달라질 수 있는지 한 문장" },
        regs: { type: "array", items: { type: "string", enum: REGS }, description: "이 사실이 걸리는 규제(근거 조회용)" },
        concepts: { type: "array", items: { type: "string", enum: CONCEPTS }, description: "이 사실이 건드리는 개념(근거 조회용)" },
        sourceFacts: { type: "array", items: { type: "string" }, description: "[원문 대조] 단계에서만: 이 사실에 대한 기준이 있는 근거 Fact ID(주어진 근거 목록에서만). 그 밖에는 []" },
      }),
      description: "위 항목 어디에도 담을 수 없지만 주택 수·규제 대상 여부·예외 인정·적용 시점을 바꿀 수 있는 사실. 없으면 []",
    },
    assumptions: {
      type: "array",
      items: { type: "string" },
      description: "질문에 없어 관례로 채운 값 (예: '만기 12월 → 12/15로 가정'). 없으면 []",
    },
  }),
};

export interface RawHouse {
  label: string | null;
  owner?: string | null;
  region: string | null;
  sigungu: string | null;
  isApt: boolean | null;
  kind?: string | null;
  regulated: boolean | null;
  baseValueAtAcq: number | null;
  tags: string[];
  claimsDepopulation: boolean | null;
  isCollateral?: boolean | null;
}
export interface RawUnmodeled {
  fact: string;
  changes: string;
  how: string;
  regs?: string[];
  concepts?: string[];
  sourceFacts?: string[];
}
export interface RawExtraction {
  module: "M1" | "M2" | "M0" | "Q" | "OUT";
  alsoModule?: "M1" | "M2" | null;
  basis?: { subQuestions: string[]; regs: string[]; concepts: string[] };
  topic: string | null;
  region?: string | null;
  m1: Record<string, unknown> & { houses: RawHouse[] };
  m2: Record<string, unknown> & {
    houses: RawHouse[];
    collateral: Record<string, unknown>;
    tenant: Record<string, unknown> & { mentioned: boolean };
    registeredRental: Record<string, unknown> & { mentioned: boolean };
  };
  unmodeledFacts?: (string | RawUnmodeled)[];
  relatedTopics?: string[];
  avoidanceAsked?: boolean;
  asksCriteria?: boolean;
  assumptions: string[];
}
