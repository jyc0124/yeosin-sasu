// 근거 원문 위치 찾기: Fact ID → 원문 문서(공식 자료에서 추출한 텍스트)와 강조할 줄.
// 위치 정보는 data/kb/anchors.json(사람이 원문에서 그대로 고른 구절). 서버에서만 쓴다(fs).
import { readFileSync } from "node:fs";
import path from "node:path";
import anchors from "@/data/kb/anchors.json";

export interface SourceDoc {
  abbr: string;
  title: string;
  publisher: string;
  date: string;
  text: string;
  file?: string;
  page: string;
  pageNote?: string;
}

interface Anchor {
  doc: string;
  quotes: string[];
  range?: boolean;
  note?: string;
}

const DOCS = anchors.docs as Record<string, Omit<SourceDoc, "abbr">>;
const FACTS = anchors.facts as Record<string, Anchor>;
const TEXT_DIR = path.join(process.cwd(), "data", "official", "text");
export const FILE_DIR = path.join(process.cwd(), "data", "official");

export const docOf = (abbr: string): SourceDoc | undefined => (DOCS[abbr] ? { abbr, ...DOCS[abbr] } : undefined);
export const anchorOf = (factId: string): Anchor | undefined => FACTS[factId];
export const anchoredFactIds = () => Object.keys(FACTS);

const norm = (s: string) => s.replace(/\s+/g, "");

export interface Located {
  doc: SourceDoc;
  lines: string[];
  /** 강조할 줄 번호(0부터) */
  highlight: number[];
  /** 찾지 못한 구절(정상이면 비어 있음) */
  missing: string[];
  note?: string;
}

/** 원문에서 Fact 구절의 위치를 찾는다. 공백은 무시하고, 구절은 앞 구절 뒤에서 차례로 찾는다. */
export function locate(factId: string): Located | undefined {
  const a = FACTS[factId];
  const doc = a && docOf(a.doc);
  if (!a || !doc) return undefined;
  const lines = readFileSync(path.join(TEXT_DIR, doc.text), "utf8").split("\n");
  // 공백을 뺀 전체 문자열과, 그 문자 하나하나가 몇 번째 줄인지
  let flat = "";
  const lineOf: number[] = [];
  lines.forEach((l, i) => {
    const n = norm(l);
    flat += n;
    for (let k = 0; k < n.length; k++) lineOf.push(i);
  });
  const hit = new Set<number>();
  const missing: string[] = [];
  let pos = 0;
  for (const q of a.quotes) {
    const nq = norm(q);
    const at = flat.indexOf(nq, pos);
    if (at < 0) {
      missing.push(q);
      continue;
    }
    for (let k = at; k < at + nq.length; k++) hit.add(lineOf[k]);
    pos = at + nq.length;
  }
  let highlight = [...hit].sort((x, y) => x - y);
  if (a.range && highlight.length > 1) {
    const [lo, hi] = [highlight[0], highlight[highlight.length - 1]];
    highlight = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }
  return { doc, lines, highlight, missing, note: a.note };
}
