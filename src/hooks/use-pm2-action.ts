"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";

type Pm2Action = "restart" | "stop" | "start";

const ACTION_LABELS: Record<Pm2Action, string> = {
  restart: "재시작",
  stop: "중지",
  start: "시작",
};

interface UsePm2ActionOptions {
  onSuccess?: () => void;
}

export function usePm2Action({ onSuccess }: UsePm2ActionOptions = {}) {
  const [pending, setPending] = useState<string | null>(null);

  const execute = useCallback(
    async (name: string, action: Pm2Action) => {
      const label = ACTION_LABELS[action];
      setPending(`${name}:${action}`);

      try {
        const res = await fetch(`/api/pm2/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? `${label} 실패`);
        }

        toast.success(`${name} ${label} 완료`);
        // 프로세스 목록 갱신을 위해 약간의 지연
        setTimeout(() => onSuccess?.(), 800);
      } catch (err) {
        toast.error(
          `${name} ${label} 실패`,
          { description: err instanceof Error ? err.message : "알 수 없는 오류" }
        );
      } finally {
        setPending(null);
      }
    },
    [onSuccess]
  );

  const isPending = (name: string, action: Pm2Action) =>
    pending === `${name}:${action}`;

  return { execute, isPending, pending };
}
