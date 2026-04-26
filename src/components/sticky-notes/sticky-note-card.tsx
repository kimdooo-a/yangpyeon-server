"use client";

import { useEffect, useRef, useState } from "react";
import { Pin, Share2, Lock, Trash2, Palette } from "lucide-react";

export interface StickyNote {
  id: string;
  ownerId: string;
  content: string;
  color: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  visibility: "PRIVATE" | "SHARED";
  pinned: boolean;
  updatedAt: string;
}

const COLOR_PALETTE = [
  "#fde68a", // yellow
  "#fca5a5", // red
  "#86efac", // green
  "#93c5fd", // blue
  "#c4b5fd", // purple
  "#f9a8d4", // pink
  "#e5e7eb", // gray
];

interface Props {
  note: StickyNote;
  isOwner: boolean;
  onPositionChange: (id: string, posX: number, posY: number) => void;
  onContentChange: (id: string, content: string) => void;
  onColorChange: (id: string, color: string) => void;
  onToggleShare: (id: string, visibility: "PRIVATE" | "SHARED") => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
}

export function StickyNoteCard({
  note,
  isOwner,
  onPositionChange,
  onContentChange,
  onColorChange,
  onToggleShare,
  onTogglePin,
  onDelete,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: note.posX, y: note.posY });
  const [content, setContent] = useState(note.content);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const draggingRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  // 외부 갱신(다른 사용자가 SHARED 메모를 옮긴 경우 등) 동기화.
  useEffect(() => {
    setPosition({ x: note.posX, y: note.posY });
  }, [note.posX, note.posY]);
  useEffect(() => {
    setContent(note.content);
  }, [note.content]);

  const startDrag = (e: React.MouseEvent) => {
    if (!isOwner) return;
    draggingRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: position.x,
      baseY: position.y,
    };
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", endDrag, { once: true });
  };

  const onDrag = (e: MouseEvent) => {
    const d = draggingRef.current;
    if (!d) return;
    const x = Math.max(0, d.baseX + (e.clientX - d.startX));
    const y = Math.max(0, d.baseY + (e.clientY - d.startY));
    setPosition({ x, y });
  };

  const endDrag = () => {
    document.removeEventListener("mousemove", onDrag);
    const d = draggingRef.current;
    draggingRef.current = null;
    if (!d) return;
    onPositionChange(note.id, position.x, position.y);
  };

  const handleContentBlur = () => {
    if (content !== note.content) onContentChange(note.id, content);
  };

  const sharedBadge = note.visibility === "SHARED";

  return (
    <div
      ref={cardRef}
      className="absolute rounded-md shadow-lg border border-black/10 flex flex-col"
      style={{
        left: position.x,
        top: position.y,
        width: note.width,
        height: note.height,
        backgroundColor: note.color,
        zIndex: note.pinned ? 20 : 10,
      }}
    >
      {/* 헤더: 드래그 핸들 + 액션 */}
      <div
        className={`flex items-center gap-1 px-2 py-1 border-b border-black/10 ${
          isOwner ? "cursor-grab active:cursor-grabbing" : "cursor-default"
        }`}
        onMouseDown={startDrag}
      >
        <span className="text-[10px] text-black/50 truncate flex-1">
          {sharedBadge ? "공유" : "내 메모"}
          {!isOwner && " · 읽기전용"}
        </span>
        {isOwner && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPaletteOpen((v) => !v);
              }}
              className="p-1 text-black/60 hover:text-black"
              title="색 변경"
            >
              <Palette size={12} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(note.id, !note.pinned);
              }}
              className={`p-1 ${note.pinned ? "text-black" : "text-black/50 hover:text-black"}`}
              title={note.pinned ? "고정 해제" : "고정"}
            >
              <Pin size={12} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleShare(note.id, sharedBadge ? "PRIVATE" : "SHARED");
              }}
              className="p-1 text-black/60 hover:text-black"
              title={sharedBadge ? "비공개로" : "공유하기"}
            >
              {sharedBadge ? <Share2 size={12} /> : <Lock size={12} />}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("이 메모를 삭제하시겠습니까?")) onDelete(note.id);
              }}
              className="p-1 text-black/60 hover:text-red-700"
              title="삭제"
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>

      {paletteOpen && isOwner && (
        <div className="flex gap-1 px-2 py-1 border-b border-black/10 bg-black/5">
          {COLOR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                onColorChange(note.id, c);
                setPaletteOpen(false);
              }}
              className="w-4 h-4 rounded-full border border-black/20"
              style={{ backgroundColor: c }}
              aria-label={`색상 ${c}`}
            />
          ))}
        </div>
      )}

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onBlur={handleContentBlur}
        readOnly={!isOwner}
        placeholder={isOwner ? "메모를 입력하세요…" : ""}
        className="flex-1 w-full px-3 py-2 bg-transparent text-sm text-black/80 placeholder:text-black/40 resize-none focus:outline-none"
      />
    </div>
  );
}
