"use client";

/**
 * 범용 SSE 구독 훅
 * - EventSource 연결 + 자동 재연결
 * - maxRetries 실패 시 폴링 폴백
 * - 연결 상태 반환 (connected, connecting, disconnected, fallback)
 */
import { useEffect, useRef, useState, useCallback } from "react";

export type SseStatus = "connected" | "connecting" | "disconnected" | "fallback";

export interface UseSseOptions<T> {
  /** SSE 엔드포인트 URL */
  url: string;
  /** 메시지 수신 콜백 */
  onMessage: (data: T) => void;
  /** SSE 실패 시 폴링 폴백 함수 */
  fallbackFn?: () => Promise<void>;
  /** 폴백 폴링 간격 (ms, 기본 30000) */
  fallbackInterval?: number;
  /** 최대 재시도 횟수 (기본 3) */
  maxRetries?: number;
  /** 활성화 여부 (기본 true) */
  enabled?: boolean;
}

export interface UseSseReturn {
  /** 현재 연결 상태 */
  status: SseStatus;
  /** 수동 재연결 */
  reconnect: () => void;
}

export function useSse<T>(options: UseSseOptions<T>): UseSseReturn {
  const {
    url,
    onMessage,
    fallbackFn,
    fallbackInterval = 30_000,
    maxRetries = 3,
    enabled = true,
  } = options;

  const [status, setStatus] = useState<SseStatus>("disconnected");

  // ref로 최신 콜백 유지 (useEffect 재실행 방지)
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const fallbackFnRef = useRef(fallbackFn);
  fallbackFnRef.current = fallbackFn;

  // 재연결 트리거용 카운터
  const [connectTrigger, setConnectTrigger] = useState(0);

  const reconnect = useCallback(() => {
    setConnectTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus("disconnected");
      return;
    }

    let eventSource: EventSource | null = null;
    let retryCount = 0;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    // ── 폴백 모드 시작 ─────────────────────────────────────
    function startFallback() {
      if (disposed) return;
      setStatus("fallback");

      // 즉시 한 번 실행
      fallbackFnRef.current?.();

      fallbackTimer = setInterval(() => {
        if (disposed) return;
        fallbackFnRef.current?.();
      }, fallbackInterval);
    }

    // ── 폴백 모드 정리 ─────────────────────────────────────
    function stopFallback() {
      if (fallbackTimer) {
        clearInterval(fallbackTimer);
        fallbackTimer = null;
      }
    }

    // ── SSE 연결 생성 ──────────────────────────────────────
    function connect() {
      if (disposed) return;

      // 이전 연결 정리
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      stopFallback();

      setStatus("connecting");
      eventSource = new EventSource(url);

      eventSource.onopen = () => {
        if (disposed) return;
        retryCount = 0;
        setStatus("connected");
      };

      eventSource.onmessage = (event) => {
        if (disposed) return;
        try {
          const data = JSON.parse(event.data) as T;
          onMessageRef.current(data);
        } catch {
          // JSON 파싱 실패 무시
        }
      };

      eventSource.onerror = () => {
        if (disposed) return;

        // EventSource 닫기
        eventSource?.close();
        eventSource = null;

        retryCount++;

        if (retryCount > maxRetries) {
          // 재시도 한도 초과 → 폴백 모드
          if (fallbackFnRef.current) {
            startFallback();
          } else {
            setStatus("disconnected");
          }
          return;
        }

        // 지수 백오프 재연결 (1초, 2초, 4초...)
        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10_000);
        setStatus("connecting");
        retryTimer = setTimeout(() => {
          if (!disposed) connect();
        }, delay);
      };
    }

    connect();

    // ── 클린업 ─────────────────────────────────────────────
    return () => {
      disposed = true;
      eventSource?.close();
      eventSource = null;
      stopFallback();
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };
  }, [url, enabled, maxRetries, fallbackInterval, connectTrigger]);

  return { status, reconnect };
}
