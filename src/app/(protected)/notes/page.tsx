import { PageHeader } from "@/components/ui/page-header";
import { StickyBoard } from "@/components/sticky-notes/sticky-board";

export default function NotesPage() {
  return (
    <div className="p-5 space-y-5">
      <PageHeader
        title="메모"
        description="윈도우 스티커처럼 자유롭게 배치되는 메모 보드. 공유 토글로 같은 테넌트 사용자에게 노출."
      />
      <StickyBoard />
    </div>
  );
}
