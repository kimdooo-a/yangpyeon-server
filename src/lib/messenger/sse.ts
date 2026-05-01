/**
 * src/lib/messenger/sse.ts
 *
 * 메신저 SSE 채널 키 빌더 + publish wrapper.
 *
 * 채널 네임스페이스:
 *   `t:<tenantId>:conv:<convId>`   — 단일 conversation 의 message/typing/receipt/member 이벤트
 *   `t:<tenantId>:user:<uid>`      — 사용자 개인 알림 (mention/dm/report/block)
 *
 * tenant 접두사는 cross-tenant 충돌(같은 cid 가 다른 tenant 에 존재 가능)을 차단.
 *
 * Phase 1 결정:
 *   - bus.ts EventEmitter 싱글턴 활용 (단일 PM2 프로세스 가정)
 *   - 멀티 인스턴스 확장 시 Redis pubsub 으로 교체 (ADR-022 §1 Phase 2 트리거)
 *   - publish 는 transaction 후 fire-and-forget (실패해도 도메인 결과는 영구 source of truth)
 */
import { publish as busPublish } from "@/lib/realtime/bus";

export function convChannelKey(tenantId: string, conversationId: string): string {
  return `t:${tenantId}:conv:${conversationId}`;
}

export function userChannelKey(tenantId: string, userId: string): string {
  return `t:${tenantId}:user:${userId}`;
}

export type MessengerSseEvent =
  | "message.created"
  | "message.updated"
  | "message.deleted"
  | "receipt.updated"
  | "typing.started"
  | "typing.stopped"
  | "member.joined"
  | "member.left"
  | "mention.received"
  | "dm.received"
  | "report.resolved"
  | "block.created";

/** conversation 채널에 fire-and-forget publish. 예외 swallow (audit 와 동일 fail-soft). */
export function publishConvEvent(
  tenantId: string,
  conversationId: string,
  event: MessengerSseEvent,
  payload: Record<string, unknown>,
): void {
  try {
    busPublish(convChannelKey(tenantId, conversationId), event, {
      conversationId,
      ...payload,
    });
  } catch (err) {
    console.warn("[messenger.sse] publish failed", { tenantId, conversationId, event, err });
  }
}

/** 사용자 개인 채널에 fire-and-forget publish. */
export function publishUserEvent(
  tenantId: string,
  userId: string,
  event: MessengerSseEvent,
  payload: Record<string, unknown>,
): void {
  try {
    busPublish(userChannelKey(tenantId, userId), event, payload);
  } catch (err) {
    console.warn("[messenger.sse] publish failed", { tenantId, userId, event, err });
  }
}
