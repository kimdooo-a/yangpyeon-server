"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { IconEnv } from "@/components/ui/icons";
import { toast } from "sonner";

interface EnvEntry {
  key: string;
  value: string;
  sensitive: boolean;
}

export default function EnvPage() {
  const [list, setList] = useState<EnvEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // 추가 폼
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 인라인 편집
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // 민감 값 보기 토글 (키 단위)
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>(
    {},
  );

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/env");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setList(data.list ?? []);
    } catch {
      toast.error("환경변수 조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // 추가
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/settings/env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: newKey.trim(), value: newValue.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "추가 실패");
        return;
      }

      toast.success(`${newKey} 저장 완료`);
      setNewKey("");
      setNewValue("");
      // 보기 캐시 초기화
      setRevealedKeys(new Set());
      setRevealedValues({});
      fetchList();
    } catch {
      toast.error("환경변수 추가 실패");
    } finally {
      setSubmitting(false);
    }
  };

  // 삭제
  const handleDelete = async (key: string) => {
    if (!confirm(`"${key}" 환경변수를 삭제하시겠습니까?`)) return;

    try {
      const res = await fetch("/api/settings/env", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "삭제 실패");
        return;
      }

      toast.success(`${key} 삭제 완료`);
      // 보기 캐시에서 제거
      setRevealedKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setRevealedValues((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      fetchList();
    } catch {
      toast.error("환경변수 삭제 실패");
    }
  };

  // 인라인 수정 시작
  const startEdit = async (entry: EnvEntry) => {
    setEditingKey(entry.key);

    // 민감 키인 경우 원본 값 가져오기
    if (entry.sensitive) {
      try {
        const res = await fetch(
          `/api/settings/env?reveal=true&key=${encodeURIComponent(entry.key)}`,
        );
        if (res.ok) {
          const data = await res.json();
          setEditValue(data.value);
          return;
        }
      } catch {
        // 실패 시 빈 값으로
      }
      setEditValue("");
    } else {
      setEditValue(entry.value);
    }
  };

  // 인라인 수정 저장
  const saveEdit = async () => {
    if (!editingKey || !editValue.trim()) return;

    try {
      const res = await fetch("/api/settings/env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: editingKey, value: editValue.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "수정 실패");
        return;
      }

      toast.success(`${editingKey} 수정 완료`);
      setEditingKey(null);
      setEditValue("");
      // 보기 캐시 초기화
      setRevealedKeys(new Set());
      setRevealedValues({});
      fetchList();
    } catch {
      toast.error("환경변수 수정 실패");
    }
  };

  // 민감 값 보기/숨기기 토글
  const toggleReveal = async (key: string) => {
    if (revealedKeys.has(key)) {
      // 숨기기
      setRevealedKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      return;
    }

    // 원본 값 요청
    try {
      const res = await fetch(
        `/api/settings/env?reveal=true&key=${encodeURIComponent(key)}`,
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRevealedValues((prev) => ({ ...prev, [key]: data.value }));
      setRevealedKeys((prev) => new Set(prev).add(key));
    } catch {
      toast.error("값 조회 실패");
    }
  };

  // 표시할 값 결정
  const displayValue = (entry: EnvEntry): string => {
    if (entry.sensitive && revealedKeys.has(entry.key)) {
      return revealedValues[entry.key] ?? entry.value;
    }
    return entry.value;
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="환경변수 관리"
        description=".env 파일의 환경변수를 조회하고 관리합니다"
      />

      {/* 경고 배너 */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 flex items-start gap-3">
        <IconEnv size={18} className="text-yellow-500 mt-0.5 shrink-0" />
        <p className="text-sm text-yellow-600">
          환경변수 변경은 <strong>PM2 재시작 후</strong> 완전 적용됩니다.
          일부 라이브러리는 초기화 시 값을 캐시하므로 재시작이 필요합니다.
        </p>
      </div>

      {/* 추가 폼 */}
      <div className="bg-surface-200 border border-border rounded-lg">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-medium">환경변수 추가</h2>
        </div>
        <form onSubmit={handleAdd} className="p-5 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="KEY (대문자_언더스코어)"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value.toUpperCase())}
            className="flex-1 bg-surface-300 border border-border rounded-md px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-brand font-mono"
            required
          />
          <input
            type="text"
            placeholder="VALUE"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="flex-1 bg-surface-300 border border-border rounded-md px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-brand"
            required
          />
          <button
            type="submit"
            disabled={submitting || !newKey.trim() || !newValue.trim()}
            className="px-4 py-2 bg-brand text-black text-sm font-medium rounded-md hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {submitting ? "저장 중..." : "추가"}
          </button>
        </form>
      </div>

      {/* 환경변수 테이블 */}
      <div className="bg-surface-200 border border-border rounded-lg">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-medium">
            환경변수 목록 ({list.length})
          </h2>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-gray-500 text-sm">
            로딩 중...
          </div>
        ) : list.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-500 text-sm">
            .env 파일에 등록된 환경변수가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-gray-500">
                  <th className="px-5 py-2.5 text-left font-medium">키</th>
                  <th className="px-5 py-2.5 text-left font-medium">값</th>
                  <th className="px-5 py-2.5 text-right font-medium">액션</th>
                </tr>
              </thead>
              <tbody>
                {list.map((entry) => (
                  <tr
                    key={entry.key}
                    className="border-b border-border last:border-b-0 hover:bg-surface-300 transition-colors"
                  >
                    {/* 키 */}
                    <td className="px-5 py-2.5 text-gray-800 font-mono text-xs whitespace-nowrap">
                      {entry.key}
                      {entry.sensitive && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-yellow-50 text-yellow-600 rounded">
                          민감
                        </span>
                      )}
                    </td>

                    {/* 값 */}
                    <td className="px-5 py-2.5 text-gray-500 font-mono text-xs max-w-xs">
                      {editingKey === entry.key ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit();
                              if (e.key === "Escape") {
                                setEditingKey(null);
                                setEditValue("");
                              }
                            }}
                            className="flex-1 bg-surface-300 border border-brand rounded-md px-2 py-1 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-brand"
                            autoFocus
                          />
                          <button
                            onClick={saveEdit}
                            className="text-brand hover:text-brand/80 text-xs transition-colors shrink-0"
                          >
                            저장
                          </button>
                          <button
                            onClick={() => {
                              setEditingKey(null);
                              setEditValue("");
                            }}
                            className="text-gray-500 hover:text-gray-700 text-xs transition-colors shrink-0"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="truncate block max-w-[300px]">
                            {displayValue(entry)}
                          </span>
                          {entry.sensitive && (
                            <button
                              onClick={() => toggleReveal(entry.key)}
                              className="text-gray-500 hover:text-gray-700 text-[11px] transition-colors shrink-0"
                            >
                              {revealedKeys.has(entry.key) ? "숨기기" : "보기"}
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    {/* 액션 */}
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      {editingKey !== entry.key && (
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => startEdit(entry)}
                            className="text-gray-500 hover:text-gray-800 text-xs transition-colors"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleDelete(entry.key)}
                            className="text-red-600 hover:text-red-700 text-xs transition-colors"
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
