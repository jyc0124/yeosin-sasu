import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "./_components/Sidebar";
import { BETA } from "@/lib/beta";

const TITLE = `여신 사수 — 지점 창구 대출 규제 판정${BETA ? " (베타)" : ""}`;
const DESC = "고객이 “이 대출 되나요?” 물으면 정부 발표 자료 근거와 함께 바로 판정합니다. 2026.8.13 전세대출·2026.4.1 만기연장 제한. 가상 A은행 지침 기반 데모.";

export const metadata: Metadata = {
  // 카톡·메신저 링크 미리보기의 이미지 주소를 절대 경로로 만들기 위해 필요
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://loandesk-copilot-rosy.vercel.app"),
  title: "여신 사수",
  description: DESC,
  openGraph: {
    type: "website",
    siteName: "여신 사수",
    title: TITLE,
    description: DESC,
    locale: "ko_KR",
    images: [{ url: BETA ? "/og-beta.png" : "/og.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC, images: [BETA ? "/og-beta.png" : "/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="antialiased">
        <div className="lg:flex">
          <Sidebar />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
