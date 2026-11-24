// 오류 방향 분류(docs/QUALITY_PRINCIPLES.md §1): 같은 1개 오류라도 무게가 다르다.
// 관대한 오류 = 정답은 막거나(불허)·확인해야(보류·역질문·심사위) 하는데 허용·조건부로 답함 → 잘못 승인될 위험(1순위)
// 보수적 오류 = 답이 있는데(허용·조건부·불허·안내) 보류·역질문으로 넘김 → 불편하지만 사고 아님
export type Direction = "ok" | "permissive" | "conservative" | "form" | "other";
const STOP = new Set(["불허", "보류", "역질문", "심사위"]);
const GO = new Set(["허용", "조건부"]);

export function direction(expect: string, got: string | undefined): Direction {
  const exp = expect.split("|");
  if (got && exp.includes(got)) return "ok";
  if (!got) return "other";
  // 허용인데 정답이 조건부뿐 → 조건 없이 허용(관대)
  if (got === "허용" && exp.every((e) => e === "조건부" || STOP.has(e))) return "permissive";
  if (GO.has(got) && exp.every((e) => STOP.has(e))) return "permissive";
  if ((got === "보류" || got === "역질문") && exp.some((e) => GO.has(e) || e === "불허" || e === "안내")) return "conservative";
  if (got === "안내" || exp.includes("안내") || got === "OUT" || exp.includes("OUT")) return "form";
  return "other";
}

export function tally(rows: { expect?: string; got?: string }[]) {
  const t: Record<Direction, number> = { ok: 0, permissive: 0, conservative: 0, form: 0, other: 0 };
  for (const r of rows) if (r.expect) t[direction(r.expect, r.got)]++;
  return t;
}
export const tallyText = (t: ReturnType<typeof tally>) =>
  `오류 방향: 관대한 오류(잘못 승인 위험) ${t.permissive} · 보수적 오류(본점으로 넘김) ${t.conservative} · 형식(안내·범위 밖) ${t.form} · 기타(불허↔허용 등) ${t.other}`;
