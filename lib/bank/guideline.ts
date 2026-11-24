// 가상 A은행 지침(data/bank/A은행_여신업무지침.md)을 조항 단위로 읽는다. 화면 공개용(시연용 가상 문서).
import { readFileSync } from "node:fs";
import path from "node:path";

export type Block = { kind: "item"; n: string; text: string; subs: string[] } | { kind: "table"; rows: string[][] } | { kind: "text"; text: string };

export interface Article {
  no: number; // 제N조
  title: string; // (목적)
  delegated?: string; // — 이후: 위임 근거
  blocks: Block[];
}

export interface Guideline {
  title: string;
  notes: string[]; // 머리말 인용문
  articles: Article[];
}

export const GUIDELINE_FILE = path.join(process.cwd(), "data/bank/A은행_여신업무지침.md");

export function parseGuideline(md: string): Guideline {
  const lines = md.split("\n");
  const title = (lines.find((l) => l.startsWith("# ")) ?? "").replace(/^#\s+/, "");
  const notes: string[] = [];
  const articles: Article[] = [];
  let cur: Article | undefined;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const h = line.match(/^##\s+제(\d+)조\s*\(([^)]+)\)\s*(?:—\s*(.+))?$/);
    if (h) {
      cur = { no: Number(h[1]), title: h[2], delegated: h[3]?.trim(), blocks: [] };
      articles.push(cur);
      continue;
    }
    if (!cur) {
      if (line.startsWith(">")) notes.push(line.replace(/^>\s?/, ""));
      continue;
    }
    if (!line.trim() || line.trim() === "---") continue;
    const item = line.match(/^(\d+)\.\s+(.*)$/);
    const sub = line.match(/^\s+-\s+(.*)$/);
    const row = line.match(/^\s*\|(.+)\|\s*$/);
    const last = cur.blocks[cur.blocks.length - 1];
    if (item) cur.blocks.push({ kind: "item", n: item[1], text: item[2], subs: [] });
    else if (row) {
      const cells = row[1].split("|").map((c) => c.trim());
      if (cells.every((c) => /^-+$/.test(c))) continue; // 표 구분선
      if (last?.kind === "table") last.rows.push(cells);
      else cur.blocks.push({ kind: "table", rows: [cells] });
    } else if (sub && last?.kind === "item") last.subs.push(sub[1]);
    else cur.blocks.push({ kind: "text", text: line.trim() });
  }
  return { title, notes, articles };
}

export function loadGuideline(): Guideline {
  return parseGuideline(readFileSync(GUIDELINE_FILE, "utf8"));
}

/** 조항이 이 시제품에서 쓰이는 곳. 'engine'은 규칙 엔진 판정 문구가 직접 인용하는 조항. */
export const ARTICLE_USE: Record<number, { kind: "engine" | "hq" | "guard" | "reference"; text: string; examples: string[] }> = {
  2: { kind: "engine", text: "판정 '내부지침': 임대업이 주된 영업인지 판단할 때 이 기준을 안내합니다.", examples: ["B15"] },
  3: { kind: "engine", text: "판정 '심사위': 지점은 확답하지 않고 상정 서류를 안내합니다. 다른 은행 사례는 근거로 쓰지 않습니다(5항).", examples: ["C05", "A17", "C06"] },
  4: { kind: "engine", text: "실제로 살았다는데 증빙이 전입신고 기록뿐이고 보조 서류가 없으면 '보류'로 두고 본점에 질의합니다. 실제로 안 살았다면 이 조항이 아니라 실거주가 아닌 것으로 봅니다(C01, 불허).", examples: ["C01"] },
  5: { kind: "engine", text: "판정 자체는 정부 발표 자료로 하고, 이 조항은 단기 연장(6개월 이내 1회)·보증금 미반환(1년 이내)·신뢰보호(고객 진술만으로 불인정)의 기간·서류 안내에 인용합니다.", examples: ["B08", "B07", "C02", "B09"] },
  6: { kind: "hq", text: "본점 질의 화면: 질의서 항목, 3영업일 회신 기한·긴급 표시, 사례 FAQ 재사용, 외부기관 문의.", examples: ["C02", "C05"] },
  7: { kind: "guard", text: "모든 판정·회신: 규제 회피 방법을 안내하지 않고(1항), 확정되지 않은 것은 단정하지 않습니다(2항). 본점 회신 입력도 이 기준으로 점검합니다.", examples: ["C07"] },
};
