// 보증기관 확인 자료(현장 피드백 11/22 ③): 질문에 보증기관·보증 실무 주제가 나오면 공개 자료의 발췌를 연결한다.
// - 판정 근거가 아니다. 규칙 엔진(lib/rules)은 이 모듈을 쓰지 않고, 판정 코드도 바꾸지 않는다.
// - 고르는 것은 코드(키워드)다. 발췌 문장은 공식 문서 원문 그대로(tests/guarantor.sources.test.ts가 대조).
// - 기관을 특정하지 못하면 기관을 먼저 묻는다(화면에서 HF·HUG·SGI를 고르면 그 기관 자료만 보인다).
import data from "@/data/guarantor/sources.json";

export type Agency = "HF" | "HUG" | "SGI";
export interface GuarantorSource {
  id: string;
  agency: Agency;
  agencyName: string;
  title: string;
  kind: string;
  asOf?: string;
  asOfNote: string;
  url: string;
  file?: string;
}
export interface GuarantorExcerpt {
  id: string;
  source: string;
  where: string;
  topics: string[];
  quote: string;
}
export interface AgencyRefs {
  /** 질문에서 특정한 기관(없으면 기관을 먼저 확인) */
  agencies: Agency[];
  /** 질문에서 읽은 주제(한도·연장·주택 수 등) */
  topics: string[];
  excerpts: (GuarantorExcerpt & { src: GuarantorSource })[];
  /** 질문 기관 중 공개 자료가 없는 곳(예: SGI) */
  missing: GuarantorSource[];
  checkedAt: string;
}

/** 화면 설명용: 보증기관이 무엇인지(심사위원·처음 보는 사람용) */
export const AGENCY_INFO: Record<Agency, { name: string; type: string; role: string }> = {
  HF: { name: "한국주택금융공사", type: "공공기관", role: "은행 전세대출에 보증서를 내 주는 공공 보증기관입니다(일반전세자금보증 등)." },
  HUG: {
    name: "주택도시보증공사",
    type: "공공기관",
    role: "전세대출 보증(전세안심보증)을 내 주고, 국토교통부 주택도시기금의 버팀목 전세자금 대출을 운영합니다.",
  },
  SGI: { name: "SGI서울보증", type: "민간 보증보험회사", role: "전세자금대출 보증 상품을 팝니다. 공공기관과 달리 심사 기준을 공개하지 않습니다." },
};

export const SOURCES = data.sources as GuarantorSource[];
export const EXCERPTS = data.excerpts as GuarantorExcerpt[];
const byId = new Map(SOURCES.map((s) => [s.id, s]));

const AGENCY_RE: Record<Agency, RegExp> = {
  HF: /\bHF\b|주택금융공사|주금공|한국주택금융/i,
  HUG: /\bHUG\b|허그|주택도시보증|안심전세|전세안심|버팀목|기금\s?전세/i,
  SGI: /\bSGI\b|서울보증/i,
};
/** 보증기관 이름 없이도 보증 실무를 묻는 표현 */
const GUARANTEE_RE = /보증기관|전세자금보증|특약보증|보증\s?한도|보증\s?상품|보증서|보증\s?비율|보증부\s?대출|상환능력|금융비용부담|이자비용/;
const TOPIC_RE: Record<string, RegExp> = {
  limit: /한도|얼마까지|최대/,
  income: /소득|금융비용|이자비용|상환능력/,
  renewal: /연장|갱신|만기/,
  increase: /증액|추가\s?대출|늘리|올려|보증금이 (늘|오르)/,
  move: /이사|목적물\s?변경|다른 집/,
  housecount: /주택\s?수|주택보유|유주택|무주택|1주택|다주택|몇 채/,
  family: /배우자|세대원|부부|가족|조회/,
  ratio: /보증\s?비율/,
  residence: /실거주|전입/,
  fund: /버팀목|기금/,
  acquire: /3억|투기(과열)?지역|투기과열지구|규제대상\s?아파트|20\.7\.10|2020\.\s?7\.\s?10|아파트를?\s?(구입|취득|매수)/,
  timing: /신청\s?기한|언제까지|3개월/,
};

export function agencyRefs(text: string): AgencyRefs | undefined {
  const agencies = (Object.keys(AGENCY_RE) as Agency[]).filter((a) => AGENCY_RE[a].test(text));
  if (!agencies.length && !GUARANTEE_RE.test(text)) return undefined;
  const topics = Object.keys(TOPIC_RE).filter((t) => TOPIC_RE[t].test(text));
  const scope = agencies.length ? agencies : (["HF", "HUG", "SGI"] as Agency[]);
  const scored = EXCERPTS.map((e) => ({ e, src: byId.get(e.source)!, n: e.topics.filter((t) => topics.includes(t)).length }))
    .filter((x) => x.src && scope.includes(x.src.agency))
    .filter((x) => x.n > 0 || !topics.length);
  // 주제가 겹치는 발췌를 많이 겹친 순으로, 기관마다 최대 3개
  scored.sort((a, b) => b.n - a.n);
  const per = new Map<Agency, number>();
  const excerpts = scored
    .filter((x) => {
      const k = per.get(x.src.agency) ?? 0;
      if (k >= 3) return false;
      per.set(x.src.agency, k + 1);
      return true;
    })
    .map((x) => ({ ...x.e, src: x.src }));
  const missing = SOURCES.filter((s) => s.kind === "미확보" && scope.includes(s.agency));
  return { agencies, topics, excerpts, missing, checkedAt: data.checkedAt };
}
