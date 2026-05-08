"use client";

/**
 * useSse — EventSource 래퍼 react hook (M4 Phase 2 F2-4 + INFRA-1).
 *
 * 책임:
 *   - url 이 string → EventSource 생성 + 표준 messenger 이벤트 listener 등록
 *   - url 이 null → 미연결 (대화 미선택 시)
 *   - url 변경 → 이전 close + 새 연결
 *   - unmount → cleanup
 *
 * 이벤트 디스패치는 `parseSseEvent` 로 typed shape 변환 후 onEvent 콜백.
 *
 * 자동 재연결: EventSource 표준 동작 (browser native) 그대로 사용. catchup
 * (Last-Event-ID) 은 backend Phase 1 미지원 — 클라이언트 dedupe 로 보완.
 */
import { useEffect, useRef, useState } from "react";
import { parseSseEvent, type RealtimeEvent } from "@/lib/messenger/sse-events";

const EVENT_NAMES = [
  "ready",
  "message.created",
  "message.updated",
  "message.deleted",
  "typing.started",
  "typing.stopped",
  "receipt.updated",
  "member.joined",
  "member.left",
] as const;

export interface UseSseResult {
  connected: boolean;
}

export function useSse(
  url: string | null,
  onEvent: (e: RealtimeEvent) => void,
): UseSseResult {
  const [connected, setConnected] = useState(false);
  // onEvent ref — listener 가 stale closure 잡지 않도록.
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!url) {
      setConnected(false);
      return;
    }
    if (typeof EventSource === "undefined") {
      // SSR / 환경 부재 — silent skip.
      return;
    }
    const es = new EventSource(url, { withCredentials: true });
    setConnected(false);

    const handlers = new Map<string, (e: MessageEvent) => void>();
    for (const name of EVENT_NAMES) {
      const handler = (e: MessageEvent) => {
        const parsed = parseSseEvent(name, e.data);
        if (name === "ready") setConnected(true);
        onEventRef.current(parsed);
      };
      es.addEventListener(name, handler);
      handlers.set(name, handler);
    }

    return () => {
      for (const [name, handler] of handlers) {
        es.removeEventListener(name, handler);
      }
      es.close();
      setConnected(false);
    };
  }, [url]);

  return { connected };
}
