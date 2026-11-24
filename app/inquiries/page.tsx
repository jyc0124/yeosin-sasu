import { Header } from "../_components/Header";
import { BranchInquiries } from "./BranchInquiries";
import { JudgeNote } from "../_components/viewStore";

export const metadata = { title: "내 질의 · 여신 사수" };

export default function InquiriesPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-10">
        <Header subtitle="지점에서 확정할 수 없거나 재확인이 필요해 본점에 보낸 질의의 진행 상황과 본점 회신을 확인합니다. 본점이 승인한 해석은 다음 판정 카드에도 함께 나옵니다." />
        <JudgeNote className="mb-6">지점이 확답할 수 없는 판정(본점 문의·심사위 상정)은 판정 카드에서 바로 본점 질의서가 만들어져 여기로 옵니다. 고객 상황·근거 조항·쟁점이 자동으로 채워져, 본점이 다시 묻지 않아도 됩니다.</JudgeNote>
        <BranchInquiries />
        <footer className="mt-10 text-[12px] leading-relaxed text-zinc-400">
          시제품이라 질의·회신은 이 브라우저에만 저장됩니다(같은 브라우저의 지점·본점 화면은 실시간 동기화, 다른 기기·브라우저에서는 보이지 않음). 본점 회신은 가상 A은행의 내부 해석입니다.
        </footer>
      </div>
    </main>
  );
}
