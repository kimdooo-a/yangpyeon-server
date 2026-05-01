"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";
import { StickyNoteCard, type StickyNote } from "./sticky-note-card";

const DEFAULT_COLOR = "#fde68a";
const NEW_NOTE_OFFSET = 32; // 새 메모 생성 시 누적 오프셋

export interface StickyBoardHandle {
  create: () => Promise<void>;
}

// + 새 메모 버튼은 page 레벨 PageHeader children 으로 옮겨졌다 (모바일 status-bar / notch
// 영역의 hit-test 충돌을 피하기 위해). board 는 표시 + 편집만 담당하고, 생성 트리거는
// 외부에서 ref.create() 로 호출한다.
export const StickyBoard = forwardRef<StickyBoardHandle>(function StickyBoard(_, ref) {
  const { user } = useCurrentUser();
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/sticky-notes");
      const json = await res.json();
      if (json.success) setNotes(json.data);
    } catch {
      // 무시
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const patch = useCallback(
    async (id: string, patch: Partial<StickyNote>) => {
      // 낙관적 업데이트.
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
      const res = await fetch(`/api/v1/sticky-notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        toast.error(json?.error?.message ?? "메모 수정 실패");
        refresh();
      }
    },
    [refresh],
  );

  const handleCreate = useCallback(async () => {
    const offsetCount = notes.length;
    const res = await fetch("/api/v1/sticky-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "",
        color: DEFAULT_COLOR,
        posX: 40 + offsetCount * NEW_NOTE_OFFSET,
        posY: 40 + offsetCount * NEW_NOTE_OFFSET,
      }),
    });
    const json = await res.json();
    if (!json.success) {
      toast.error(json.error?.message ?? "메모 생성 실패");
      return;
    }
    setNotes((prev) => [...prev, json.data]);
  }, [notes.length]);

  useImperativeHandle(ref, () => ({ create: handleCreate }), [handleCreate]);

  const handleDelete = useCallback(async (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    const res = await fetch(`/api/v1/sticky-notes/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      toast.error(json?.error?.message ?? "삭제 실패");
      refresh();
    }
  }, [refresh]);

  return (
    <div className="relative w-full h-[calc(100vh-12rem)] overflow-auto rounded-md border border-border bg-surface-200">
      {loading && (
        <div className="p-8 text-sm text-gray-500">메모 불러오는 중…</div>
      )}

      {!loading && notes.length === 0 && (
        <div className="p-12 text-center text-sm text-gray-500">
          아직 메모가 없습니다. 상단의 <strong>+ 새 메모</strong> 버튼으로 첫 메모를 만들어 보세요.
        </div>
      )}

      {notes.map((note) => (
        <StickyNoteCard
          key={note.id}
          note={note}
          isOwner={user?.sub === note.ownerId}
          onPositionChange={(id, posX, posY) => patch(id, { posX, posY })}
          onContentChange={(id, content) => patch(id, { content })}
          onColorChange={(id, color) => patch(id, { color })}
          onToggleShare={(id, visibility) => patch(id, { visibility })}
          onTogglePin={(id, pinned) => patch(id, { pinned })}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
});
