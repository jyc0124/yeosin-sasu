// 안내 문구 API도 판정 API처럼 개인정보로 보이는 질문은 외부(Liner)로 보내기 전에 거절한다(Liner 호출 없음)
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/explain/route";

const req = (question: string) =>
  new Request("http://localhost/api/explain", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, case: { module: "M2", houseCount: 2 }, kb: "v2" }),
  });

describe("POST /api/explain 개인정보 차단", () => {
  it("휴대전화 번호가 있으면 400으로 거절", async () => {
    const r = await POST(req("고객 연락처 010-1234-5678, 다주택 만기연장 되나요?"));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/개인정보/);
  });
});
