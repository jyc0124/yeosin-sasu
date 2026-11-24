import { describe, expect, it } from "vitest";
import { parsePartialJson } from "@/lib/extract/partial";

describe("parsePartialJson", () => {
  it("완성된 JSON은 그대로", () => {
    expect(parsePartialJson('{"a":1,"b":[1,2]}')).toEqual({ a: 1, b: [1, 2] });
  });
  it("끝나지 않은 마지막 항목은 버리고 괄호를 닫는다", () => {
    expect(parsePartialJson('{"module":"M2","m2":{"houseCount":2,"maturityDa')).toEqual({ module: "M2", m2: { houseCount: 2 } });
  });
  it("문자열 안의 쉼표·괄호는 무시한다", () => {
    expect(parsePartialJson('{"label":"서울, {강남}","x":tr')).toEqual({ label: "서울, {강남}" });
  });
  it("배열 속 객체도 완성된 것만", () => {
    expect(parsePartialJson('{"houses":[{"region":"서울"},{"region":"경')).toEqual({ houses: [{ region: "서울" }, {}] });
  });
  it("아직 아무것도 없으면 undefined", () => {
    expect(parsePartialJson('')).toBeUndefined();
    expect(parsePartialJson('{')).toEqual({});
  });
});
