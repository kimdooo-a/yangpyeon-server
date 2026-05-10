/**
 * Optimistic message update pure logic — F2-2 (M4 Phase 2).
 *
 * 책임:
 *   - 송신 직후 즉시 cache 에 prepend (server roundtrip 대기 없음, UX 개선)
 *   - 201 응답 수신 시 server message 로 swap (id/createdAt/mentions/attachments 정합)
 *   - 4xx/5xx/네트워크 실패 시 `_optimistic.status='failed'` 표시 (UI 재시도 트리거)
 *   - 멱등 보장: 동일 clientGeneratedId 중복 prepend 차단 (rapid double-Enter 방어)
 *
 * 의도적 보류 (F2-3~F2-5):
 *   - 재시도 트리거 UI 자체 / fail 시 자동 제거 정책 / SWR mutate 통합 (S87-INFRA-1 후)
 *
 * 메모리 룰 정합:
 *   - clientGeneratedId 는 server `(tenantId, conversationId, clientGeneratedId)` UNIQUE
 *     이미 멱등 처리 → 클라이언트는 단순 prepend/replace 만, dedup 불필요.
 *
 * jsdom 미도입 (S87-INFRA-1) — pure function 만 분리해 vitest node env 에서 단위 테스트.
 */

export interface MessageAttachmentRow {
  id: string;
  fileId: string;
  kind: string;
  displayOrder: number;
}

export interface MessageMentionRow {
  id: string;
  mentionedUserId: string;
}

export interface OptimisticMeta {
  status: "pending" | "failed";
  /** 실패 시 사용자 노출용 에러 메시지 (재시도 트리거 UI). */
  error?: string;
}

export interface MessageRow {
  id: string;
  kind: "TEXT" | "IMAGE" | "FILE" | "SYSTEM";
  body: string | null;
  senderId: string;
  replyToId: string | null;
  clientGeneratedId: string;
  editedAt: string | null;
  editCount: number;
  deletedAt: string | null;
  deletedBy: string | null;
  createdAt: string;
  attachments: MessageAttachmentRow[];
  mentions: MessageMentionRow[];
  /** 서버 fetch 메시지에는 없음. optimistic prepend 후 응답 전까지 또는 fail 표시 시. */
  _optimistic?: OptimisticMeta;
}

export interface OptimisticBuildInput {
  payload: {
    /** F2-1 TEXT 단독 → M5-ATTACH-3 IMAGE/FILE 도 허용 (S96). */
    kind: "TEXT" | "IMAGE" | "FILE";
    /** 캡션 빈 문자열은 null 로 보냄 (backend `sendMessageSchema` 정합). */
    body: string | null;
    clientGeneratedId: string;
    /** F2-3 — 답장 인용 대상 (optimistic 메시지에도 quote preview 즉시 표시). */
    replyToId?: string;
    /** M5-ATTACH-3 — 첨부 fileId 배열 (optimistic 버블에 미리보기 표시). */
    attachments?: Array<{
      fileId: string;
      kind: "IMAGE" | "FILE" | "VOICE";
      displayOrder?: number;
    }>;
  };
  senderId: string;
  now?: Date;
}

/**
 * Optimistic message 생성. id 는 clientGeneratedId 그대로 — UUIDv7 라 server 메시지 id 와
 * 동일 정렬 영역. server 응답 후 실제 id 로 swap 되므로 React key 충돌 없음.
 *
 * 첨부 attachments 의 id 는 client 측 임시값 (`opt-att-{cgid}-{idx}`) — server 응답
 * swap 시 실제 MessageAttachment.id 로 교체. fileId 는 그대로 신뢰 (UI 렌더 키).
 */
export function buildOptimisticMessage(
  input: OptimisticBuildInput,
): MessageRow {
  const now = input.now ?? new Date();
  const attachments: MessageAttachmentRow[] = (input.payload.attachments ?? []).map(
    (a, idx) => ({
      id: `opt-att-${input.payload.clientGeneratedId}-${idx}`,
      fileId: a.fileId,
      kind: a.kind,
      displayOrder: a.displayOrder ?? idx,
    }),
  );
  return {
    id: input.payload.clientGeneratedId,
    kind: input.payload.kind,
    body: input.payload.body,
    senderId: input.senderId,
    replyToId: input.payload.replyToId ?? null,
    clientGeneratedId: input.payload.clientGeneratedId,
    editedAt: null,
    editCount: 0,
    deletedAt: null,
    deletedBy: null,
    createdAt: now.toISOString(),
    attachments,
    mentions: [],
    _optimistic: { status: "pending" },
  };
}

export function findByClientGeneratedId(
  messages: MessageRow[],
  clientGeneratedId: string,
): MessageRow | null {
  return (
    messages.find((m) => m.clientGeneratedId === clientGeneratedId) ?? null
  );
}

/**
 * cache 에 optimistic prepend. 동일 clientGeneratedId 가 이미 있으면 중복 추가 안 함 (멱등).
 * 메시지 배열은 desc(createdAt) — 신규는 가장 최신이므로 head 에 push.
 */
export function prependOptimistic(
  messages: MessageRow[],
  optimistic: MessageRow,
): MessageRow[] {
  if (findByClientGeneratedId(messages, optimistic.clientGeneratedId)) {
    return messages;
  }
  return [optimistic, ...messages];
}

/**
 * server 응답 수신 — clientGeneratedId match 자리에 server message swap.
 * 기존 index 보존 (정렬 안정). match 없으면 prepend (defensive — 사용자 explicit dismiss race).
 */
export function replaceOptimisticWithServer(
  messages: MessageRow[],
  clientGeneratedId: string,
  server: MessageRow,
): MessageRow[] {
  const idx = messages.findIndex(
    (m) => m.clientGeneratedId === clientGeneratedId,
  );
  const cleaned: MessageRow = { ...server };
  delete cleaned._optimistic;
  if (idx < 0) {
    return [cleaned, ...messages];
  }
  const next = messages.slice();
  next[idx] = cleaned;
  return next;
}

/**
 * 송신 실패 표시 — cache 에 남기고 `_optimistic.status='failed'` 만 전환.
 * UI 는 빨간 점 + 재시도 버튼 가능. 자동 제거 안 함 (사용자 의도적 dismiss 까지 보존).
 * server 메시지(_optimistic 없음)는 protect — `_optimistic` 가 없으면 변경 안 함.
 */
export function markOptimisticFailed(
  messages: MessageRow[],
  clientGeneratedId: string,
  error: string,
): MessageRow[] {
  const idx = messages.findIndex(
    (m) => m.clientGeneratedId === clientGeneratedId,
  );
  if (idx < 0) return messages;
  const target = messages[idx];
  if (!target._optimistic) return messages;
  const next = messages.slice();
  next[idx] = {
    ...target,
    _optimistic: { status: "failed", error },
  };
  return next;
}

/**
 * Optimistic 제거 — 사용자가 실패 메시지 dismiss 또는 explicit rollback.
 * server 메시지(_optimistic 없음)는 protect — 실수로 production row 삭제 방지.
 */
export function removeOptimistic(
  messages: MessageRow[],
  clientGeneratedId: string,
): MessageRow[] {
  const target = findByClientGeneratedId(messages, clientGeneratedId);
  if (!target || !target._optimistic) return messages;
  return messages.filter(
    (m) => m.clientGeneratedId !== clientGeneratedId,
  );
}

export function isOptimisticPending(m: MessageRow): boolean {
  return m._optimistic?.status === "pending";
}

export function isOptimisticFailed(m: MessageRow): boolean {
  return m._optimistic?.status === "failed";
}
