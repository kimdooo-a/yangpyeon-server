"use client";

/**
 * MessageAttachment — 단일 메시지의 첨부 묶음 렌더 (M5-ATTACH-4, S96).
 *
 * 책임:
 *   - IMAGE: 썸네일 (단일 = max 240x240, 다수 = 2열 grid). 클릭 → 새 탭 원본.
 *   - FILE: 파일 아이콘 + 다운로드 버튼 (filebox /api/v1/filebox/files/{id}).
 *   - VOICE: 현재는 FILE 와 동일 처리 (Phase 1.x — 전용 player 별도 chunk).
 *
 * 의도적 보류:
 *   - lightbox / 갤러리 모드 (Phase 1.x 후속).
 *   - 비디오 인라인 (현재 mimeType 분류 X).
 *
 * fileId URL: filebox download endpoint 재사용 (`Content-Disposition: attachment`
 * 가 강제되지만 브라우저가 `<img src>` 에서 무시하므로 인라인 렌더 OK).
 *
 * jsdom 미도입 (S87-INFRA-1) → 본 컴포넌트는 단위 테스트 대상 아님.
 * 라이브 검증은 수동 영역 (다음 chunk M5-ATTACH-5 sweep e2e).
 */
import { Download, FileIcon, Mic } from "lucide-react";
import type { MessageAttachmentRow } from "@/lib/messenger/optimistic-messages";

interface Props {
  attachments: MessageAttachmentRow[];
  /** 회수된 메시지 — placeholder 만 표시 (file 자체는 30일 cron 까지 살아있음). */
  recalled?: boolean;
}

function fileUrl(fileId: string): string {
  return `/api/v1/filebox/files/${fileId}`;
}

function isImageKind(kind: string): boolean {
  return kind === "IMAGE";
}

function isVoiceKind(kind: string): boolean {
  return kind === "VOICE";
}

export function MessageAttachment({ attachments, recalled = false }: Props) {
  if (attachments.length === 0) return null;

  if (recalled) {
    return (
      <div
        className="text-[11px] text-gray-400 italic mt-1"
        aria-label="회수된 메시지 첨부"
      >
        🚫 첨부 {attachments.length}건 — 회수됨
      </div>
    );
  }

  // 정렬: displayOrder asc (서버가 이미 정렬해 보내지만 방어적으로 한 번 더).
  const sorted = [...attachments].sort(
    (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
  );

  const images = sorted.filter((a) => isImageKind(a.kind));
  const others = sorted.filter((a) => !isImageKind(a.kind));

  return (
    <div className="mt-1 space-y-1.5" aria-label={`첨부 ${attachments.length}건`}>
      {images.length > 0 && (
        <div
          className={
            images.length === 1
              ? ""
              : "grid grid-cols-2 gap-1 max-w-[260px]"
          }
        >
          {images.map((a) => (
            <a
              key={a.id}
              href={fileUrl(a.fileId)}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-md bg-surface-300/60"
              aria-label="이미지 새 탭에서 열기"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl(a.fileId)}
                alt="첨부 이미지"
                loading="lazy"
                className={
                  images.length === 1
                    ? "max-w-[240px] max-h-[240px] object-cover"
                    : "w-full h-28 object-cover"
                }
              />
            </a>
          ))}
        </div>
      )}
      {others.map((a) => (
        <a
          key={a.id}
          href={fileUrl(a.fileId)}
          target="_blank"
          rel="noopener noreferrer"
          download
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-surface-300/60 hover:bg-surface-300 text-gray-700 text-[12px] max-w-[260px]"
          aria-label={isVoiceKind(a.kind) ? "음성 다운로드" : "파일 다운로드"}
        >
          {isVoiceKind(a.kind) ? (
            <Mic size={14} aria-hidden />
          ) : (
            <FileIcon size={14} aria-hidden />
          )}
          <span className="flex-1 truncate font-medium">
            {isVoiceKind(a.kind) ? "음성 메시지" : "첨부 파일"}
          </span>
          <Download size={14} className="text-gray-500" aria-hidden />
        </a>
      ))}
    </div>
  );
}
