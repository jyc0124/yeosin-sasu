// 데모 영상 v2: 사람이 녹음한 장면별 음성(S00~S10.wav)에 맞춰
//  - 설명 장면은 애니메이션 슬라이드(청록 = 여신 사수, 남보라 = Liner)
//  - 실제 화면 장면은 재생 모드 서버를 조작하며 Liner가 일하는 곳을 스포트라이트와 라벨로 짚는다.
// 출력: raw/*.webm + timeline.json(장면 시작 시각) → compose.py가 음성과 합친다.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:3000";
const W = 1600, H = 900;
const DIR = new URL(".", import.meta.url).pathname;
const N = Object.fromEntries(JSON.parse(fs.readFileSync(DIR + "narration.json", "utf8")).map((n) => [n.id, n]));
const LOGO = `<svg viewBox="0 0 32 32" width="34" height="34"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#179483"/><stop offset="1" stop-color="#0a655a"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#g)"/><g transform="translate(4 4)" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><circle cx="15.5" cy="6.5" r="3"/><path d="M10.5 20v-1.5a5 5 0 0 1 10 0V20"/><circle cx="8" cy="10" r="2.5"/><path d="M3.5 20v-1a4.5 4.5 0 0 1 7-3.7"/></g></svg>`;

const browser = await chromium.launch({ channel: "chrome", headless: false });
const context = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: DIR + "raw", size: { width: W, height: H } }, locale: "ko-KR" });
const OVERLAY_CSS = `nextjs-portal{display:none!important}
#__cap{position:fixed;left:50%;bottom:30px;transform:translateX(-50%);max-width:1240px;width:max-content;z-index:2147483646;background:rgba(15,23,42,.84);color:#fff;
 font:600 21px/1.5 "Apple SD Gothic Neo","Pretendard",sans-serif;padding:10px 20px;border-radius:12px;text-align:center;word-break:keep-all;pointer-events:none;transition:opacity .25s}
#__cap:empty{opacity:0;padding:0}
#__tag{position:fixed;right:26px;top:20px;z-index:2147483646;background:#0f766e;color:#fff;font:700 16px/1 "Apple SD Gothic Neo",sans-serif;padding:9px 14px;border-radius:999px;pointer-events:none;box-shadow:0 4px 14px rgba(15,118,110,.3)}
#__tag:empty{display:none}
#__rp{position:fixed;right:22px;bottom:18px;z-index:2147483646;background:rgba(15,23,42,.66);color:#fff;font:600 13px/1.2 "Apple SD Gothic Neo",sans-serif;padding:6px 10px;border-radius:8px;pointer-events:none}
.__hl{position:absolute;z-index:2147483640;border-radius:14px;pointer-events:none;animation:__pop .45s cubic-bezier(.2,.9,.3,1.2) both}
.__hl.liner{border:3px solid #4f46e5;box-shadow:0 0 0 9999px rgba(15,23,42,.30),0 0 0 6px rgba(79,70,229,.22)}
.__hl.code{border:3px solid #0f766e;box-shadow:0 0 0 9999px rgba(15,23,42,.30),0 0 0 6px rgba(15,118,110,.22)}
.__lb{position:absolute;z-index:2147483641;pointer-events:none;max-width:520px;padding:12px 16px 13px;border-radius:14px;color:#fff;font:400 16px/1.45 "Apple SD Gothic Neo",sans-serif;
 box-shadow:0 12px 32px rgba(15,23,42,.28);animation:__rise .5s ease .12s both;word-break:keep-all}
.__lb.liner{background:linear-gradient(135deg,#4338ca,#6d28d9)}.__lb.code{background:linear-gradient(135deg,#0f766e,#115e59)}
.__lb i{display:inline-block;font-style:normal;font-size:12px;font-weight:800;letter-spacing:.08em;background:rgba(255,255,255,.2);border-radius:6px;padding:2px 7px;margin-bottom:6px}
.__lb b{display:block;font-size:20px;font-weight:800;letter-spacing:-.01em}.__lb span{display:block;margin-top:2px;opacity:.92}
@keyframes __pop{from{opacity:0;transform:scale(1.04)}to{opacity:1;transform:none}}
@keyframes __rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.__panel{position:fixed;z-index:2147483642;right:48px;top:110px;width:560px;background:#fff;border-radius:22px;padding:26px 28px;box-shadow:0 24px 60px rgba(15,23,42,.35);
 font-family:"Apple SD Gothic Neo",sans-serif;color:#0f172a;animation:__rise .6s ease both}
`;
const page = await context.newPage();
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;
const sleep = (s) => page.waitForTimeout(Math.max(0, s) * 1000);

let cap = "", tag = "";
const pump = setInterval(() => {
  page.evaluate(([c, t, css]) => {
    if (!document.body || !document.head) return;
    if (!document.getElementById("__ovcss")) { const s = document.createElement("style"); s.id = "__ovcss"; s.textContent = css; document.head.appendChild(s); }
    for (const id of ["__cap", "__tag"]) if (!document.getElementById(id)) { const d = document.createElement("div"); d.id = id; document.body.appendChild(d); }
    // 앱 화면에는 재생 데모임을 늘 표시한다(슬라이드에는 없음). 원본 파일 해시 대조는 재생 중에도 실제로 한다
    if (!document.getElementById("__rp") && !document.querySelector(".hd")) { const r = document.createElement("div"); r.id = "__rp"; r.textContent = "Liner 응답: 11/23 실제 호출을 저장해 재생"; document.body.appendChild(r); }
    const a = document.getElementById("__cap"), b = document.getElementById("__tag");
    if (a.textContent !== c) a.textContent = c; if (b.textContent !== t) b.textContent = t;
  }, [cap, tag, OVERLAY_CSS]).catch(() => {});
}, 200);

const timeline = [];
// 대사 문장별 시작 시각(자막과 같은 기준). 화면 강조는 고정 초가 아니라 해당 문장이 시작될 때 띄운다
const SENT = {};
function narrate(id) {
  const n = N[id]; const start = now(); timeline.push({ id, start });
  const parts = n.text.split(/(?<=[.?!])\s+/).filter(Boolean);
  const total = parts.reduce((a, p) => a + p.length, 0); let acc = 0;
  SENT[id] = [];
  // 문장 시작 시각: make.sh가 실제 녹음의 쉼에 맞춰 둔 값(starts)을 쓰고, 없으면 글자 수 비율로 추정
  parts.forEach((p, k) => { const at = n.starts?.length === parts.length ? n.starts[k] : (acc / total) * n.dur; acc += p.length; SENT[id].push(start + at); setTimeout(() => { cap = p; }, at * 1000); });
  setTimeout(() => { if (cap === parts.at(-1)) cap = ""; }, (n.dur + 0.2) * 1000);
  return start + n.dur;
}
const until = async (t, pad = 0.4) => { await sleep(t + pad - now()); };
const sent = (id, k, pad = 0.1) => until(SENT[id][k], pad);
// 강조를 다음 문장 시작(또는 장면 끝)까지 유지할 시간(ms)
const holdTo = (t, min = 1800) => Math.max(min, Math.round((t - now()) * 1000));

// ── 실제 화면 도우미 ───────────────────────────
const go = async (path) => { await page.goto(BASE + path, { waitUntil: "domcontentloaded" }); await sleep(1.0); };
const scrollTo = (y) => page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), y);
const scrollToLoc = async (loc, offset = 140) => { const b = await loc.boundingBox({ timeout: 2500 }).catch(() => null); if (b) { await page.evaluate(([y, o]) => window.scrollBy({ top: y - o, behavior: "smooth" }), [b.y, offset]); await sleep(0.7); } };
const ask = async (q) => {
  await go("/?view=judge");
  const ta = page.getByPlaceholder(/다주택 고객 서울 아파트/);
  await ta.scrollIntoViewIfNeeded(); await ta.click(); await ta.pressSequentially(q, { delay: 14 });
  await sleep(0.3);
  await page.getByRole("button", { name: "판정하기" }).click();
  await page.waitForFunction(() => /기준일 20/.test(document.body.innerText), null, { timeout: 30000 });
  await sleep(0.6); await scrollTo(0); await sleep(0.6);
};
// 스포트라이트 + 라벨. kind: liner(남보라) | code(청록)
async function callout(loc, { kind = "liner", eyebrow = "LINER API", title, sub = "", pos = "auto", ms = 4500, pad = 8 }) {
  const b = await loc.boundingBox({ timeout: 2500 }).catch(() => null); if (!b) return false;
  await page.evaluate(([b, kind, eyebrow, title, sub, pos, ms, pad]) => {
    const sx = window.scrollX, sy = window.scrollY;
    const hl = document.createElement("div"); hl.className = "__hl " + kind;
    Object.assign(hl.style, { left: b.x + sx - pad + "px", top: b.y + sy - pad + "px", width: b.width + pad * 2 + "px", height: b.height + pad * 2 + "px" });
    const lb = document.createElement("div"); lb.className = "__lb " + kind;
    lb.innerHTML = `<i>${eyebrow}</i><b>${title}</b>${sub ? `<span>${sub}</span>` : ""}`;
    document.body.append(hl, lb);
    const lw = lb.offsetWidth, lh = lb.offsetHeight;
    let x = Math.min(Math.max(b.x - pad, 20), innerWidth - lw - 20);
    let y;
    const below = b.y + b.height + pad + 14, above = b.y - pad - lh - 14;
    if (pos === "right" && b.x + b.width + pad + 18 + lw < innerWidth - 10) { x = b.x + b.width + pad + 18; y = Math.max(20, b.y); }
    else if (pos === "left" && b.x - pad - 18 - lw > 10) { x = b.x - pad - 18 - lw; y = Math.max(20, b.y); }
    else y = (pos === "above" || (pos === "auto" && below + lh > innerHeight - 90)) && above > 10 ? above : below;
    lb.style.left = x + sx + "px"; lb.style.top = y + sy + "px";
    setTimeout(() => { hl.remove(); lb.remove(); }, ms);
  }, [b, kind, eyebrow, title, sub, pos, ms, pad]);
  return true;
}
const card = (re) => page.getByText(re).first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]");

// ── 슬라이드 ──────────────────────────────────
const SLIDE_CSS = `*{box-sizing:border-box}body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#f8fafc;color:#0f172a;font-family:"Apple SD Gothic Neo","Pretendard",sans-serif;word-break:keep-all}
.hd{position:absolute;left:56px;top:40px;display:flex;align-items:center;gap:12px;font-weight:800;font-size:20px;color:#0f172a}.hd small{font-weight:600;color:#64748b;font-size:15px;margin-left:6px}
.ft{position:absolute;right:56px;top:46px;font-size:14px;font-weight:700;letter-spacing:.08em;color:#94a3b8}
.wrap{position:absolute;left:96px;right:96px;top:140px;bottom:120px}
.ey{font-size:18px;font-weight:800;letter-spacing:.06em;color:#0f766e;text-transform:uppercase}.ey.ln{color:#4f46e5}
h1{font-size:54px;line-height:1.2;margin:10px 0 0;letter-spacing:-.025em}h2{font-size:40px;line-height:1.25;margin:8px 0 0;letter-spacing:-.02em}
.mut{color:#64748b}.teal{color:#0f766e}.ln{color:#4f46e5}.red{color:#be123c}
.in{opacity:0;animation:up .7s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d,0s)}
.fade{opacity:0;animation:fd .8s ease both;animation-delay:var(--d,0s)}
@keyframes up{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}@keyframes fd{to{opacity:1}}
.cardx{background:#fff;border:1px solid #e2e8f0;border-radius:22px;padding:26px 28px;box-shadow:0 10px 30px rgba(15,23,42,.06)}
.bar{height:26px;border-radius:999px;background:#e2e8f0;overflow:hidden}.bar>i{display:block;height:100%;width:0;border-radius:999px;animation:gr 1.4s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d,0s)}
@keyframes gr{to{width:var(--w)}}
.pill{display:inline-block;padding:6px 12px;border-radius:999px;font-size:15px;font-weight:800}
.big{font-size:64px;font-weight:900;letter-spacing:-.03em;line-height:1}
`;
const slide = async (inner, { eyebrow = "" } = {}) => {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${SLIDE_CSS}</style></head><body>
  <div class="hd">${LOGO}여신 사수<small>${eyebrow}</small></div><div class="ft">LINER .EXE-THON</div><div class="wrap">${inner}</div>
  <script>for(const e of document.querySelectorAll('[data-count]')){const to=+e.dataset.count,dur=+e.dataset.dur||1400,del=(+e.dataset.delay||0)*1000,dec=+e.dataset.dec||0,suf=e.dataset.suf||'';e.textContent=(0).toFixed(dec)+suf;setTimeout(()=>{const s=performance.now();const f=t=>{const p=Math.min(1,(t-s)/dur),v=to*(1-Math.pow(1-p,3));e.textContent=v.toFixed(dec).replace(/\\B(?=(\\d{3})+(?!\\d))/g,',')+suf;if(p<1)requestAnimationFrame(f)};requestAnimationFrame(f)},del)}</script>
  </body></html>`);
};

try {
  // ── S00 만든 이유와 문제 ───────────────────────
  // 문장 0·1: 지점 직원의 고충 → 문장 2: 규정이 덧붙는 구조·걸리는 시간 → 문장 3: Liner가 잘하는 일 + 제목
  await slide(`
   <div class="in" style="--d:.2s"><span class="ey">만든 이유</span><h1 style="font-size:54px">지점 직원들의 고충에서 시작했습니다</h1><p class="mut" style="font-size:22px;margin-top:10px">시중은행 지점 직원 커뮤니티에서 들은 이야기</p></div>
   <div style="display:flex;gap:18px;margin-top:40px;align-items:stretch">
     ${[["정부 대책은 계속 바뀌고", "세부 지침은 늦게 내려옴"], ["규정 찾기 · 본점 회신 대기", "퇴근이 늦어짐"], ["“이 대출 연장 되나요?”", "급한 고객에게 제때 답하지 못함"]].map(([t, s], i) => `
     <div class="cardx in" style="--d:${(1.0 + i * 1.1).toFixed(1)}s;flex:1;${i === 2 ? "border:3px solid #be123c;background:#fff1f2" : ""}">
       <div style="font-size:27px;font-weight:900;line-height:1.3">${t}</div><div style="font-size:21px;margin-top:10px;font-weight:700" class="red">${s}</div></div>`).join("")}
   </div>`, { eyebrow: "은행 지점 창구 직원을 위한 대출 규제 판정 에이전트" });
  let end = narrate("S00");
  await sent("S00", 2, 0);
  await slide(`
   <div class="in" style="--d:.1s"><span class="ey">창구의 현실</span><h1 style="font-size:52px">결정적인 내용은 2주 뒤 문서에만</h1></div>
   <div style="display:flex;gap:18px;margin-top:36px;align-items:stretch">
     ${[["8.13", "보도자료", "대책 발표"], ["8.13", "FAQ", "자주 묻는 질문"], ["8.28", "행정지도", "경과조치·증액 조건은 여기에만"]].map(([d, t, s], i) => `
     <div class="cardx in" style="--d:${(0.3 + i * 0.7).toFixed(1)}s;flex:1;${i === 2 ? "border:3px solid #be123c;background:#fff1f2" : ""}">
       <div class="mut" style="font-weight:800">2026.${d}</div><div style="font-size:34px;font-weight:900;margin-top:4px">${t}</div><div style="font-size:19px;margin-top:6px" class="${i === 2 ? "red" : "mut"}">${s}</div></div>
     ${i < 2 ? `<div class="fade" style="--d:${(0.3 + i * 0.7 + 0.4).toFixed(1)}s;align-self:center;font-size:34px;color:#94a3b8">→</div>` : ""}`).join("")}
   </div>
   <div style="display:flex;gap:18px;margin-top:28px">
     <div class="cardx in" style="--d:2.4s;flex:1"><div class="big teal">30분</div><div style="font-size:20px;margin-top:8px">해석 질문 하나에 걸리는 시간(길게)</div></div>
     <div class="cardx in" style="--d:3.0s;flex:1"><div class="big teal">2~3일</div><div style="font-size:20px;margin-top:8px">본점이 외부기관 게시판에 묻고 기다릴 때</div></div>
     <div class="cardx in" style="--d:3.6s;flex:1"><div class="big teal">6만 건</div><div style="font-size:20px;margin-top:8px">8.13 영향권 전세대출(금융위)</div></div>
   </div>
   <p class="mut fade" style="--d:3.6s;font-size:14px;margin-top:10px">소요 시간: 현직 지점 직원 1명 응답 기준</p>`, { eyebrow: "은행 지점 창구 직원을 위한 대출 규제 판정 에이전트" });
  await sent("S00", 3, 0);
  await slide(`<div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:flex-start">
    <p class="in" style="--d:.1s;font-size:26px;margin:0 0 22px;background:#eef2ff;color:#3730a3;border-radius:14px;padding:12px 20px;font-weight:800">출처가 붙은 최신 문서 찾기 = Liner가 가장 잘하는 일</p>
    <div class="in" style="--d:.4s">${LOGO.replace('width="34" height="34"', 'width="88" height="88"')}</div>
    <h1 class="in" style="--d:.6s;font-size:84px;margin-top:22px">여신 사수</h1>
    <p class="in" style="--d:.9s;font-size:30px;margin:12px 0 0" >규정 막힐 때 바로 묻는 대출 규제 사수</p>
    <p class="in mut" style="--d:1.2s;font-size:20px;margin-top:14px">은행 지점 창구 직원을 위한 대출 규제 판정 에이전트 · 정부 공개 자료와 가상 사례(가상 A은행)만 사용</p></div>`);
  await until(end);

  // ── S01 Liner에서 시작 ─────────────────────────
  const d1 = N.S01.dur;
  await slide(`
   <span class="ey ln in">Day 1 · 2026.11.13</span><h2 class="in" style="--d:.2s">시작은 <span class="ln">Liner</span>였습니다</h2>
   <div style="display:flex;gap:20px;margin-top:34px">
     <div class="cardx in" style="--d:${(d1 * 0.12).toFixed(1)}s;flex:1.1;border:2px solid #c7d2fe">
       <span class="pill" style="background:#eef2ff;color:#4338ca">Liner 검색 실험 · $0.13</span>
       <div style="font-size:30px;font-weight:900;margin-top:14px">보도자료 어디에도 없던<br><span class="ln">8.28 행정지도</span>를 찾음</div>
       <div class="mut" style="font-size:18px;margin-top:10px">전세대출 경과조치·증액 조건이 담긴 실제 집행 기준</div></div>
     <div class="cardx in" style="--d:${(d1 * 0.38).toFixed(1)}s;flex:1;border:2px solid #fecdd3">
       <span class="pill" style="background:#fff1f2;color:#be123c">같이 확인한 한계</span>
       <div style="font-size:28px;font-weight:900;margin-top:14px">Search Agent 요약은<br>실행마다 달라짐</div>
       <div class="mut" style="font-size:18px;margin-top:10px">경과조치를 거꾸로 읽는 경우도 확인</div></div>
   </div>
   <div style="display:flex;align-items:center;gap:16px;margin-top:34px">
     ${[["#4f46e5", "Liner가 찾고 · 읽고", "새 정부 문서 · 고객 말"], ["#d97706", "사람이 확인하고", "원문 대조 · 본점 승인"], ["#0f172a", "코드가 판정한다", "규칙 엔진 · 근거 번호"]].map(([c, t, s], i) => `
       <div class="in" style="--d:${(d1 * 0.62 + i * 0.9).toFixed(1)}s;flex:1;background:${c};color:#fff;border-radius:18px;padding:20px 22px"><div style="font-size:27px;font-weight:900">${t}</div><div style="opacity:.85;font-size:17px;margin-top:4px">${s}</div></div>
       ${i < 2 ? `<div class="fade" style="--d:${(d1 * 0.62 + i * 0.9 + 0.4).toFixed(1)}s;font-size:30px;color:#94a3b8">→</div>` : ""}`).join("")}
   </div>`, { eyebrow: "Liner와 만든 설계" });
  end = narrate("S01");
  await until(end);

  // ── S02 일반 LLM 비교 ──────────────────────────
  const d2 = N.S02.dur;
  await slide(`
   <span class="ey in">일반 LLM에 고객 상황만 물었을 때</span><h2 class="in" style="--d:.2s">ChatGPT(웹 검색 켬) · 고객 질문 6개</h2>
   <div style="display:flex;gap:20px;margin-top:30px">
     <div class="cardx in" style="--d:${(d2 * 0.2).toFixed(1)}s;flex:1"><div class="mut" style="font-weight:800">8.28 행정지도 인용</div><div class="big red" style="margin-top:8px">0 / 6</div></div>
     <div class="cardx in" style="--d:${(d2 * 0.4).toFixed(1)}s;flex:2">
       <div class="mut" style="font-size:17px">“연장하면서 대출금을 증액하면 바뀐 규정이 적용되나요?”</div>
       <div style="font-size:24px;font-weight:800;margin-top:6px">→ “2026년 12월에 완료되는 연장에는 원칙적으로 적용되지 않습니다.”</div>
       <div class="red" style="font-size:16px;margin-top:6px;font-weight:700">정부 원문: 만기연장 시 대출금액을 증액하면 변경된 규정 적용 (위험 오답)</div></div>
   </div>
   <div class="cardx in" style="--d:${(d2 * 0.65).toFixed(1)}s;margin-top:20px">
     <div class="mut" style="font-size:17px">“전세 만기가 내년 1/5인데 12월에 미리 연장하면 규제 안 걸리죠?”</div>
     <div style="font-size:24px;font-weight:800;margin-top:6px">→ 후속 질문으로 “12월 중 전세대출 만기일 자체를 앞당겨 연장할 수 있나요?” 제안</div></div>
   <p class="mut fade" style="--d:${(d2 * 0.65).toFixed(1)}s;font-size:14px;margin-top:12px">2026.11.22·11.16 실제 대화 발췌(저장소 data/compare). 추론 High.</p>`, { eyebrow: "왜 그냥 LLM이면 안 되나" });
  end = narrate("S02");
  await until(end);

  // ── S03 ① 위험한 질문 ──────────────────────────
  tag = "① 위험한 질문 → 불가";
  end = narrate("S03");
  await ask("전세 만기가 내년 1월 5일인데 12월에 미리 연장하면 규제 안 걸리죠?");
  await sent("S03", 1);
  await callout(page.getByText("이번 판단에 사용한 조건").first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]"), { title: "Liner Router · 고객 말 → 판정 조건", sub: "만기일 · 조기 연장 시도 등을 읽음 · 첫 반응 약 2.6초", ms: holdTo(SENT.S03[2]) });
  await sent("S03", 2);
  const v1 = card(/^불가$/);
  await callout(v1, { kind: "code", eyebrow: "규칙 엔진(코드)", title: "판정은 코드가 내립니다", sub: "만기 '27.1.5 → 경과조치 불가 · 회피 방법 안내 안 함", pos: "auto", ms: holdTo(SENT.S03[5]) });
  await sent("S03", 5);
  await callout(card(/근거 · 정부 발표 자료/), { kind: "code", eyebrow: "근거 추적", title: "정부 발표 자료 원문 + Fact 번호", sub: "Liner가 찾은 8.28 행정지도 조항 포함", pos: "left", ms: holdTo(end) });
  await until(end);

  // ── S04 ② 모르면 묻는다 ────────────────────────
  tag = "② 모르면 먼저 묻는다";
  end = narrate("S04");
  await ask("내년 2월 전세 만기 고객이에요. 서울 아파트 분양받고 한 번도 안 살고 바로 전세 줬대요. 본인은 경기도 전세 살고요. 연장 돼요?");
  const free = page.getByPlaceholder(/서울 아파트이고 대출금은 그대로예요/);
  await scrollToLoc(free, 260);
  await free.click(); await free.pressSequentially("세입자가 어머니예요", { delay: 40 });
  await callout(free, { title: "Liner Router · 고객 답 → 조건", sub: "문장 그대로 적어도 다시 조건으로 읽음", pos: "above", ms: 2600 });
  await sleep(2.6);
  await page.getByRole("button", { name: "문장으로 판정" }).click();
  await page.waitForFunction(() => /\n가능\n기준일/.test(document.body.innerText), null, { timeout: 30000 });
  await sleep(0.5); await scrollTo(0); await sleep(0.6);
  await callout(card(/^가능$/), { kind: "code", eyebrow: "다시 판정", title: "고객 확인 필요 → 가능", sub: "가족에게 임대한 경우는 규제 대상이 아님", ms: 4200 });
  await until(end, 1.2);

  // ── S05 ③ 본점·심사위 ─────────────────────────
  tag = "③ 지점이 답하면 안 되는 건 본점으로";
  end = narrate("S05");
  await ask("집 사고 들어가려 했는데 계약 직후 지방 발령 나서 한 번도 못 살았대요. 이건 봐주죠?");
  await page.getByRole("button", { name: "심사위 상정 요청" }).click(); await sleep(0.8);
  const req = page.getByText("심사위 상정 요청", { exact: true }).last().locator("xpath=ancestor::*[contains(@class,'rounded')][1]");
  await scrollToLoc(req, 90);
  await callout(req, { kind: "code", eyebrow: "자동 작성", title: "판정 카드 → 본점 질의서", sub: "고객 상황·근거 조항·쟁점이 채워져 본점이 다시 묻지 않음", pos: "auto", ms: 3200 });
  await sleep(2.0);
  const pii = page.getByLabel(/개인정보가 들어 있지 않음을 확인/); await pii.scrollIntoViewIfNeeded(); await pii.check(); await sleep(0.3);
  await page.getByRole("button", { name: "본점에 보내기" }).click(); await sleep(0.8);
  tag = "③ 본점 · 질의 처리";
  await go("/hq?view=judge");
  await page.locator("button", { hasText: "지방 발령" }).first().click(); await sleep(0.8);
  await page.getByPlaceholder(/결론 한 줄/).pressSequentially("여신심사위원회 상정 — 지점은 발령 공문·매매계약서를 받아 접수", { delay: 8 });
  const reply = page.getByPlaceholder(/회신 내용/);
  if (!(await reply.inputValue())) await reply.pressSequentially("인정 여부는 여신심사위원회가 정합니다. 지점은 확답하지 말고 서류를 받아 주세요.", { delay: 6 });
  const cb = page.locator("input[type=checkbox]").first(); await cb.scrollIntoViewIfNeeded(); await cb.check(); await sleep(0.4);
  await page.getByRole("button", { name: /회신 승인/ }).click(); await sleep(0.8);
  tag = "③ 지점 · 서류만 체크";
  await go("/inquiries?view=judge"); await sleep(0.6);
  const doc = page.locator("input[type=checkbox]").first(); await doc.scrollIntoViewIfNeeded(); await doc.check(); await sleep(0.4);
  await page.getByRole("button", { name: /서류 접수 완료/ }).click(); await sleep(1.0);
  await sent("S05", 2);
  await callout(page.getByText(/심사위.*2026\.12|개최/).first(), { kind: "code", eyebrow: "에이전트", title: "안건 등록 · 개최일 · 결과 통보", sub: "상정 결정은 본점, 이후 절차는 에이전트", ms: 2600 });
  await sleep(1.6);

  // ── S06 ④ 정책 감시 ───────────────────────────
  await until(end, 0.2);
  await until(end, 0.2);
  tag = "④ Liner 정책 감시";
  end = narrate("S06a1");
  await go("/watch?view=judge");
  const v1btn = page.getByRole("button", { name: /v1으로 되돌리기/ });
  await scrollToLoc(v1btn, 330);
  await callout(v1btn, { kind: "code", eyebrow: "되돌려 보기", title: "근거 자료 v1으로 되돌리기", sub: "8.28 행정지도를 찾기 전 · 보도자료·FAQ만", pos: "auto", ms: 2400 });
  await sleep(1.5);
  await v1btn.click(); await sleep(0.3);
  await until(end, 0.15);
  await go("/?view=judge");
  { const ta = page.getByPlaceholder(/다주택 고객 서울 아파트/); await ta.scrollIntoViewIfNeeded(); await ta.click();
    end = narrate("S06a2");
    await ta.pressSequentially("비거주 1주택 해당하는 고객인데 전세 만기가 올해 12/20이에요. 이번 연장도 막혀요?", { delay: 12 });
    await page.getByRole("button", { name: "판정하기" }).click();
    await page.waitForFunction(() => /기준일 20/.test(document.body.innerText), null, { timeout: 30000 });
    await sleep(0.3); await scrollTo(0); await sleep(0.4); }
  await callout(card(/^본점 문의$/), { kind: "code", eyebrow: "근거 자료 v1 · 보도자료·FAQ만", title: "정부 발표 자료에 답이 없음 → 본점 문의", sub: "틀린 확답 대신 멈춤", ms: 3400 });
  await until(end, 1.4);
  end = narrate("S06b");
  await go("/watch?view=judge");
  await page.getByRole("button", { name: /감시 실행/ }).click();
  const approve = page.getByRole("button", { name: /승인하고 근거 자료 v2 적용/ });
  await approve.waitFor({ timeout: 30000 }); await sleep(0.6);
  const srch = page.getByText(/Liner 검색 결과/).first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]");
  await scrollToLoc(srch, 200);
  await sent("S06b", 1);
  await callout(srch, { title: "Liner Search API · MCP search_legal", sub: "감시 질의 6회로 후속 정부 문서를 찾음", pos: "auto", ms: holdTo(SENT.S06b[2] - 0.8) });
  await until(SENT.S06b[2], -0.8);
  const newf = page.getByText(/새로 생긴 근거/).first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]");
  await scrollToLoc(newf, 200);
  await callout(newf, { title: "Liner Router · 행정지도 → 조항 정리", sub: "원본 해시 일치 · 인용 18/18 대조를 통과한 것만", pos: "auto", ms: holdTo(SENT.S06b[3] - 0.6) });
  await until(SENT.S06b[3], -0.6);
  await approve.scrollIntoViewIfNeeded();
  await callout(approve, { kind: "code", eyebrow: "사람이 확인", title: "담당자 승인해야만 반영", sub: "시제품: 미리 규칙화한 문서 1건을 이 브라우저에서 전환 · 운영 시 전 지점", pos: "auto", ms: 2600 });
  await until(end, -0.6);
  await approve.click(); await sleep(0.4);
  await until(end, 0.4);
  end = narrate("S06c");
  await ask("비거주 1주택 해당하는 고객인데 전세 만기가 올해 12/20이에요. 이번 연장도 막혀요?");
  await callout(card(/^조건 충족 시 가능$/), { kind: "code", eyebrow: "근거 자료 v2", title: "본점 문의 → 조건 충족 시 가능", sub: "경과조치('26.12.31까지 만기)와 증액 조건까지", ms: holdTo(SENT.S06c[1]) });
  await sent("S06c", 1);
  await page.evaluate(() => {
    const p = document.createElement("div"); p.className = "__panel"; p.id = "__eff";
    p.innerHTML = `<div style="font-size:14px;font-weight:800;letter-spacing:.06em;color:#4f46e5">LINER가 찾은 문서 1건의 효과</div>
      <div style="font-size:26px;font-weight:900;margin:6px 0 18px">8.28 행정지도</div>
      <div style="font-size:15px;color:#64748b;font-weight:700">최신 정보가 필요한 질문 정답률 (6문항)</div>
      <div style="display:flex;align-items:center;gap:12px;margin-top:8px"><span style="width:58px;font-weight:800;color:#64748b">이전</span><div style="flex:1;height:22px;border-radius:99px;background:#e2e8f0;overflow:hidden"><i style="display:block;height:100%;width:0;background:#94a3b8;border-radius:99px;transition:width 1.2s"></i></div><b style="width:64px;text-align:right;font-size:22px">33%</b></div>
      <div style="display:flex;align-items:center;gap:12px;margin-top:8px"><span style="width:58px;font-weight:800;color:#4f46e5">이후</span><div style="flex:1;height:22px;border-radius:99px;background:#e2e8f0;overflow:hidden"><i style="display:block;height:100%;width:0;background:linear-gradient(90deg,#4f46e5,#7c3aed);border-radius:99px;transition:width 1.4s .3s"></i></div><b style="width:64px;text-align:right;font-size:22px;color:#4f46e5">100%</b></div>
      <div style="display:flex;gap:12px;margin-top:20px"><div style="flex:1;background:#eef2ff;border-radius:14px;padding:14px"><div style="font-size:40px;font-weight:900;color:#4338ca">15<span style="font-size:20px">문항</span></div><div style="font-size:14px;color:#475569">이 문서로 정답이 된 문항(모든 질문 세트)</div></div>
      <div style="flex:1;background:#f0fdfa;border-radius:14px;padding:14px"><div style="font-size:40px;font-weight:900;color:#0f766e">0<span style="font-size:20px">원</span></div><div style="font-size:14px;color:#475569">엔진 변경 없음 · 문서만 추가</div></div></div>`;
    document.body.appendChild(p);
    requestAnimationFrame(() => { const bars = p.querySelectorAll("i"); bars[0].style.width = "33%"; bars[1].style.width = "100%"; });
  });
  await until(end, 0.8);

  // ── S07 ⑤ 답이 없는 쟁점 ──────────────────────
  tag = "⑤ 답이 없는 쟁점";
  end = narrate("S07");
  await ask("다주택 고객인데 분양권도 하나 있어요. 서울 아파트 주담대 만기 12월 연장 돼요?");
  await callout(card(/^본점 문의$/), { kind: "code", eyebrow: "안전장치", title: "규칙에 없는 사실(분양권) → 확답하지 않음", sub: "본점 문의로 넘기고 쟁점 대장에 기록", ms: 3600 });
  await sleep(3.8);
  await go("/watch?view=judge");
  const row = page.locator("li").filter({ hasText: "판정 규칙에 없는 사실" }).filter({ has: page.getByRole("button", { name: /Liner로/ }) }).first();
  await row.scrollIntoViewIfNeeded(); await sleep(0.4);
  await row.getByRole("button", { name: /Liner로/ }).click(); await sleep(1.4);
  await callout(row, { title: "Liner Search API · 해석 쟁점 사전 조사", sub: "외부기관에 묻기 전 공식 출처부터 · 1건 2~3초 · $0.002", pos: "auto", ms: holdTo(SENT.S07[3]) });
  await sent("S07", 3);
  await page.evaluate(() => {
    const p = document.createElement("div"); p.className = "__panel"; p.style.top = "120px"; p.style.width = "500px";
    p.innerHTML = `<div style="font-size:14px;font-weight:800;letter-spacing:.06em;color:#4f46e5">LINER SEARCH API</div><div style="font-size:24px;font-weight:900;margin:6px 0 12px">보증기관 공식 문서 8건 연결</div>
    <div style="font-size:16px;line-height:1.7;color:#334155">HF 전세자금보증 업무지침 · HUG 상환능력 심사 FAQ · 버팀목 추가대출 안내 등<br><span style="color:#64748b">Liner 검색 18회($0.018)와 공식 사이트 확인으로 찾음 · 판정에는 쓰지 않고 원문만 연결</span></div>`;
    document.body.appendChild(p);
  });
  await until(end, 0.6);

  // ── S08 Liner가 맡은 일 ────────────────────────
  tag = "";
  const d8 = N.S08.dur;
  await slide(`
   <span class="ey ln in">Liner API가 맡은 일</span><h2 class="in" style="--d:.2s">에이전트의 <span class="ln">앞 · 뒤 · 바깥</span>을 Liner가 맡습니다</h2>
   <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;margin-top:30px">
     ${[["앞", "Liner Router", "고객 말 → 판정 조건", "모든 판정의 입구 · 스트리밍 첫 반응 약 2.6초"], ["뒤", "Liner Router", "고객 안내 문구", "검수된 정부 발표 자료 문장만 골라 136문장 모두 원문 대조 통과"], ["바깥", "Search API · MCP", "새 정부 문서 감시", "8.28 행정지도 발견 · 쟁점 사전 조사 · 보증기관 문서 8건"]].map(([k, api, t, s], i) => `
     <div class="cardx in" style="--d:${(d8 * 0.18 + i * d8 * 0.12).toFixed(1)}s;border:2px solid #c7d2fe">
       <span class="pill" style="background:#4f46e5;color:#fff">${k}</span><span class="pill" style="background:#eef2ff;color:#4338ca;margin-left:6px">${api}</span>
       <div style="font-size:28px;font-weight:900;margin-top:14px">${t}</div><div class="mut" style="font-size:17px;margin-top:8px;line-height:1.5">${s}</div></div>`).join("")}
   </div>
   <div class="in" style="--d:${(d8 * 0.18 + d8 * 0.06).toFixed(1)}s;margin:16px auto 0;width:420px;text-align:center;background:#0f172a;color:#fff;border-radius:16px;padding:14px"><b style="font-size:22px">판정은 규칙 엔진(코드)</b><div style="opacity:.75;font-size:15px">Liner의 결과는 원문 대조 · 사람 승인 뒤에만 판정에 들어감</div></div>
   <div style="display:flex;gap:18px;margin-top:20px">
     <div class="cardx in" style="--d:${(d8 * 0.72).toFixed(1)}s;flex:1;padding:18px 24px"><div class="big ln" style="font-size:48px">$<span data-count="0.026" data-dec="3" data-delay="${(d8 * 0.72).toFixed(1)}"></span></div><div class="mut" style="font-size:17px">창구 판정 1건 Liner 비용(실측)</div></div>
     <div class="cardx in" style="--d:${(d8 * 0.8).toFixed(1)}s;flex:1;padding:18px 24px"><div class="big ln" style="font-size:48px"><span data-count="577" data-delay="${(d8 * 0.8).toFixed(1)}"></span>개</div><div class="mut" style="font-size:17px">반복 시험한 질문 · credits API로 사용액 확인</div></div>
   </div>`, { eyebrow: "Liner API 활용" });
  end = narrate("S08");
  await until(end);

  // ── S09 결과 ──────────────────────────────────
  // 카드 등장 시점은 앞 세 문장(원래 녹음 21.6초) 기준. 넷째 문장(현장 의견 반영)은 아래에서 장면을 바꿔 보여 준다
  const d9 = Math.min(N.S09.dur, 21.6);
  const seg = (n, c) => `<i style="--w:${(n / 6) * 100}%;--d:${(d9 * 0.12).toFixed(1)}s;background:${c};display:inline-block;height:100%;width:0;animation:gr 1.2s both;animation-delay:var(--d)"></i>`;
  await slide(`
   <span class="ey in">결과</span><h2 class="in" style="--d:.2s">위험한 오답은 0, 모르면 확답하지 않습니다</h2>
   <div class="cardx in" style="--d:${(d9 * 0.08).toFixed(1)}s;margin-top:26px">
     <div class="mut" style="font-weight:800">같은 고객 질문 6개 (2026.11.22)</div>
     ${[["ChatGPT 웹 검색 켬", [[2, "#10b981", "맞음 2"], [3, "#f59e0b", "부분 3"], [1, "#e11d48", "위험 1"]]], ["여신 사수", [[5, "#10b981", "맞음 5"], [1, "#94a3b8", "되물음 1"]]]].map(([nm, ss]) => `
     <div style="display:flex;align-items:center;gap:16px;margin-top:14px"><b style="width:190px;font-size:20px">${nm}</b>
       <div style="flex:1;height:30px;border-radius:999px;background:#f1f5f9;overflow:hidden;display:flex">${ss.map(([n, c]) => seg(n, c)).join("")}</div>
       <span style="width:250px;font-size:17px;font-weight:700">${ss.map(([, , l]) => l).join(" · ")}</span></div>`).join("")}
   </div>
   <div style="display:flex;gap:18px;margin-top:20px">
     ${[["45/45", "테스트 질문 정답", "실무 쟁점 · 개발에 사용"], ["41/41", "처음 보는 질문", "틀린 확답 0"], ["11곳", "AI 독립 검토로 찾은 위험 경로", "모두 차단 · 판정 재확인 3,497건"]].map(([v, t, s], i) => `
     <div class="cardx in" style="--d:${(d9 * 0.42 + i * d9 * 0.12).toFixed(1)}s;flex:1"><div class="big teal">${v}</div><div style="font-size:21px;font-weight:800;margin-top:8px">${t}</div><div class="mut" style="font-size:16px;margin-top:2px">${s}</div></div>`).join("")}
   </div>
   <p class="mut fade" style="--d:${(d9 * 0.42).toFixed(1)}s;font-size:14px;margin-top:10px">평가 문항과 정답은 직접 정했고 세트당 1회 실행 · 자세한 결과는 배포 사이트 '평가 결과'</p>`, { eyebrow: "평가" });
  end = narrate("S09");
  // 넷째 문장 "현직 지점 직원의 의견 16개는 …"이 시작될 때 현장 의견 반영 장면으로
  if (SENT.S09.length > 3) {
    await sent("S09", 3, 0);
    await slide(`
     <span class="ey in">현장 의견 반영</span><h2 class="in" style="--d:.15s">현장이 지적하면 고치고, 다시 확인받았습니다</h2>
     <div style="display:flex;gap:18px;margin-top:34px;align-items:stretch">
       ${[["11.22", "현직 지점 직원 사용 검토", "실제 질문 · 사용 후기 · UI 수정안", "#e2e8f0", "#334155"], ["11.23", "의견 16개 하나씩 대조·회신", "반영 8 · 일부 5 · 못 함 3 (이유까지)", "#ccfbf1", "#0f766e"], ["11.24", "고친 화면 재확인", "남은 지적 1건 당일 반영", "#0f766e", "#fff"]].map(([d, t, s, bg, fg], i) => `
       ${i ? `<div class="fade" style="--d:${(0.5 + i * 1.2).toFixed(1)}s;align-self:center;font-size:34px;color:#94a3b8">→</div>` : ""}
       <div class="cardx in" style="--d:${(0.4 + i * 1.2).toFixed(1)}s;flex:1"><span class="pill" style="background:${bg};color:${fg}">${d}</span><div style="font-size:26px;font-weight:900;margin-top:14px;line-height:1.3">${t}</div><div class="mut" style="font-size:17px;margin-top:8px">${s}</div></div>`).join("")}
     </div>
     <div class="in" style="--d:3.6s;margin:28px auto 0;width:640px;text-align:center;background:#0f766e;color:#fff;border-radius:18px;padding:18px 22px"><b style="font-size:30px">“사용성이 많이 좋아졌습니다”</b><div style="opacity:.85;font-size:16px;margin-top:4px">현직 지점 직원 재확인(11.24, 1명)</div></div>`, { eyebrow: "현장 검증" });
  }
  await until(end);

  // ── S10 확장과 마무리 ──────────────────────────
  await slide(`
   <span class="ey in">확장</span><h2 class="in" style="--d:.2s">같은 규제를 따르는 곳으로 넓힙니다</h2>
   <div style="display:flex;gap:18px;margin-top:30px;align-items:stretch">
     <div class="cardx in" style="--d:0.5s;flex:1;border:2px solid #99f6e4"><span class="pill" style="background:#0f766e;color:#fff">1차 · 1금융권</span><div class="big teal" style="margin-top:14px"><span data-count="5523" data-delay="0.5"></span></div><div style="font-size:19px;margin-top:6px">은행 점포('25.9월말, 금융위)</div></div>
     <div class="fade" style="--d:1.5s;align-self:center;font-size:34px;color:#94a3b8">→</div>
     <div class="cardx in" style="--d:1.7s;flex:1;border:2px solid #99f6e4"><span class="pill" style="background:#14b8a6;color:#fff">2차 · 2금융권</span><div class="big teal" style="margin-top:14px"><span data-count="3300" data-delay="1.7"></span>+</div><div style="font-size:19px;margin-top:6px">저축은행·농축협·신협·새마을금고</div></div>
     <div class="fade" style="--d:2.7s;align-self:center;font-size:34px;color:#94a3b8">→</div>
     <div class="cardx in" style="--d:2.9s;flex:1"><span class="pill" style="background:#e2e8f0;color:#334155">그다음 · 가능성</span><div style="font-size:26px;font-weight:900;margin-top:16px;line-height:1.35">보험 인수심사 · 카드 심사 · 공공기관 민원</div><div class="mut" style="font-size:16px;margin-top:6px">규정이 자주 바뀌고 근거를 대야 하는 창구</div></div>
   </div>
   <p class="in mut" style="--d:3.6s;font-size:19px;margin-top:18px">은행 내규 · 보증기관 지침도 같은 길로: Liner로 찾고 → 원문 대조 → 사람 승인 → 코드 판정</p>`, { eyebrow: "확장 가능성" });
  end = narrate("S10");
  await sent("S10", 1, 0);
  await slide(`
   <span class="ey in">모두에게 이득</span><h2 class="in" style="--d:.1s">직원 · Liner · 사업이 함께 이깁니다</h2>
   <div style="display:flex;gap:18px;margin-top:34px;align-items:stretch">
     ${[["지점 직원", "#0f766e", "근거가 붙은 답을 창구에서 바로", "본점 회신 대기가 줄어듦"], ["Liner", "#4f46e5", "출처가 곧 가치인 금융 업무 안에서", "매일 쓰이는 API(판정 1건 $0.026)"], ["사업", "#0f172a", "은행마다 구축 + 규제 감시 구독", "같은 규제를 따르는 기관으로 확장"]].map(([who, c, a, b], i) => `
     <div class="cardx in" style="--d:${(0.3 + i * 0.9).toFixed(1)}s;flex:1;border-top:6px solid ${c}">
       <span class="pill" style="background:${c};color:#fff">${who}</span><div style="font-size:26px;font-weight:900;margin-top:16px;line-height:1.35">${a}</div><div class="mut" style="font-size:19px;margin-top:8px">${b}</div></div>`).join("")}
   </div>`, { eyebrow: "확장 가능성" });
  await sent("S10", 2, 0);
  await slide(`<div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
    <div class="in" style="--d:.1s;display:flex;gap:14px">
      <span class="pill" style="background:#4f46e5;color:#fff;font-size:22px;padding:10px 18px">Liner가 찾고</span><span class="pill" style="background:#d97706;color:#fff;font-size:22px;padding:10px 18px">사람이 확인하고</span><span class="pill" style="background:#0f172a;color:#fff;font-size:22px;padding:10px 18px">코드가 판정한다</span></div>
    <div class="in" style="--d:.6s;margin-top:34px">${LOGO.replace('width="34" height="34"', 'width="76" height="76"')}</div>
    <h1 class="in" style="--d:.8s;font-size:76px;margin-top:14px">여신 사수</h1>
    <p class="in" style="--d:1.0s;font-size:26px;margin:8px 0 0">규정 막힐 때 바로 묻는 대출 규제 사수</p>
    <p class="in mut" style="--d:1.4s;font-size:18px;margin-top:22px">loandesk-copilot-rosy.vercel.app · github.com/jyc0124/yeosin-sasu</p></div>`);
  await until(end, 2.2);
} finally {
  clearInterval(pump);
  fs.writeFileSync(DIR + "timeline.json", JSON.stringify({ total: now(), timeline }, null, 1));
  const vid = page.video();
  await context.close();
  if (vid) fs.writeFileSync(DIR + "raw_path.txt", await vid.path());
  await browser.close();
}
