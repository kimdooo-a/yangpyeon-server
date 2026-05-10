// @vitest-environment jsdom
/**
 * INFRA-2 Task #4 — MessageAttachment 렌더 TDD (G-NEW-12 해소).
 *
 * 검증 범위:
 *   1. 빈 배열 → null 렌더 (DOM 진입 0)
 *   2. 단일 IMAGE — 240x240 cap, target=_blank, lazy loading
 *   3. 다중 IMAGE — 2열 grid + 모두 a/href fileUrl
 *   4. FILE — 다운로드 anchor + Mic 아이콘 X (FILE 분기)
 *   5. VOICE — Mic 아이콘 + "음성 메시지" 라벨
 *   6. recalled=true → placeholder ("🚫 첨부 N건 — 회수됨") + 실 첨부 hidden
 *   7. displayOrder asc 정렬 (서버 보내기 무관)
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { MessageAttachmentRow } from "@/lib/messenger/optimistic-messages";
import { MessageAttachment } from "./MessageAttachment";

function row(overrides: Partial<MessageAttachmentRow>): MessageAttachmentRow {
  return {
    id: "att-default",
    fileId: "file-default",
    kind: "FILE",
    displayOrder: 0,
    ...overrides,
  };
}

describe("MessageAttachment", () => {
  it("renders nothing when attachments empty", () => {
    const { container } = render(<MessageAttachment attachments={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders single image with 240px cap and lazy loading", () => {
    const single: MessageAttachmentRow[] = [
      row({ id: "a1", fileId: "img-1", kind: "IMAGE" }),
    ];
    render(<MessageAttachment attachments={single} />);

    const img = screen.getByRole("img", { name: "첨부 이미지" });
    expect(img).toHaveAttribute("src", "/api/v1/filebox/files/img-1");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img.className).toContain("max-w-[240px]");

    const link = img.closest("a");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders multiple images in 2-col grid", () => {
    const multi: MessageAttachmentRow[] = [
      row({ id: "a1", fileId: "img-1", kind: "IMAGE", displayOrder: 0 }),
      row({ id: "a2", fileId: "img-2", kind: "IMAGE", displayOrder: 1 }),
      row({ id: "a3", fileId: "img-3", kind: "IMAGE", displayOrder: 2 }),
    ];
    const { container } = render(<MessageAttachment attachments={multi} />);

    const imgs = screen.getAllByRole("img", { name: "첨부 이미지" });
    expect(imgs).toHaveLength(3);

    const grid = container.querySelector("[class*='grid-cols-2']");
    expect(grid).not.toBeNull();
  });

  it("renders FILE attachment as download anchor with file icon", () => {
    const file: MessageAttachmentRow[] = [
      row({ id: "a1", fileId: "doc-1", kind: "FILE" }),
    ];
    render(<MessageAttachment attachments={file} />);

    const link = screen.getByRole("link", { name: "파일 다운로드" });
    expect(link).toHaveAttribute("href", "/api/v1/filebox/files/doc-1");
    expect(link).toHaveAttribute("download");
    expect(within(link).getByText("첨부 파일")).toBeInTheDocument();
  });

  it("renders VOICE attachment with mic icon and voice label", () => {
    const voice: MessageAttachmentRow[] = [
      row({ id: "a1", fileId: "v-1", kind: "VOICE" }),
    ];
    render(<MessageAttachment attachments={voice} />);

    const link = screen.getByRole("link", { name: "음성 다운로드" });
    expect(within(link).getByText("음성 메시지")).toBeInTheDocument();
  });

  it("recalled=true shows placeholder, hides real attachments", () => {
    const recalled: MessageAttachmentRow[] = [
      row({ id: "a1", fileId: "img-1", kind: "IMAGE" }),
      row({ id: "a2", fileId: "doc-1", kind: "FILE" }),
    ];
    render(<MessageAttachment attachments={recalled} recalled />);

    expect(screen.getByText(/🚫 첨부 2건 — 회수됨/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("sorts by displayOrder asc regardless of input order", () => {
    const unordered: MessageAttachmentRow[] = [
      row({ id: "a3", fileId: "img-3", kind: "IMAGE", displayOrder: 2 }),
      row({ id: "a1", fileId: "img-1", kind: "IMAGE", displayOrder: 0 }),
      row({ id: "a2", fileId: "img-2", kind: "IMAGE", displayOrder: 1 }),
    ];
    render(<MessageAttachment attachments={unordered} />);

    const imgs = screen.getAllByRole("img", { name: "첨부 이미지" });
    expect(imgs[0]?.getAttribute("src")).toBe("/api/v1/filebox/files/img-1");
    expect(imgs[1]?.getAttribute("src")).toBe("/api/v1/filebox/files/img-2");
    expect(imgs[2]?.getAttribute("src")).toBe("/api/v1/filebox/files/img-3");
  });
});
