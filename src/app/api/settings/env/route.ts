import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { envAddSchema, envDeleteSchema } from "@/lib/schemas";

const ENV_PATH = path.join(process.cwd(), ".env");

// 민감 키 판별 패턴
const SENSITIVE_PATTERNS = ["SECRET", "KEY", "TOKEN", "PASSWORD", "DATABASE_URL"];

function isSensitive(key: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => key.toUpperCase().includes(p));
}

function maskValue(value: string): string {
  if (value.length <= 4) return "****";
  return value.slice(0, 4) + "****";
}

/** .env 파일 파싱 — 주석/빈줄 무시 */
async function parseEnvFile(): Promise<{ key: string; value: string }[]> {
  try {
    const content = await fs.readFile(ENV_PATH, "utf-8");
    const entries: { key: string; value: string }[] = [];

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      // 빈줄, 주석 무시
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();

      // 따옴표 제거
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (key) {
        entries.push({ key, value });
      }
    }

    return entries;
  } catch {
    // .env 파일이 없으면 빈 배열
    return [];
  }
}

/** .env 파일 전체 내용을 읽어 원본 텍스트 반환 */
async function readEnvRaw(): Promise<string> {
  try {
    return await fs.readFile(ENV_PATH, "utf-8");
  } catch {
    return "";
  }
}

/** .env 파일에 키=값 추가 또는 수정 */
async function upsertEnvVar(key: string, value: string): Promise<void> {
  const raw = await readEnvRaw();
  const lines = raw.split("\n");
  let found = false;

  const updated = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed) return line;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) return line;

    const lineKey = trimmed.slice(0, eqIndex).trim();
    if (lineKey === key) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) {
    updated.push(`${key}=${value}`);
  }

  await fs.writeFile(ENV_PATH, updated.join("\n"), "utf-8");

  // 런타임에도 반영
  process.env[key] = value;
}

/** .env 파일에서 키 삭제 */
async function deleteEnvVar(key: string): Promise<void> {
  const raw = await readEnvRaw();
  const lines = raw.split("\n");

  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed) return true;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) return true;

    const lineKey = trimmed.slice(0, eqIndex).trim();
    return lineKey !== key;
  });

  await fs.writeFile(ENV_PATH, filtered.join("\n"), "utf-8");

  // 런타임에서도 제거
  delete process.env[key];
}

/**
 * GET /api/settings/env — 환경변수 목록 조회
 * ?reveal=true&key=XXX — 특정 키의 원본 값 조회
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const revealKey = searchParams.get("key");
    const reveal = searchParams.get("reveal") === "true";

    const entries = await parseEnvFile();

    // 특정 키 원본 값 요청
    if (reveal && revealKey) {
      const entry = entries.find((e) => e.key === revealKey);
      if (!entry) {
        return NextResponse.json(
          { error: "해당 키를 찾을 수 없습니다" },
          { status: 404 },
        );
      }
      return NextResponse.json({ key: entry.key, value: entry.value });
    }

    // 전체 목록 — 민감 값 마스킹
    const list = entries.map((e) => ({
      key: e.key,
      value: isSensitive(e.key) ? maskValue(e.value) : e.value,
      sensitive: isSensitive(e.key),
    }));

    return NextResponse.json({ list });
  } catch {
    return NextResponse.json(
      { error: "환경변수 조회 실패" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/settings/env — 환경변수 추가/수정
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = envAddSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "유효성 검증 실패" },
        { status: 400 },
      );
    }

    await upsertEnvVar(parsed.data.key, parsed.data.value);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "환경변수 저장 실패" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/settings/env — 환경변수 삭제
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = envDeleteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "유효성 검증 실패" },
        { status: 400 },
      );
    }

    await deleteEnvVar(parsed.data.key);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "환경변수 삭제 실패" },
      { status: 500 },
    );
  }
}
