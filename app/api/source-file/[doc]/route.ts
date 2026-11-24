// 근거 원문 원본 파일(공식 PDF·HWP 저장본) 내려받기. 등록된 문서만 내보낸다.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { docOf, FILE_DIR } from "@/lib/kb/source";

export const runtime = "nodejs";

const TYPE: Record<string, string> = { pdf: "application/pdf", hwp: "application/x-hwp" };

export async function GET(_req: Request, { params }: { params: Promise<{ doc: string }> }) {
  const { doc: abbr } = await params;
  const doc = docOf(decodeURIComponent(abbr));
  if (!doc?.file) return new Response("등록되지 않은 문서입니다.", { status: 404 });
  const ext = doc.file.split(".").pop()!.toLowerCase();
  const buf = await readFile(path.join(FILE_DIR, doc.file));
  const name = path.basename(doc.file);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": TYPE[ext] ?? "application/octet-stream",
      // PDF는 브라우저에서 바로 열고, HWP는 내려받는다
      "Content-Disposition": `${ext === "pdf" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
