// 화면 줄바꿈: 문장 단위로 나누되 날짜·고시 번호의 점에서는 나누지 않는다
import { describe, expect, it } from "vitest";
import { splitSentences } from "@/app/_components/Lines";

describe("splitSentences", () => {
  it("문장 끝에서 나눈다", () => {
    expect(splitSentences("원문은 기준이 없습니다. 단정하지 말고 본점에 질의하세요.")).toEqual(["원문은 기준이 없습니다.", "단정하지 말고 본점에 질의하세요."]);
  });
  it("날짜·숫자 사이 점, 괄호 안 약어에서는 나누지 않는다", () => {
    expect(splitSentences("만기일이 '26.12.31 이전이면 8.13 대책 경과조치가 적용됩니다.")).toHaveLength(1);
  });
  it("닫는 따옴표·괄호 뒤 문장 끝과 줄바꿈도 나눈다", () => {
    expect(splitSentences('기준은 없습니다(원문 공백 G-01). A은행은 다릅니다.\n창구 안내: "확인 후 안내드리겠습니다." 단정하지 않습니다.')).toEqual([
      "기준은 없습니다(원문 공백 G-01).",
      "A은행은 다릅니다.",
      '창구 안내: "확인 후 안내드리겠습니다."',
      "단정하지 않습니다.",
    ]);
  });
});
