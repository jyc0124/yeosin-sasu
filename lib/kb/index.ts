// 근거 원문 조회: Fact ID → 원문 문장·출처. 판정 카드의 "근거 원문" 표시에 쓴다.
import kb from "@/data/kb/facts.json";
import anchors from "@/data/kb/anchors.json";

export interface FactRef {
  id: string;
  text: string;
  source: string; // 예: "813본 Ⅲ-1-나"
  sourceTitle?: string;
  url?: string;
  /** 게시 페이지 안에서 찾을 위치(예: "보도자료 첨부 3") */
  urlNote?: string;
  /** 공식 첨부와 같은 원본 파일 저장본(공식 사이트가 직접 연결을 막아도 열린다) */
  file?: { href: string; ext: string };
  /** 우리 앱의 원문 보기 주소(항상 있음): 원문 텍스트에서 해당 구절을 강조해 보여 준다 */
  viewer: string;
  kb: string;
}
export interface GapRef {
  id: string;
  topic: string;
  note: string;
  resolved: boolean;
}

type RawFact = { id: string; text: string; source: string; kb: string };
type RawSource = { abbr: string; title: string; url?: string };

const FACTS = new Map((kb.facts as RawFact[]).map((f) => [f.id, f]));
const GAPS = new Map((kb.gaps as GapRef[]).map((g) => [g.id, g]));
// 약칭이 긴 것부터 맞춰야 "813FAQ"가 "813"에 먼저 걸리지 않는다
const SOURCES = [...(kb.sources as RawSource[])].sort((a, b) => b.abbr.length - a.abbr.length);

/** "https://... (첨부 3)" 같은 표기에서 URL만 뽑는다 */
const urlOf = (s?: string) => s?.match(/https?:\/\/\S+/)?.[0];
// Fact가 실제로 인용된 문서의 공식 게시 페이지(FAQ처럼 facts.json에 주소가 없는 출처도 채운다)
const ANCHOR = anchors as { docs: Record<string, { page: string; pageNote?: string; file?: string }>; facts: Record<string, { doc: string }> };
const docOf = (id: string) => {
  const a = ANCHOR.facts[id];
  return a ? { abbr: a.doc, ...ANCHOR.docs[a.doc] } : undefined;
};

export function resolveFacts(ids: string[]): FactRef[] {
  return ids.flatMap((id) => {
    const f = FACTS.get(id);
    if (!f) return [];
    const src = SOURCES.find((s) => f.source.startsWith(s.abbr));
    const doc = docOf(f.id);
    return [{ id: f.id, text: f.text, source: f.source, sourceTitle: src?.title, url: doc?.page ?? urlOf(src?.url), urlNote: doc?.pageNote, file: doc?.file ? { href: `/api/source-file/${encodeURIComponent(doc.abbr)}`, ext: doc.file.split(".").pop()!.toUpperCase() } : undefined, viewer: `/source/${f.id}`, kb: f.kb }];
  });
}

/** 원문 공백(해석 쟁점) 전체 — 본점 정책 감시의 쟁점 조사 목록 */
export function allGaps(): GapRef[] {
  return [...GAPS.values()];
}

export function resolveGaps(ids: string[]): GapRef[] {
  return ids.flatMap((id) => (GAPS.has(id) ? [GAPS.get(id)!] : []));
}

// ── 절(clause): 긴 Fact를 혼자 읽어도 뜻이 통하는 문장으로 나눈 것(data/kb/clauses.json) ──
// 기준 답변(lib/basis)은 LLM이 문장을 쓰지 않고 이 절을 고르기만 한다 → 화면 문장은 검수된 절 그대로.
// 절이 없는 짧은 Fact는 Fact 문장 자체가 절 하나다.
import clauseData from "@/data/kb/clauses.json";
const CLAUSES = (clauseData as unknown as { clauses: Record<string, string[]> }).clauses;
export interface ClauseRef {
  /** 'F828-11#3' */
  id: string;
  fact: string;
  text: string;
}
export function clausesOf(factIds: string[]): ClauseRef[] {
  return factIds.flatMap((fact) => {
    const f = FACTS.get(fact);
    if (!f) return [];
    const cs = CLAUSES[fact]?.length ? CLAUSES[fact] : [f.text];
    return cs.map((text, i) => ({ id: `${fact}#${i + 1}`, fact, text }));
  });
}
