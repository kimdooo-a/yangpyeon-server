/**
 * Message composer pure logic — F2-1 (M4 Phase 2).
 *
 * UI (`MessageComposer.tsx`) 와 분리된 검증/페이로드 빌드.
 * Backend zod schema (`sendMessageSchema`) 와 정합 — body 1~5000자, kind=TEXT.
 * F2-1 범위: TEXT 만. F2-3 에서 replyToId / mentions 옵션 추가.
 */
import { uuidv7 } from "./uuidv7";

const MAX_BODY = 5000;

export function canSendText(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length < 1) return false;
  if (raw.length > MAX_BODY) return false; // raw (trim 전) 기준으로 server validation 정합
  return true;
}

export interface SendPayload {
  kind: "TEXT";
  body: string;
  clientGeneratedId: string;
  replyToId?: string;
  mentions?: string[];
}

export interface PrepareOptions {
  replyToId?: string | null;
  mentions?: string[];
}

export function prepareSendPayload(
  raw: string,
  opts?: PrepareOptions,
): SendPayload {
  const payload: SendPayload = {
    kind: "TEXT",
    body: raw.trim(),
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
