// 가상 A은행 지침 공개 화면: 판정 근거로 쓰인 내부 기준을 누구나(심사위원 포함) 확인할 수 있게 한다.
import Link from "next/link";
import testset from "@/data/eval/testset.json";
import { ARTICLE_USE, loadGuideline, type Block } from "@/lib/bank/guideline";
import { Header } from "../_components/Header";
import { JudgeNote } from "../_components/viewStore";

export const metadata = { title: "A은행 지침(가상) · 여신 사수" };

const BY_ID = new Map(testset.cases.map((c) => [c.id, c]));

const USE_TAG = {
  engine: { label: "판정 문구에 직접 인용", cls: "bg-indigo-600 text-white" },
  hq: { label: "본점 질의 절차", cls: "bg-violet-100 text-violet-800" },
  guard: { label: "모든 판정에 적용", cls: "bg-rose-100 text-rose-800" },
  reference: { label: "창구 참고 기준", cls: "bg-zinc-200 text-zinc-700" },
} as const;

/** **굵게**, `코드` 표시 */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") ? (
          <b key={i} className="font-semibold text-zinc-900">
            {p.slice(2, -2)}
          </b>
        ) : p.startsWith("`") ? (
          <code key={i} className="rounded bg-zinc-100 px-1 text-[13px]">
            {p.slice(1, -1)}
          </code>
        ) : (
          p
        ),
      )}
    </>
  );
}

function BlockView({ b }: { b: Block }) {
  if (b.kind === "table") {
    const [head, ...rows] = b.rows;
    return (
      <div className="my-2 overflow-x-auto rounded-lg ring-1 ring-zinc-200">
        <table className="w-full text-left text-[14px]">
          <thead className="bg-zinc-50 text-[13px] text-zinc-500">
            <tr>
              {head.map((h) => (
                <th key={h} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className="px-3 py-2 align-top text-zinc-700">
                    <Inline text={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (b.kind === "text") return <p className="text-[15px] leading-relaxed text-zinc-700"><Inline text={b.text} /></p>;
  return (
    <li className="flex gap-2.5 text-[15px] leading-relaxed text-zinc-700">
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-zinc-100 text-[12px] font-semibold text-zinc-600">{b.n}</span>
      <div className="min-w-0">
        <Inline text={b.text} />
        {b.subs.length > 0 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[14px] text-zinc-600">
            {b.subs.map((s) => (
              <li key={s}>
                <Inline text={s} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export default function BankPage() {
  const g = loadGuideline();
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <Header
        title="가상 A은행 지침"
        subtitle="정부가 “금융회사가 판단하라”고 맡긴 부분을 채우려고 만든 가상 내부 기준입니다. 판정이 이 지침에 기대는 곳을 확인할 수 있도록 전문을 공개합니다."
      />
      <JudgeNote className="mb-6">결론은 정부 규정(규칙 엔진)으로 내고, 서류·절차·심사위 상정처럼 정부가 금융회사에 맡긴 부분만 이 가상 지침을 따릅니다. 판정 카드의 &lsquo;은행 지침&rsquo; 표시가 이 문서의 조항으로 연결됩니다. 실제 도입 시 이 자리에 그 은행의 내규가 들어갑니다.</JudgeNote>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-[14px] leading-relaxed text-amber-900">
        <p className="font-semibold">실제 어느 은행의 내규도 아닙니다</p>
        <p className="mt-1">
          8.13·4.1 대책은 여신심사위원회 상정, 임대사업자 &lsquo;주된 영업&rsquo; 판단, 실거주 증빙처럼 일부 판단을 금융회사에 맡겼습니다. 은행마다 내규가 다르므로, 시제품은 이 빈칸을 가상 지침으로 채워 &lsquo;정부 발표 자료 + 은행 내부 기준&rsquo;이 함께 쓰이는 창구 판단을 재현했습니다. 실제 은행에 도입하면 이 문서 자리에 그 은행의 내규가 들어갑니다.
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <p className="text-[15px] font-semibold text-zinc-900">조항별로 어디에 쓰이나</p>
        <ul className="mt-3 divide-y divide-zinc-100">
          {g.articles
            .filter((a) => ARTICLE_USE[a.no])
            .map((a) => {
              const u = ARTICLE_USE[a.no];
              return (
                <li key={a.no} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[14px]">
                  <a href={`#art-${a.no}`} className="w-40 shrink-0 font-semibold text-zinc-900 hover:text-indigo-700">
                    제{a.no}조 {a.title}
                  </a>
                  <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${USE_TAG[u.kind].cls}`}>{USE_TAG[u.kind].label}</span>
                  <span className="min-w-0 flex-1 basis-64 text-zinc-600">{u.text}</span>
                </li>
              );
            })}
        </ul>
        <p className="mt-2 text-[12px] text-zinc-400">판정 코드는 규칙 엔진이 정부 발표 자료로 정합니다. 지침은 정부 발표 자료가 금융회사에 맡긴 부분과 창구 절차에만 쓰입니다.</p>
      </section>

      <article className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6">
        <p className="text-[12px] font-semibold text-zinc-400">전문</p>
        <h2 className="mt-1 text-[20px] font-bold tracking-tight text-zinc-900">{g.title}</h2>
        {g.notes.filter((n) => n.startsWith("작성")).map((n) => (
          <p key={n} className="mt-1 text-[13px] text-zinc-500">
            <Inline text={n} />
          </p>
        ))}
        <div className="mt-6 space-y-7">
          {g.articles.map((a) => {
            const u = ARTICLE_USE[a.no];
            return (
              <section key={a.no} id={`art-${a.no}`} className="scroll-mt-6">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="text-[17px] font-semibold text-zinc-900">
                    제{a.no}조 ({a.title})
                  </h3>
                  {a.delegated && <span className="text-[13px] text-zinc-400">정부 발표 자료 근거: {a.delegated}</span>}
                </div>
                <ul className="mt-2 space-y-2">
                  {a.blocks.map((b, i) => (
                    <BlockView key={i} b={b} />
                  ))}
                </ul>
                {u && u.examples.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px]">
                    <span className="text-zinc-400">관련 질문</span>
                    {u.examples.map((id) => {
                      const c = BY_ID.get(id);
                      return c ? (
                        <Link
                          key={id}
                          href={`/?q=${encodeURIComponent(c.question)}`}
                          title={c.question}
                          className="max-w-[18rem] truncate rounded-full border border-zinc-200 px-2.5 py-0.5 text-zinc-600 hover:border-indigo-300 hover:text-indigo-700"
                        >
                          {c.question}
                        </Link>
                      ) : null;
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </article>
    </main>
  );
}
