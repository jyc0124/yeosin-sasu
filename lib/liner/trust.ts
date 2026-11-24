// 출처 신뢰도 등급. 스파이크 결과 공식 출처 비율이 0~40%라 직접 필터링이 필요하다.
export type TrustTier = 1 | 2 | 3 | 0; // 1=공식, 2=주요 언론·공공, 3=기타 웹, 0=제외(SNS·영상)

const TIER1 = ["fsc.go.kr", "better.fsc.go.kr", "korea.kr", "fss.or.kr", "molit.go.kr", "law.go.kr", "khug.or.kr", "hf.go.kr", "moef.go.kr"];
const TIER2 = [
  "yna.co.kr", "mk.co.kr", "hankyung.com", "sedaily.com", "edaily.co.kr", "mt.co.kr", "chosun.com", "joongang.co.kr",
  "donga.com", "hani.co.kr", "khan.co.kr", "fnnews.com", "newsis.com", "news1.kr", "kbs.co.kr", "mbc.co.kr", "sbs.co.kr",
  "ytn.co.kr", "joseilbo.com", "biz.chosun.com", "kfb.or.kr",
];
const EXCLUDE = ["youtube.com", "instagram.com", "facebook.com", "tiktok.com", "x.com", "twitter.com", "threads.net"];

const matches = (host: string, list: string[]) => list.some((d) => host === d || host.endsWith(`.${d}`));

export function trustTier(urlOrHost: string): TrustTier {
  let host = urlOrHost;
  try {
    host = new URL(urlOrHost).hostname;
  } catch {
    /* 이미 hostname */
  }
  host = host.replace(/^(www|m)\./, "");
  if (matches(host, EXCLUDE)) return 0;
  if (matches(host, TIER1)) return 1;
  if (matches(host, TIER2)) return 2;
  // 금융위 공식 블로그는 공식 출처로 취급
  if (/blog\.naver\.com\/blogfsc/.test(urlOrHost)) return 1;
  return 3;
}

export const TIER_LABEL: Record<TrustTier, string> = { 1: "공식", 2: "언론", 3: "기타", 0: "제외" };
