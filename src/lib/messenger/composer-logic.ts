/**
 * Message composer pure logic — F2-1 / F2-3 / M5-ATTACH-3 (M4 Phase 2).
 *
 * UI (`MessageComposer.tsx`) 와 분리된 검증/페이로드 빌드.
 * Backend zod schema (`sendMessageSchema`) 와 정합 — body max 5000자, attachments max 5,
 * TEXT 는 body 1+ 필수 / IMAGE·FILE 은 attachments 1+ 필수.
 *
 * 진화 이력:
 *   - F2-1: TEXT 만 (canSendText, prepareSendPayload).
 *   - F2-3: replyToId / mentions 옵션 추가.
 *   - M5-ATTACH-3 (S96): attachments 추가 — kind=IMAGE/FILE 분기, canSendMessage 신규.
 */
import { uuidv7 } from "./uuidv7";

const MAX_BODY = 5000;
const MAX_ATTACHMENTS = 5;

export function canSendText(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length < 1) return false;
  if (raw.length > MAX_BODY) return false; // raw (trim 전) 기준으로 server validation 정합
  return true;
}

/** 첨부 단일 항목 — backend `sendMessageSchema.attachments[]` 와 정합. */
export interface SendAttachment {
  fileId: string;
  kind: "IMAGE" | "FILE" | "VOICE";
  displayOrder?: number;
}

/**
 * 송신 가능 여부 — 첨부 유무에 따른 분기.
 *   - 첨부 0건: TEXT 메시지로 취급, body 1~5000자 필수 (canSendText 동등).
 *   - 첨부 1+건: body 는 캡션(0~5000자, 0 OK), 첨부 max 5장 강제.
 */
export function canSendMessage(
  raw: string,
  attachments: SendAttachment[] = [],
): boolean {
  if (attachments.length > MAX_ATTACHMENTS) return false;
  if (attachments.length > 0) {
    return raw.length <= MAX_BODY;
  }
  return canSendText(raw);
}

/**
 * 첨부 kind 합산 분기 — backend `MessageKind` 와 정합.
 *   - 모든 첨부가 IMAGE → "IMAGE" (라인식 사진 묶음)
 *   - 그 외 (FILE, VOICE 1건이라도 포함) → "FILE" (kind=VOICE 는 단일 메시지에 단일 voice 만이라 본 분기 미발생, 향후 분리 가능)
 */
export function inferMessageKind(
  attachments: SendAttachment[],
): "IMAGE" | "FILE" {
  if (attachments.length === 0) {
    // caller 가 첨부 없는 경로에서 호출하면 안 됨 — TEXT 분기는 prepareSendPayload 가 우선 처리.
    return "FILE";
  }
  return attachments.every((a) => a.kind === "IMAGE") ? "IMAGE" : "FILE";
}

export interface SendPayload {
  kind: "TEXT" | "IMAGE" | "FILE";
  /** TEXT 는 1+ 자 필수, IMAGE/FILE 은 캡션 (빈 문자열이면 null 로 보냄). */
  body: string | null;
  clientGeneratedId: string;
  replyToId?: string;
  mentions?: string[];
  attachments?: SendAttachment[];
}

export interface PrepareOptions {
  replyToId?: string | null;
  mentions?: string[];
  attachments?: SendAttachment[];
}

export function prepareSendPayload(
  raw: string,
  opts?: PrepareOptions,
): SendPayload {
  const attachments = opts?.attachments ?? [];
  const trimmed = raw.trim();

  let kind: SendPayload["kind"];
  let body: string | null;
  if (attachments.length > 0) {
    kind = inferMessageKind(attachments);
    body = trimmed.length > 0 ? trimmed : null; // 캡션 빈 문자열 → null
  } else {
    kind = "TEXT";
    body = trimmed;
  }

  const payload: SendPayload = {
    kind,
    body,
    clientGeneratedId: uuidv7(),
  };
  if (opts?.replyToId) {
    payload.replyToId = opts.replyToId;
  }
  if (opts?.mentions && opts.mentions.length > 0) {
    const deduped = Array.from(new Set(opts.mentions));
    if (deduped.length > 0) {
      payload.mentions = deduped;
    }
  }
  if (attachments.length > 0) {
    // displayOrder 정규화 — 미지정 시 배열 index 사용.
    payload.attachments = attachments.map((a, idx) => ({
      fileId: a.fileId,
      kind: a.kind,
      displayOrder: a.displayOrder ?? idx,
    }));
  }
  return payload;
}

export interface KeyEventLike {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
}

/**
 * Enter 송신 분기.
 *   - Enter 단독 → 송신
 *   - Shift+Enter → 줄바꿈 (송신 X)
 *   - IME composition 중 (한글 조합 확정 단계) → 송신 X
 */
export function shouldSubmitOnEnter(e: KeyEventLike): boolean {
  if (e.key !== "Enter") return false;
  if (e.shiftKey) return false;
  if (e.isComposing) return false;
  return true;
}
