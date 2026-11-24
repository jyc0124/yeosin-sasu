// 정책 감시의 결정적 부분(분류·원문 대조·Fact 대응·영향 분석). Liner 호출 없음.
import { describe, expect, it } from "vitest";
import { classify, dateFromUrl, matchOriginal } from "@/lib/watch/discover";
import { fetchOriginal, getOriginal } from "@/lib/watch/original";
import { check } from "@/lib/watch/structure";
import { impact } from "@/lib/watch/impact";
import { quoteFound, similarity, squash } from "@/lib/watch/text";

// Liner가 실제로 찾은 8.28 행정지도 파일 주소
const URL_828 =
  "https://better.fsc.go.kr/fsc_new/file/displayFile.do?filePath=/2026/08/28&orgFileName=260813_%EC%A3%BC%ED%83%9D%EB%8B%B4%EB%B3%B4%EB%8C%80%EC%B6%9C%EC%97%90%20%EB%8C%80%ED%95%9C%20%EB%A6%AC%EC%8A%A4%ED%81%AC%20%EA%B4%80%EB%A6%AC%20%EA%B8%B0%EC%A4%80%20%ED%96%89%EC%A0%95%EC%A7%80%EB%8F%84.pdf&sysFileName=9150b4d6f5564462ab5cf218254697e9.pdf";
const URL_828_OTHER = "https://better.fsc.go.kr/fsc_new/file/displayFile.do?filePath=/2026/08/28&orgFileName=%EB%8B%A4%EB%A5%B8%EB%AC%B8%EC%84%9C.hwp";
const URL_513 = "https://better.fsc.go.kr/fsc_new/file/displayFile.do?filePath=/2026/05/13&orgFileName=260513_x.pdf";

describe("문서 분류", () => {
  it("URL 경로에서 날짜를 읽는다", () => {
    expect(dateFromUrl(URL_828)).toBe("2026-08-28");
    expect(dateFromUrl("https://www.fsc.go.kr/no010101/87517")).toBeUndefined();
  });
  it("8.28 행정지도 = 새 문서 + 원문 등록됨, 5.13판 = 이전 문서", () => {
    expect(classify(URL_828, dateFromUrl(URL_828))).toEqual({ status: "new", originalId: "admin-guidance-260828" });
    expect(classify(URL_513, dateFromUrl(URL_513)).status).toBe("old");
    expect(matchOriginal(URL_513)).toBeUndefined();
  });
  it("같은 날 올라온 다른 파일은 8.28 행정지도로 보지 않는다(리뷰 H3)", () => {
    expect(matchOriginal(URL_828_OTHER)).toBeUndefined();
    expect(classify(URL_828_OTHER, dateFromUrl(URL_828_OTHER))).toEqual({ status: "new", originalId: undefined });
  });
  it("문서 번호는 경계까지 맞아야 '반영됨'(87517 ≠ 875170)", () => {
    expect(classify("https://www.fsc.go.kr/comm/getFile?upperNo=875170&fileNo=1", "2026-09-01").status).toBe("new");
  });
  it("KB v1에 반영된 8.13·4.1 문서는 '반영됨'", () => {
    expect(classify("https://www.fsc.go.kr/no010101/87517?srchCtgry=", "2026-08-13").status).toBe("known");
    expect(classify("https://www.fsc.go.kr/comm/getFile?srvcId=BBSTY1&upperNo=86606&fileNo=5", undefined).status).toBe("known");
  });
  it("근거 자료 v2가 적용 중이면 v2에 이미 반영한 문서는 새 문서가 아니라 '반영됨'(새 문서 = 지금 근거 자료에 없는 문서)", () => {
    expect(classify(URL_828, dateFromUrl(URL_828), "v2")).toMatchObject({ status: "known", originalId: "admin-guidance-260828" });
    expect(classify("https://www.mois.go.kr/frt/sub/a06/b06/populationDecline/screen.do", undefined, "v2").status).toBe("known");
    expect(classify("https://www.law.go.kr/admRulInfoP.do?admRulSeq=1", "2026-10-20", "v2", "인구감소지역 및 인구감소관심지역 지정 고시").status).toBe("known");
    // 예전 고시(2024)와 v2에 없는 다른 새 문서는 그대로
    expect(classify("http://www.law.go.kr/admRulInfoP.do?admRulSeq=2100000236722", "2024-02-27", "v2", "인구감소지역 지정 변경 고시").status).toBe("old");
    expect(classify(URL_828_OTHER, dateFromUrl(URL_828_OTHER), "v2").status).toBe("new");
  });
  it("날짜 없는 미등록 문서는 '날짜 미상'", () => {
    expect(classify("https://better.fsc.go.kr/fsc_new/status/adminMap/OpertnDetail.do?postNo=1", undefined).status).toBe("undated");
  });
});

describe("원문 대조", () => {
  it("PDF 추출본의 띄어쓰기 차이는 무시한다", () => {
    expect(squash("행정지도 시행일 이후")).toBe("행정지도시행일이후");
    expect(quoteFound("행정지도 시행일 이후 신규대출 신청분부터 적용", "ㅇ (신규대출)행정지도시행일이후신규대출신청분부터적용")).toBe(true);
  });
  it("원문에 없는 문장·너무 짧은 인용은 통과하지 못한다", () => {
    expect(quoteFound("매도계약 예외에서 가계약은 인정하지 않는다", "가계약은 인정하지 않음(임대차)")).toBe(false);
    expect(quoteFound("적용", "적용")).toBe(false);
  });
  it("유사도는 같은 내용일수록 높다", () => {
    expect(similarity("보증금 미반환 증빙: 내용증명", "보증금 미반환 사실 증빙(내용증명)")).toBeGreaterThan(similarity("보증금 미반환 증빙", "이주비 LTV"));
  });
});

describe("저장 원문과 조항 대응", async () => {
  const orig = await fetchOriginal(getOriginal("admin-guidance-260828")!, URL_828, { skipDownload: true });
  it("등록된 두 섹션을 원문에서 잘라 낸다", () => {
    expect(orig.sections.map((s) => s.label)).toHaveLength(2);
    expect(orig.sections[1].text).toContain("전세대출 관련 경과조치");
    expect(orig.hashMatch).toBe(false); // 다운로드 생략 시 일치 주장 안 함
  });
  it("경과조치 인용 → 원문 통과 + F828-01 새 Fact", () => {
    const c = check(
      {
        topic: "경과조치",
        policy: "8.13",
        summary: "8.13 발표일 이후 12.31까지 만기도래 건은 종전 규정으로 만기연장 심사",
        // 실제 감시 실행(11/13)에서 Router가 뽑은 인용문
        quote: "발표일 (’26.8.13일) 이후 시행일 전일 (‘26.12.31일) 중\n만기도래 건에대해서는종전 규정에따라만기연장 심사 진행",
      },
      orig.sections,
      getOriginal("admin-guidance-260828"),
    );
    expect(c.verified).toBe(true);
    expect(c.diff).toBe("new");
    expect(c.match?.id).toBe("F828-01");
  });
  it("4.1 경과조치는 4.1 쪽 Fact(F828-07·F401)에만 대응한다", () => {
    const c = check(
      { topic: "경과조치", policy: "4.1", summary: "4.1 발표일 이후 4.16까지 만기도래 건은 종전 규정으로 만기연장 심사", quote: "발표일(’26.4.1일) 이후시행일전일(‘26.4.16일)\n중만기도래건*에대해서는종전 규정에따라만기연장 심사 진행" },
      orig.sections,
    );
    expect(c.verified).toBe(true);
    expect(c.match?.id === "F828-07" || c.match?.id.startsWith("F401")).toBe(true);
  });
  it("대응은 인용문으로만 계산한다: 요약이 과장돼도 대응·판정이 바뀌지 않는다(리뷰 M2)", () => {
    const base = {
      topic: "경과조치" as const,
      policy: "8.13" as const,
      quote: "발표일 (’26.8.13일) 이후 시행일 전일 (‘26.12.31일) 중\n만기도래 건에대해서는종전 규정에따라만기연장 심사 진행",
    };
    const a = check({ ...base, summary: "종전 규정으로 연장 심사" }, orig.sections);
    const b = check({ ...base, summary: "모든 비거주 1주택자 연장 허용, 증빙 불필요, 보증비율 그대로" }, orig.sections);
    expect(b.match).toEqual(a.match);
  });
  it("지어낸 인용은 버린다", () => {
    const c = check({ topic: "예외", policy: "8.13", summary: "가계약도 매도계약으로 인정", quote: "매도계약에는 가계약도 포함하여 인정한다" }, orig.sections);
    expect(c).toMatchObject({ verified: false, diff: "rejected" });
  });
});

it("영향 분석: KB v1→v2로 결론이 바뀌는 문항은 경과조치 4개", () => {
  const r = impact();
  expect(r.total).toBe(45);
  expect(r.changed.map((c) => `${c.id}:${c.v1}→${c.v2}`)).toEqual(["A19:보류→조건부", "A20:보류→조건부", "B02:보류→조건부", "C07:보류→불허"]);
  expect(r.changed.every((c) => c.newFacts.length > 0)).toBe(true);
});
