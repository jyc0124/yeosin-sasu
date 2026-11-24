// 스트리밍 중인(끝나지 않은) JSON을 지금까지 확실한 부분만 살려 파싱한다.
// 화면에 '읽는 중' 조건을 먼저 보여 주는 용도. 판정에는 쓰지 않는다(판정은 완성된 추출 결과로만).
export function parsePartialJson(text: string): unknown {
  // 1) 마지막으로 '안전하게 자를 수 있는' 위치: 컨테이너가 열린 직후, 또는 쉼표 직전(마지막 미완성 항목 버림)
  let inStr = false;
  let esc = false;
  let cut = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") cut = i + 1;
    else if (ch === ",") cut = i;
    else if (ch === "}" || ch === "]") cut = i + 1;
  }
  if (cut < 0) return undefined;
  const head = text.slice(0, cut);
  // 2) 자른 부분에서 아직 열린 괄호를 순서대로 닫는다
  const stack: string[] = [];
  inStr = false;
  esc = false;
  for (const ch of head) {
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  try {
    return JSON.parse(head + stack.reverse().join(""));
  } catch {
    return undefined;
  }
}
