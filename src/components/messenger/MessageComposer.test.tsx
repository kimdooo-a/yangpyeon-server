// @vitest-environment jsdom
/**
 * INFRA-2 Task #4 — MessageComposer 렌더 + 인터랙션 TDD (G-NEW-12 해소).
 *
 * 검증 범위:
 *   1. 초기 상태 — Send 버튼 disabled (body 빈 + 첨부 0)
 *   2. 텍스트 입력 → Send enabled → 클릭 시 onSend 호출 (kind=TEXT)
 *   3. 파일 선택 → uploadAttachment 호출 + 칩 추가 (uploading 상태)
 *   4. 업로드 완료 → 칩이 done 상태 + Send 활성
 *   5. 칩 제거 버튼 → 첨부 사라짐
 *   6. 업로드 중에는 Send disabled
 *
 * uploadAttachment 는 vi.mock 으로 제어 — 실제 네트워크 호출 0.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import type { SendPayload } from "@/lib/messenger/composer-logic";

let resolveUpload: ((value: { fileId: string; kind: "IMAGE" | "FILE" | "VOICE" }) => void) | null = null;
let uploadCalls = 0;

vi.mock("@/lib/messenger/attachment-upload", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/messenger/attachment-upload")
  >();
  return {
    ...actual,
    uploadAttachment: vi.fn((_file: File, _onProgress?: (pct: number) => void) => {
      uploadCalls++;
      return new Promise<{ fileId: string; kind: "IMAGE" | "FILE" | "VOICE" }>(
        (resolve) => {
          resolveUpload = resolve;
        },
      );
    }),
  };
});

import { MessageComposer } from "./MessageComposer";

beforeEach(() => {
  resolveUpload = null;
  uploadCalls = 0;
});

function fireFileChange(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, "files", {
    value: [file],
    configurable: true,
  });
  fireEvent.change(input);
}

describe("MessageComposer", () => {
  it("send button is disabled when body empty and no attachments", () => {
    const onSend = vi.fn();
    render(<MessageComposer onSend={onSend} />);
    const send = screen.getByRole("button", { name: "전송" });
    expect(send).toBeDisabled();
  });

  it("typing text enables send and click submits TEXT payload", async () => {
    const onSend = vi.fn();
    render(<MessageComposer onSend={onSend} />);

    const ta = screen.getByRole("textbox");
    fireEvent.change(ta, { target: { value: "안녕" } });

    const send = screen.getByRole("button", { name: "전송" });
    await waitFor(() => expect(send).not.toBeDisabled());
    fireEvent.click(send);

    expect(onSend).toHaveBeenCalledTimes(1);
    const payload = onSend.mock.calls[0]?.[0] as SendPayload;
    expect(payload.kind).toBe("TEXT");
    expect(payload.body).toBe("안녕");
  });

  it("choosing a file adds an uploading chip", async () => {
    render(<MessageComposer onSend={vi.fn()} />);

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    const file = new File(["data"], "photo.png", { type: "image/png" });
    fireFileChange(fileInput, file);

    await waitFor(() =>
      expect(screen.getByLabelText("첨부 photo.png")).toBeInTheDocument(),
    );
    expect(uploadCalls).toBe(1);

    // Send 는 업로드 중이라 disabled.
    expect(screen.getByRole("button", { name: "전송" })).toBeDisabled();
  });

  it("upload resolution flips chip to done and enables send", async () => {
    render(<MessageComposer onSend={vi.fn()} />);

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireFileChange(fileInput, new File(["data"], "p.png", { type: "image/png" }));

    await waitFor(() =>
      expect(screen.getByLabelText("첨부 p.png")).toBeInTheDocument(),
    );

    await act(async () => {
      resolveUpload?.({ fileId: "file-1", kind: "IMAGE" });
      // promise micro-task 비움
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "전송" })).not.toBeDisabled(),
    );
  });

  it("chip remove button drops the attachment", async () => {
    render(<MessageComposer onSend={vi.fn()} />);

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireFileChange(fileInput, new File(["data"], "p.png", { type: "image/png" }));

    await waitFor(() =>
      expect(screen.getByLabelText("첨부 p.png")).toBeInTheDocument(),
    );

    const removeBtn = screen.getByRole("button", { name: "p.png 첨부 제거" });
    fireEvent.click(removeBtn);

    expect(screen.queryByLabelText("첨부 p.png")).not.toBeInTheDocument();
  });
});
