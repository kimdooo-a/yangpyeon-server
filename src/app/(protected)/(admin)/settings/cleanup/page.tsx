"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Trash2 } from "lucide-react";

interface CleanupSummary {
  [task: string]: number | string;
}

interface LastRun {
  summary: CleanupSummary;
  executedAt: string;
}

/**
 * 관리자 수동 cleanup 실행 페이지.
 *
 * 세션 35 자동 스케줄러(`src/lib/cleanup-scheduler.ts`, KST 03:00)와 병행 사용.
 * 버튼 클릭 시 4종 cleanup(sessions/rate-limit/jwks-retired/webauthn-challenges) 즉시 실행.
 */
export default function CleanupPage() {
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<LastRun | null>(null);

  async function runNow() {
    if (!confirm("지금 4종 cleanup 을 실행하시겠습니까?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/cleanup/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "실행 실패");
      }
      setLast({ summary: data.data.summary, executedAt: data.data.executedAt });
      toast.success("Cleanup 실행 완료");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "오류");
    } finally {
      setBusy(false);
    }
  }

  function renderValue(v: number | string) {
    if (typeof v === "number") {
      return <span className="font-mono text-green-700">{v}행 삭제</span>;
    }
    return <span className="font-mono text-red-600 break-all">{v}</span>;
  }

  const taskLabels: Record<string, string> = {
    sessions: "세션 (expires_at < NOW() - 1일)",
    "rate-limit": "Rate Limit 버킷 (window_start < NOW() - 1일)",
    jwks: "JWKS RETIRED 키 (retire_at < NOW())",
    "webauthn-challenges": "WebAuthn 챌린지 (expires_at < NOW())",
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Cleanup 수동 실행"
        description="만료 레코드 4종 즉시 정리 (세션/Rate Limit/JWKS/WebAuthn 챌린지)"
      />

      <Card>
        <CardHeader>
          <CardTitle>자동 스케줄 정보</CardTitle>
          <CardDescription>
            매일 KST 03:00 에 자동 실행됩니다. 본 페이지 버튼은 긴급 정리용.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-sm space-y-1.5 text-gray-600">
            <li>• 세션 — 만료 1일 경과분 삭제 (감사용 grace 포함)</li>
            <li>• Rate Limit 버킷 — 1일 경과 윈도우 삭제</li>
            <li>• JWKS RETIRED 키 — grace 만료분 삭제</li>
            <li>• WebAuthn 챌린지 — 5분 만료분 삭제 (일반적으로 많지 않음)</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>즉시 실행</CardTitle>
          <CardDescription>
            ADMIN 권한 필요. 감사 로그 action=CLEANUP_EXECUTED_MANUAL 기록.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <button
            onClick={runNow}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-black text-sm font-medium rounded-md hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 size={16} />
            {busy ? "실행 중..." : "지금 정리 실행"}
          </button>

          {last && (
            <div className="border border-border rounded-md p-4 bg-surface-300">
              <div className="text-xs text-gray-500 mb-2">
                실행 시각: {new Date(last.executedAt).toLocaleString("ko-KR")}
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(last.summary).map(([task, value]) => (
                    <tr key={task} className="border-b border-border last:border-b-0">
                      <td className="py-1.5 pr-4 text-gray-700">
                        {taskLabels[task] ?? task}
                      </td>
                      <td className="py-1.5 text-right">{renderValue(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
