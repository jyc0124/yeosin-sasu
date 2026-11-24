// 근거 원문 보기: Fact가 나온 공식 문서 전체를 보여 주고, 해당 구절을 강조한다.
// 원문 텍스트는 공식 PDF·HWP에서 추출해 저장소에 둔 것(data/official/text). 원본 파일과 공식 게시 페이지도 함께 연결한다.
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveFacts } from "@/lib/kb";
import { locate } from "@/lib/kb/source";
import { Icon } from "../../_components/Icon";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `근거 자료 ${id} · 여신 사수` };
}

export default async function SourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loc = locate(id);
  const fact = resolveFacts([id])[0];
  if (!loc || !fact) notFound();
  const { doc, lines, highlight, note } = loc;
  const hl = new Set(highlight);
  const first = highlight[0] ?? 0;
  // 문서가 길면 강조 구절 앞뒤만 먼저 보여 주고, 나머지는 펼쳐 볼 수 있게 한다
  const lo = Math.max(0, first - 25);
  const hi = Math.min(lines.length, (highlight.at(-1) ?? first) + 40);
  const fmtDate = (d: string) => d.replaceAll("-", ".");

  const Line = ({ i }: { i: number }) => {
    const t = lines[i].replace(/^\[표 (시작|끝)\]$/, "");
    if (!t.trim()) return <div className="h-2" />;
    return (
      <p
        id={i === first ? "hl" : undefined}
        className={`scroll-mt-24 whitespace-pre-wrap px-3 py-0.5 text-[15px] leading-relaxed ${
          hl.has(i) ? "border-l-[3px] border-amber-400 bg-amber-100/70 font-medium text-zinc-950" : "border-l-[3px] border-transparent text-zinc-600"
        }`}
      >
        {t}
      </p>
    );
  };

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
        <Link href="/" className="text-[14px] text-zinc-500 hover:text-zinc-900">
          ← 창구 판정
        </Link>

        <header className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-zinc-500">
            <span className="rounded bg-zinc-900 px-2 py-0.5 font-mono font-semibold text-white">{fact.id}</span>
            {fact.kb === "v2" && (
              <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-700">
                <Icon name="spark" className="h-3 w-3" />
                Liner로 찾은 후속 문서
              </span>
            )}
            <span>{fact.source}</span>
          </div>
          <p className="mt-3 text-[16px] leading-relaxed text-zinc-900">
            <span className="mr-1.5 text-[13px] font-semibold text-zinc-500">판정에 쓴 요약</span>
            {fact.text}
          </p>
          {note && <p className="mt-2 text-[13px] text-amber-800">※ {note}</p>}

          <div className="mt-4 border-t border-zinc-100 pt-4">
            <p className="text-[13px] text-zinc-500">정부 발표 자료</p>
            <p className="mt-0.5 text-[17px] font-semibold text-zinc-900">{doc.title}</p>
            <p className="text-[14px] text-zinc-500">
              {doc.publisher} · {fmtDate(doc.date)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={doc.page}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-[14px] font-semibold text-white hover:bg-indigo-700"
              >
                공식 게시 페이지 열기 ↗
              </a>
              {doc.file && (
                <a
                  href={`/api/source-file/${encodeURIComponent(doc.abbr)}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-[14px] font-medium text-zinc-700 hover:border-zinc-300"
                >
                  <Icon name="doc" className="h-4 w-4" />
                  원본 파일 받기 ({doc.file.split(".").pop()?.toUpperCase()})
                </a>
              )}
            </div>
            {doc.pageNote && <p className="mt-2 text-[12px] text-zinc-400">게시 위치: {doc.pageNote}</p>}
          </div>
        </header>

        <section className="mt-5 rounded-2xl border border-zinc-200 bg-white py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="mb-3 px-5 text-[13px] text-zinc-500">
            정부 발표 자료 본문 · <span className="rounded bg-amber-100 px-1 text-amber-900">노란 부분</span>이 이 근거가 나온 곳입니다
          </p>
          {lo > 0 && (
            <details className="px-2">
              <summary className="cursor-pointer px-3 py-1 text-[13px] text-zinc-400 hover:text-zinc-700">앞부분 {lo}줄 펼치기</summary>
              {lines.slice(0, lo).map((_, i) => (
                <Line key={i} i={i} />
              ))}
            </details>
          )}
          <div className="px-2">
            {lines.slice(lo, hi).map((_, k) => (
              <Line key={lo + k} i={lo + k} />
            ))}
          </div>
          {hi < lines.length && (
            <details className="px-2">
              <summary className="cursor-pointer px-3 py-1 text-[13px] text-zinc-400 hover:text-zinc-700">뒷부분 {lines.length - hi}줄 펼치기</summary>
              {lines.slice(hi).map((_, k) => (
                <Line key={hi + k} i={hi + k} />
              ))}
            </details>
          )}
        </section>
        <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">
          본문은 공식 PDF·HWP에서 글자만 추출한 것이라 표 모양과 띄어쓰기가 원본과 다를 수 있습니다. 정확한 서식은 원본 파일이나 공식 게시 페이지에서 확인하세요.
        </p>
      </div>
    </main>
  );
}
