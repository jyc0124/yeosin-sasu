import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /api/watch는 미리 추출한 원문 텍스트를 fs로 읽는다 → 서버리스 번들에 포함
  outputFileTracingIncludes: {
    "/api/watch": ["./data/official/text/*.txt"],
    // 근거 원문 보기·원본 파일
    "/source/[id]": ["./data/official/text/*.txt"],
    "/api/source-file/[doc]": ["./data/official/**/*.pdf", "./data/official/**/*.hwp"],
  },
};

export default nextConfig;
