// 기준 조회 태그 어휘(data/kb/tags.json). 추출 스키마와 근거 조회가 같은 목록을 쓴다.
import tags from "@/data/kb/tags.json";

const T = tags as unknown as { regs: Record<string, string>; concepts: Record<string, string> };
export const REGS = Object.keys(T.regs);
export const CONCEPTS = Object.keys(T.concepts);
export const REG_LABEL = T.regs;
export const CONCEPT_LABEL = T.concepts;
