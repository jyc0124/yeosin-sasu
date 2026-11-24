// 대표 업무 흐름 3건의 증거 기록: 질문 → Liner가 읽은 조건 → (고객 답) → 최종 판정 카드 → 근거 → 본점 이관.
// 앱의 /api/judge를 그대로 호출해 응답을 docs/EVIDENCE_CASES.md로 남긴다(실시간 Liner 호출, 캐시를 비운 서버 권장).
// 사용: (LOANDESK_CACHE_DIR=<빈 폴더> npm run dev) 후  node scripts/tools/evidence-cases.mjs [http://localhost:3000] [기준일]
import fs from "fs";
import { execSync } from "child_process";

const BASE = process.argv[2] ?? "http://localhost:3000";
const AS_OF = process.argv[3] ?? new Date().toISOString().slice(0, 10);
const LABEL = { 허용: "가능", 조건부: "조건 충족 시 가능", 불허: "불가", 역질문: "고객 확인 필요", 심사위: "심사위 상정", 보류: "본점 문의", 내부지침: "은행 지침 확인", 안내: "안내" };
const commit = execSync("git rev-parse --short HEAD").toString().trim();

async function judge(body) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/judge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ asOf: AS_OF, ...body }) });
  const out = { ms: 0, firstMs: null, extracted: null, verdict: null, error: null };
  // 스트림을 받는 대로 읽어 첫 반응 시각을 잰다
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const lines = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const l = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!l.trim()) continue;
      if (out.firstMs == null) out.firstMs = Date.now() - t0;
      lines.push(l);
    }
  }
  if (buf.trim()) lines.push(buf);
  for (const line of lines) {
    const m = JSON.parse(line);
    if (m.type === "extracted") out.extracted = m;
    if (m.type === "verdict") out.verdict = m;
    if (m.type === "error") out.error = m.message;
  }
  out.ms = Date.now() - t0;
  return out;
}

const caseLine = (c) => Object.entries(c ?? {}).filter(([k]) => k !== "asOf" && k !== "module").map(([k, v]) => `\`${k}: ${JSON.stringify(v)}\``).join(" · ");
const card = (v, title = "판정 카드") => {
  if (!v) return "- (판정 없음)";
  const L = [`- **${title}: ${LABEL[v.verdict] ?? v.verdict}** — ${v.headline}`];
  if (v.conditions?.length) L.push(`- 조건·주의: ${v.conditions.join(" / ")}`);
  if (v.questions?.length) L.push(`- 고객에게 물을 것: ${v.questions.join(" / ")}`);
  if (v.factRefs?.length) L.push(`- 근거(정부 발표 자료 문장 번호): ${v.factRefs.map((f) => `${f.id}(${f.sourceTitle?.replace(/「|」/g, "") ?? f.source})`).join(", ")}`);
  if (v.gapRefs?.length) L.push(`- 정부 자료에 없는 쟁점: ${v.gapRefs.map((g) => `${g.id} ${g.topic}${g.resolved ? "(해소됨)" : ""}`).join(", ")}`);
  if (v.trace?.length) L.push(`- 판정 경로(규칙 엔진): ${v.trace.map((t) => `${t.step} → ${t.result}`).join(" ⟶ ")}`);
  return L.join("\n");
};
const timing = (r) => `첫 반응 ${r.firstMs != null ? (r.firstMs / 1000).toFixed(1) + "초" : "-"} · 판정까지 ${(r.ms / 1000).toFixed(1)}초`;

const md = [];
md.push(`# 대표 업무 흐름 3건 — 증거 기록`, ``);
md.push(`> 앱의 판정 API(/api/judge)를 그대로 호출한 응답입니다. **실시간 Liner 호출**(캐시를 비운 서버) · 기준일 ${AS_OF} · 코드 ${commit} · 생성 ${new Date().toISOString().slice(0, 16)} UTC · \`node scripts/tools/evidence-cases.mjs\``);
md.push(`> 판정 코드는 규칙 엔진이 정하고, Liner Router는 고객 말을 조건으로 읽습니다. 조건 항목 이름은 코드 내부 이름 그대로입니다.`, ``);

// ① 되묻기 → 고객 답 → 다시 판정
const q1 = "내년 2월 전세 만기 고객이에요. 서울 아파트 분양받고 한 번도 안 살고 바로 전세 줬대요. 본인은 경기도 전세 살고요. 연장 돼요?";
const a1 = "세입자가 어머니예요";
const r1a = await judge({ question: q1, kb: "v2" });
const r1b = await judge({ question: q1, followUps: [a1], kb: "v2" });
md.push(`## ① 모르면 먼저 묻고, 고객 답으로 다시 판정 (전세대출 · 비거주 1주택)`, ``);
md.push(`**질문**: ${q1}`, ``);
md.push(`- Liner Router가 읽은 조건: ${caseLine(r1a.extracted?.case)}`, card(r1a.verdict, "1차 판정"), `- 시간: ${timing(r1a)}`, ``);
md.push(`**고객 답(문장 그대로)**: ${a1}`, ``);
md.push(`- Liner Router가 다시 읽은 조건: ${caseLine(r1b.extracted?.case)}`, card(r1b.verdict, "다시 판정"), `- 시간: ${timing(r1b)}`, ``);

// ② 정책 감시 전후: 근거 자료 v1(보도자료·FAQ) ↔ v2(Liner가 찾은 8.28 행정지도 반영)
const q2 = "비거주 1주택 해당하는 고객인데 전세 만기가 올해 12/20이에요. 이번 연장도 막혀요?";
const r2 = await judge({ question: q2, kb: "v1" });
md.push(`## ② Liner가 찾은 문서 한 건으로 판정이 바뀜 (근거 자료 v1 → v2)`, ``);
md.push(`**질문**: ${q2}`, ``);
md.push(`- Liner Router가 읽은 조건: ${caseLine(r2.extracted?.case)}`);
md.push(card(r2.verdict, "근거 자료 v1(보도자료·FAQ만)"));
md.push(card(r2.verdict?.compare, "근거 자료 v2(+ Liner가 찾은 8.28 행정지도)"));
md.push(`- 시간: ${timing(r2)} · 같은 조건으로 두 근거 자료를 함께 판정(조건 추출 1회)`, ``);

// ③ 지점이 확답하면 안 되는 질문 → 본점 이관
const q3 = "다주택자 주담대 만기연장 여부를 확인하는데, 같은 주민등록등본에 있는 자녀·자녀의 배우자·손자의 주택도 합산하나요? 주택 수 산정 대상과 조회 동의 대상을 구분해 주세요.";
const r3 = await judge({ question: q3, kb: "v2" });
md.push(`## ③ 정부 기준이 일부만 있는 질문 → 확인된 것과 쟁점을 나눠 본점으로 (현장 질문 FQ5-1)`, ``);
md.push(`**질문**: ${q3}`, ``);
md.push(`- Liner Router가 읽은 조건: ${caseLine(r3.extracted?.case)}`, card(r3.verdict), `- 시간: ${timing(r3)}`, ``);
md.push(
  `**본점 이관(화면 흐름, 11/24 자동 점검)**: 이 판정 카드의 [본점 질의서 작성] → 개인정보 확인 → 보내기 → 본점 '질의 처리' 배지 1 → 본점이 회신 승인(본점 화면에는 외부기관에 묻기 전 공식 출처를 찾는 'Liner 사전 조사'가 함께 있음, 이 점검에서는 누르지 않음) → 본점 배지 0 · 지점 '내 질의' 배지 1 → 같은 질문을 다시 판정하면 카드에 "본점이 이미 답한 쟁점(FAQ-0001)" 표시. 심사위 상정 흐름(서류 접수 → 개최일 계산 → 결과 통보)도 같은 점검에서 단계마다 배지가 오가는 것을 확인했습니다(같은 브라우저의 지점·본점 창 기준).`,
  ``,
);
for (const [n, r] of [["①-1", r1a], ["①-2", r1b], ["②", r2], ["③", r3]]) if (r.error) md.push(`> ⚠ ${n} 오류: ${r.error}`);
fs.writeFileSync("docs/EVIDENCE_CASES.md", md.join("\n") + "\n");
console.log("저장: docs/EVIDENCE_CASES.md", [r1a, r1b, r2, r3].map((r) => `${LABEL[r.verdict?.verdict] ?? r.error} ${(r.ms / 1000).toFixed(1)}s`).join(" | "));
