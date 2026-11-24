// 날짜 유틸. 모든 날짜는 ISO 문자열(YYYY-MM-DD)로 다루고 문자열 비교로 대소를 판단한다.
import type { ISODate } from "./types";

export const D = {
  // 4.1 가계부채 관리방안
  ANNOUNCE_0401: "2026-04-01",
  IMPLICIT_RENEWAL_LAST: "2026-04-16", // 4.2~4.16 묵시적 갱신 유예
  OLD_RULE_LAST_0401: "2026-04-16", // 4.16까지 만기 도래 → 종전 규정
  CLAIM_END_LIMIT: "2026-07-31", // 4개월 내 종료 계약의 갱신청구권
  // 8.13 금융 종합대책 / 8.28 행정지도
  ANNOUNCE_0813: "2026-08-13",
  TRANSITION_LAST: "2026-12-31", // 경과조치 마지막 날
  EFFECTIVE_0813: "2027-01-01",
} as const;

export const isISO = (s: unknown): s is ISODate => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function addYears(d: ISODate, n: number): ISODate {
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y + n, m - 1, day));
  // 2/29 → 2/28 보정
  if (dt.getUTCMonth() !== m - 1) dt.setUTCDate(0);
  return dt.toISOString().slice(0, 10);
}

export function addMonths(d: ISODate, n: number): ISODate {
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, day));
  // 말일 보정(예: 8.31 + 1개월 → 9.30)
  if (dt.getUTCDate() !== day) dt.setUTCDate(0);
  return dt.toISOString().slice(0, 10);
}

export const maxDate = (ds: ISODate[]) => ds.reduce((a, b) => (a > b ? a : b));
export const minDate = (ds: ISODate[]) => ds.reduce((a, b) => (a < b ? a : b));

/** 2026-12-20 → 26.12.20 (창구 표기) */
export function fmt(d: ISODate): string {
  return `${d.slice(2, 4)}.${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;
}

export function today(): ISODate {
  // KST 기준 오늘
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}
