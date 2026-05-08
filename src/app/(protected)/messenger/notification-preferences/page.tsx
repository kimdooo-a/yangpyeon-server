"use client";

/**
 * /messenger/notification-preferences — 본인 알림 설정 (M6).
 *
 * 기능:
 *   - mentionsOnly 토글 (DM/멘션만 알림)
 *   - pushEnabled 토글 (전체 push)
 *   - dndStart/dndEnd HHMM 입력 (방해 금지 시간대)
 *   - 저장 PATCH /notification-preferences
 *
 * 사전 검증: backend zod HHMM_RE 와 같은 정규식 (notification-prefs.ts).
 */
import { useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import {
  isValidHHMM,
  isInDndWindow,
} from "@/lib/messenger/notification-prefs";

const TENANT_SLUG = "default";

interface PrefsRow {
  mentionsOnly: boolean;
  dndStart: string | null;
  dndEnd: string | null;
  pushEnabled: boolean;
}

const DEFAULT_PREFS: PrefsRow = {
  mentionsOnly: false,
  dndStart: null,
  dndEnd: null,
  pushEnabled: true,
};

export default function NotificationPrefsPage() {
  const [prefs, setPrefs] = useState<PrefsRow>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/v1/t/${TENANT_SLUG}/messenger/notification-preferences`)
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        if (!json?.success) {
          setError(json?.error?.message ?? "fetch 실패");
          return;
        }
        const p = json.data?.preferences as Partial<PrefsRow> | undefined;
        setPrefs({
          mentionsOnly: p?.mentionsOnly ?? false,
          dndStart: p?.dndStart ?? null,
          dndEnd: p?.dndEnd ?? null,
          pushEnabled: p?.pushEnabled ?? true,
        });
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "네트워크 오류"),
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const dndError = useMemo(() => {
    if (prefs.dndStart && !isValidHHMM(prefs.dndStart)) return "시작 시간 형식 오류 (HH:MM)";
    if (prefs.dndEnd && !isValidHHMM(prefs.dndEnd)) return "종료 시간 형식 오류 (HH:MM)";
    if ((prefs.dndStart && !prefs.dndEnd) || (!prefs.dndStart && prefs.dndEnd)) {
      return "시작과 종료를 모두 설정하거나 둘 다 비워주세요";
    }
    return null;
  }, [prefs.dndStart, prefs.dndEnd]);

  const nowInDnd = useMemo(() => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return isInDndWindow(`${hh}:${mm}`, prefs.dndStart, prefs.dndEnd);
  }, [prefs.dndStart, prefs.dndEnd]);

  const save = async () => {
    if (dndError) {
      toast.error(dndError);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/v1/t/${TENANT_SLUG}/messenger/notification-preferences`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(prefs),
        },
      );
      const json = await res.json();
      if (!res.ok || !json?.success) {
        toast.error(json?.error?.message ?? `저장 실패 (HTTP ${res.status})`);
      } else {
        toast.success("알림 설정을 저장했습니다");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="h-8 w-48 bg-surface-300 animate-pulse rounded mb-4" />
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 bg-surface-300 animate-pulse rounded"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <PageHeader
        title="알림 설정"
        description="DM/멘션 알림 및 방해 금지 시간 설정"
      />

      {error && (
        <div
          className="mt-4 text-sm text-red-600 p-3 bg-red-50 rounded"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="mt-6 space-y-4">
        <ToggleRow
          label="전체 알림 사용"
          description="끄면 DM/멘션 모두 알림이 발송되지 않습니다"
          checked={prefs.pushEnabled}
          onChange={(v) => setPrefs((p) => ({ ...p, pushEnabled: v }))}
        />
        <ToggleRow
          label="멘션만 알림 받기"
          description="@ 멘션 메시지만 알림 (DM 자체는 인앱 표시만)"
          checked={prefs.mentionsOnly}
          onChange={(v) => setPrefs((p) => ({ ...p, mentionsOnly: v }))}
          disabled={!prefs.pushEnabled}
        />

        <div className="bg-surface-100 border border-border rounded-md p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bell size={16} className="text-gray-500" aria-hidden />
            <span className="text-sm font-medium text-gray-800">
              방해 금지 시간대
            </span>
            {nowInDnd && (
              <span className="ml-auto text-[11px] px-2 py-0.5 bg-amber-100 text-amber-800 rounded">
                현재 활성
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="dnd-start"
                className="block text-[12px] text-gray-600 mb-1"
              >
                시작 (HH:MM)
              </label>
              <input
                id="dnd-start"
                type="text"
                placeholder="22:00"
                value={prefs.dndStart ?? ""}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    dndStart: e.target.value === "" ? null : e.target.value,
                  }))
                }
                className="w-full bg-surface-100 border border-border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="dnd-end"
                className="block text-[12px] text-gray-600 mb-1"
              >
                종료 (HH:MM)
              </label>
              <input
                id="dnd-end"
                type="text"
                placeholder="07:00"
                value={prefs.dndEnd ?? ""}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    dndEnd: e.target.value === "" ? null : e.target.value,
                  }))
                }
                className="w-full bg-surface-100 border border-border rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            야간 wrap 지원 — 22:00~07:00 형태도 가능. 빈 칸 두 곳이면 비활성.
          </p>
          {dndError && (
            <p className="text-[12px] text-red-600 mt-2" role="alert">
              {dndError}
            </p>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={save}
            disabled={saving || !!dndError}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:bg-surface-300 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start justify-between gap-4 p-4 bg-surface-100 border border-border rounded-md cursor-pointer ${
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-surface-200"
      }`}
    >
      <div>
        <div className="text-sm font-medium text-gray-800">{label}</div>
        <div className="text-[12px] text-gray-500 mt-0.5">{description}</div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-1 h-4 w-4 flex-shrink-0"
      />
    </label>
  );
}
