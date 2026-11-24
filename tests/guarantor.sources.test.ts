// 보증기관 확인 자료(data/guarantor/sources.json)의 발췌는 공식 문서 원문 그대로여야 한다.
// 원문: data/research_guarantor/raw(2026-11-23 공식 사이트에서 받은 문서). 띄어쓰기·줄바꿈만 무시하고 대조한다.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import data from "@/data/guarantor/sources.json";

const RAW: Record<string, string> = {
  "HF-GL": "hf_guideline.txt",
  "HF-GEN": "hf_general.txt",
  "HF-CHG": "hf_change.txt",
  "HUG-FAQ": "hug_relax.txt",
  "HUG-BTM": "hug_jeonse_loan.txt",
  "HUG-ANSIM": "hug_ansim_rendered.txt",
  "NHUF-BTM": "nhuf_btm_main.txt",
  "NHUF-ADD": "nhuf_btm_add.txt",
};
// 각주 표시(*, 주1))는 양쪽에서 뺀다
const squash = (s: string) => s.replace(/주\d\)/g, "").replace(/\*/g, "").replace(/\s+/g, "").replace(/[‧·∙]/g, "·").replace(/[∼~]/g, "~").replace(/[–-]/g, "-");

describe("보증기관 발췌 = 원문", () => {
  for (const e of data.excerpts) {
    it(`${e.id} (${e.where})`, () => {
      const raw = squash(readFileSync(`data/research_guarantor/raw/${RAW[e.source]}`, "utf8"));
      for (const line of e.quote.split("\n")) {
        // '기한연장:'처럼 페이지의 소제목을 붙인 줄은 소제목을 빼고, [표]는 칸 값만 대조한다
        const body = line.replace(/^[^—\n]{2,20} — /, "").replace(/^(기한연장|목적물 변경|대출대상|대출한도|대출기간):\s*/, "").replace(/^\[표\]\s*/, "");
        const parts = line.startsWith("[표]") ? body.split(/\s*\/\s*|\s(?=\d)/).filter(Boolean) : body.split(/\.\s(?=[가-힣(])/);
        for (const p of parts) expect(raw, `${e.id}: "${p}"`).toContain(squash(p.replace(/\.$/, "")));
      }
    });
  }
  it("모든 발췌의 출처가 목록에 있다", () => {
    const ids = new Set(data.sources.map((s) => s.id));
    for (const e of data.excerpts) expect(ids.has(e.source)).toBe(true);
  });
});
