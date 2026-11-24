import { Header } from "../_components/Header";
import { HqClient } from "./HqClient";
import { JudgeNote } from "../_components/viewStore";

export const metadata = { title: "질의 처리 · 여신 사수" };

export default function HqPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
        <Header subtitle="가상 A은행 본점 여신기획부 화면입니다. 지점이 올린 질의를 검토해 회신하고, 승인하면 사례 FAQ로 등록되어 전 지점의 같은 쟁점 판정 카드에 함께 표시됩니다." />
        <JudgeNote className="mb-6">지점 질의가 들어오면 본점은 회신하기 전에 Liner Search API로 공식 출처부터 찾아봅니다(쟁점 1건 2~3초). 승인한 해석은 FAQ가 되어 전 지점의 같은 쟁점 판정 카드에 함께 나옵니다.</JudgeNote>
        <HqClient />
        <footer className="mt-10 text-[12px] leading-relaxed text-zinc-400">
          시제품이라 질의·FAQ는 이 브라우저에만 저장됩니다(같은 브라우저의 지점·본점 탭은 실시간 동기화, 다른 기기·브라우저에서는 보이지 않음). 본점 회신은 가상 A은행의 내부 해석이며, 판정 코드는
          정부 발표 자료 기준 규칙 엔진이 정합니다.
        </footer>
      </div>
    </main>
  );
}
