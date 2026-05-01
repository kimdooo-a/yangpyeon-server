"use client";

import { useRef } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StickyBoard, type StickyBoardHandle } from "@/components/sticky-notes/sticky-board";

export default function NotesPage() {
  const boardRef = useRef<StickyBoardHandle>(null);

  return (
    <div className="p-5 space-y-5">
      <PageHeader
        title="메모"
        description="윈도우 스티커처럼 자유롭게 배치되는 메모 보드. 공유 토글로 같은 테넌트 사용자에게 노출."
      >
        <button
          type="button"
          onClick={() => boardRef.current?.create()}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-md bg-brand text-white text-sm font-medium shadow hover:opacity-90 active:opacity-80 touch-manipulation"
        >
          <Plus size={16} /> 새 메모
        </button>
      </PageHeader>
      <StickyBoard ref={boardRef} />
    </div>
  );
}
