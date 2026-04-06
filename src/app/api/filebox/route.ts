import { NextRequest, NextResponse } from "next/server";
import { getMetadata, saveFile, validateFile, getStorageUsage } from "@/lib/filebox";
import { fileboxQuerySchema } from "@/lib/schemas";

export const runtime = "nodejs";

// 파일 목록 조회
export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = fileboxQuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 쿼리 파라미터" }, { status: 400 });
  }

  const { sort, order } = parsed.data;
  const files = await getMetadata();

  // 정렬
  files.sort((a, b) => {
    let cmp = 0;
    if (sort === "date") cmp = new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
    else if (sort === "name") cmp = a.originalName.localeCompare(b.originalName, "ko");
    else if (sort === "size") cmp = a.size - b.size;
    return order === "desc" ? -cmp : cmp;
  });

  const usage = await getStorageUsage();
  return NextResponse.json({ files, usage });
}

// 파일 업로드
export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
  }

  // 파일 검증
  const validation = validateFile(file);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const metadata = await saveFile(file);
    return NextResponse.json({ file: metadata }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "업로드 실패";
    // 용량 초과는 413
    const status = message.includes("용량 초과") ? 413 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
