"use client";

/**
 * MessageSearch — 본문 검색 input + 결과 list (M5).
 *
 * 사용 위치:
 *   /messenger 페이지 우측 빈상태 영역 (대화 미선택 시 검색 가능).
 *   /messenger/[id] 페이지 헤더 search 버튼 (Phase 2 후속).
 *
 * 정책:
 *   - 사용자 Enter 또는 검색 버튼 명시 trigger (debounce 별도 chunk).
 *   - canSearch 결과로 disabled 분기.
 *   - 결과 클릭 → 해당 conv 로 이동 + 메시지 highlight (Phase 2 후속).
 *   - 본문 매칭 영역은 highlightMatches 로 <mark> 처리.
 */
import { useState, type FormEvent } from "react";
import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMessageSearch } from "@/hooks/messenger/useMessageSearch";
import {
  canSearch,
  highlightMatches,
} from "@/lib/messenger/search-query";

export interface MessageSearchProps {
  /** 특정 대화 안 검색만 (옵션). undefined 면 전체 멤버 conv 대상. */
  convId?: string;
}

export function MessageSearch({ convId }: MessageSearchProps) {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { results, loading, error, hasMore, search, reset } = useMessageSearch();
  const sendable = canSearch(query);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!sendable) return;
    void search(query, convId);
  };

  const handleClear = () => {
    setQuery("");
    reset();
  };

  return (
    <div className="w-full max-w-2xl mx-auto py-6 px-4 flex flex-col gap-4">
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2"
        role="search"
        aria-label="메시지 본문 검색"
      >
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              convId
                ? "이 대화 안에서 검색 (Enter)"
                : "30일 이내 본문 검색 (Enter)"
            }
            aria-label="검색어"
            maxLength={100}
            className="w-full pl-9 pr-9 py-2.5 bg-surface-100 border border-border rounded-md text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="검색어 지우기"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-surface-200"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={!sendable || loading}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:bg-surface-300 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? "검색 중…" : "검색"}
        </button>
      </form>

      {error && (
        <div className="text-sm text-red-600 px-1" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && results.length > 0 && (
        <ul className="divide-y divide-border bg-surface-100 rounded-md border border-border">
          {results.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => router.push(`/messenger/${row.conversationId}`)}
                className="w-full text-left px-4 py-3 hover:bg-surface-200 focus:bg-surface-200 focus:outline-none"
              >
                <div className="text-[11px] text-gray-500 mb-1">
                  대화 {row.conversationId.slice(0, 8)} ·{" "}
                  {new Date(row.createdAt).toLocaleString("ko-KR", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </div>
                <div className="text-sm text-gray-800">
                  {row.body
                    ? highlightMatches(row.body, query).map((seg, i) => (
                        <span
                          key={i}
                          className={
                            seg.match ? "bg-yellow-200 font-semibold" : ""
                          }
                        >
                          {seg.text}
                        </span>
                      ))
                    : "(본문 없음)"}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && results.length === 0 && query && canSearch(query) && (
        <div className="text-sm text-gray-500 text-center py-6">
          검색 결과가 없습니다 (30일 이내 본문 기준)
        </div>
      )}

      {hasMore && (
        <p className="text-[11px] text-gray-400 text-center">
          더 많은 결과가 있습니다 — 페이지네이션은 후속 chunk.
        </p>
      )}
    </div>
  );
}
