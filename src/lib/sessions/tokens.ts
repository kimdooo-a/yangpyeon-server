import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/client";
import { parseUserAgent } from "./activity";

/**
 * Phase 15-D Refresh Token Rotation (세션 36 / Blueprint §7.2.2).
 *
 * 세션 32 에서 인프라만 구축한 Prisma `Session` 모델을 활성화.
 * Opaque 랜덤 토큰(32 bytes hex) + DB 저장 (tokenHash = SHA-256).
 * Rotation: refresh 마다 새 토큰 발급 + 구 토큰 revoke → reuse 탐지 가능.
 *
 * 핵심 설계:
 * - 클라이언트는 토큰 원본을 쿠키에 보관 (httpOnly)
 * - 서버는 tokenHash(sha-256 hex) 만 저장 — 평문 미저장
 * - revoke: revokedAt 타임스탬프 설정 (soft delete) — 감사 + reuse 탐지용 grace
 * - cleanup job: expires_at < NOW() - 1일 경과분만 hard delete (세션 32 `cleanupExpiredSessions`)
 */

export const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const REFRESH_TOKEN_MAX_AGE_SEC = Math.floor(REFRESH_TOKEN_MAX_AGE_MS / 1000);

export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export interface IssueSessionParams {
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
}

export interface IssuedSession {
  token: string;
  sessionId: string;
  expiresAt: Date;
}

export async function issueSession(params: IssueSessionParams): Promise<IssuedSession> {
  const token = generateOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS);
  const session = await prisma.session.create({
    data: {
      userId: params.userId,
      tokenHash,
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
      expiresAt,
    },
    select: { id: true, expiresAt: true },
  });
  return { token, sessionId: session.id, expiresAt: session.expiresAt };
}

export type SessionLookupStatus =
  | "active"
  | "revoked"
  | "expired"
  | "user_invalid"
  | "not_found";

/**
 * 세션 37 — revoke 사유 분류.
 *   - "rotation": rotate 시점에 구 세션을 revoke (이 토큰 재사용 = 진짜 reuse 공격 의심)
 *   - "self": 사용자가 세션 1건 개별 종료 (/api/v1/auth/sessions/[id] DELETE)
 *   - "self_except_current": 사용자 "다른 세션 모두 종료" (revoke-all)
 *   - "logout": 로그아웃 시점
 *   - "reuse_detected": defense-in-depth 로 연쇄 revoke
 *   - "admin": 관리자 강제 revoke (향후)
 */
export type SessionRevokeReason =
  | "rotation"
  | "self"
  | "self_except_current"
  | "logout"
  | "reuse_detected"
  | "admin";

export interface SessionLookup {
  status: SessionLookupStatus;
  session: {
    id: string;
    userId: string;
    revokedAt: Date | null;
    revokedReason: string | null;
    expiresAt: Date;
    lastUsedAt: Date;
    ip: string | null;
    userAgent: string | null;
    user: { id: string; email: string; role: Role; isActive: boolean } | null;
  } | null;
}

export async function findSessionByToken(token: string): Promise<SessionLookup> {
  const tokenHash = hashToken(token);
  const row = await prisma.session.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      revokedAt: true,
      revokedReason: true,
      expiresAt: true,
      lastUsedAt: true,
      ip: true,
      userAgent: true,
      user: { select: { id: true, email: true, role: true, isActive: true } },
    },
  });
  if (!row) return { status: "not_found", session: null };
  if (row.revokedAt) return { status: "revoked", session: row };
  if (row.expiresAt < new Date()) return { status: "expired", session: row };
  if (!row.user || !row.user.isActive) return { status: "user_invalid", session: row };
  return { status: "active", session: row };
}

/**
 * 세션 회전 — 단일 트랜잭션으로 구 세션 revoke + 신 세션 insert.
 * 클라이언트 race 시에도 양쪽 UPDATE/INSERT 원자성 보장.
 * 구 세션은 `revokedReason="rotation"` 으로 표시 — 이 토큰 재사용 시 reuse 탐지 발동 신호.
 */
export async function rotateSession(params: {
  oldSessionId: string;
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<IssuedSession> {
  return prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: params.oldSessionId },
      data: { revokedAt: new Date(), revokedReason: "rotation" },
    });
    const token = generateOpaqueToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS);
    const created = await tx.session.create({
      data: {
        userId: params.userId,
        tokenHash,
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
        expiresAt,
      },
      select: { id: true, expiresAt: true },
    });
    return { token, sessionId: created.id, expiresAt: created.expiresAt };
  });
}

export async function revokeSession(
  sessionId: string,
  reason: SessionRevokeReason = "self",
): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

/**
 * 사용자의 모든 활성 세션 revoke.
 *
 * 세션 37: reuse 탐지 시 defense-in-depth 용으로 "reuse_detected" 태깅.
 * 세션 39: reason 파라미터로 범용화 — admin 강제 revoke ("admin") 등 재사용.
 * 기본값은 하위 호환을 위해 "reuse_detected" 유지.
 *
 * @returns revoke 된 세션 수
 */
export async function revokeAllUserSessions(
  userId: string,
  reason: SessionRevokeReason = "reuse_detected",
): Promise<number> {
  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return result.count;
}

/**
 * 사용자가 "다른 모든 세션 종료" 요청 시 (세션 37).
 * currentSessionId 가 있으면 해당 세션 1건만 보존, 나머지 revoke.
 * currentSessionId 가 없으면 revokeAllUserSessions 와 동치.
 *
 * revokedReason="self_except_current" — 이 세션의 구 토큰 재사용은 reuse 탐지 미발동
 * (사용자가 의도적으로 종료한 세션이므로 "자기파괴" 방지).
 *
 * @returns revoke 된 세션 수 (current 제외)
 */
export async function revokeAllExceptCurrent(
  userId: string,
  currentSessionId?: string | null,
): Promise<number> {
  const result = await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(currentSessionId ? { NOT: { id: currentSessionId } } : {}),
    },
    data: { revokedAt: new Date(), revokedReason: "self_except_current" },
  });
  return result.count;
}

export interface ActiveSessionSummary {
  id: string;
  ip: string | null;
  userAgent: string | null;
  /** 세션 38 — parseUserAgent 로 생성한 사람 읽기 쉬운 label. 원본 userAgent 는 툴팁용으로 보존. */
  userAgentLabel: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

/**
 * 사용자의 활성 세션 목록 — revokedAt IS NULL AND expiresAt > NOW().
 * currentSessionId 전달 시 current 플래그 계산.
 */
export async function listActiveSessions(
  userId: string,
  currentSessionId?: string,
): Promise<ActiveSessionSummary[]> {
  const rows = await prisma.session.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { lastUsedAt: "desc" },
    select: {
      id: true,
      ip: true,
      userAgent: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    ip: r.ip,
    userAgent: r.userAgent,
    userAgentLabel: parseUserAgent(r.userAgent),
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    current: currentSessionId === r.id,
  }));
}

export async function touchSessionLastUsed(sessionId: string): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { lastUsedAt: new Date() },
  });
}
