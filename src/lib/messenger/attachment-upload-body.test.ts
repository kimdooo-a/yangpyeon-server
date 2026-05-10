// @vitest-environment jsdom
/**
 * INFRA-2 Task #3 — uploadAttachment 본체 jsdom+MSW 단위 테스트.
 *
 * 검증 범위:
 *   1. Local upload happy (≤50MB) → fileId + kind 반환
 *   2. Local upload server error → Error throw with server message
 *   3. 5GB 초과 → 즉시 throw, 네트워크 호출 0
 *   4. Multipart happy (>50MB) → init → part → complete → fileId
 *   5. Multipart complete 실패 → abort 호출 후 throw
 *
 * 기존 `attachment-upload.test.ts` 는 classifyAttachmentKind pure logic 9 PASS — 본 file 는 본체.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { uploadAttachment } from "./attachment-upload";

const FILEBOX_LOCAL = "/api/v1/filebox/files";
const FILEBOX_INIT = "/api/v1/filebox/files/upload-multipart/init";
const FILEBOX_PART = "/api/v1/filebox/files/upload-multipart/part";
const FILEBOX_COMPLETE = "/api/v1/filebox/files/upload-multipart/complete";
const FILEBOX_ABORT = "/api/v1/filebox/files/upload-multipart/abort";

/** file.size 를 임의 값으로 설정 (jsdom File 의 size 는 read-only). */
function makeSizedFile(name: string, type: string, sizeBytes: number): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: sizeBytes, configurable: true });
  return f;
}

describe("uploadAttachment — local (≤50MB)", () => {
  it("happy path returns fileId + kind=IMAGE for image mime", async () => {
    server.use(
      http.post(FILEBOX_LOCAL, () =>
        HttpResponse.json({ success: true, data: { id: "file-local-1" } }),
      ),
    );

    const file = new File(["hello"], "p.png", { type: "image/png" });
    const result = await uploadAttachment(file);

    expect(result.fileId).toBe("file-local-1");
    expect(result.kind).toBe("IMAGE");
  });

  it("server 4xx with error.message → throws that message", async () => {
    server.use(
      http.post(FILEBOX_LOCAL, () =>
        HttpResponse.json(
          { success: false, error: { message: "서버 검증 실패" } },
          { status: 400 },
        ),
      ),
    );

    const file = new File(["x"], "f.txt", { type: "text/plain" });
    await expect(uploadAttachment(file)).rejects.toThrow("서버 검증 실패");
  });
});

describe("uploadAttachment — 5GB 초과 cap", () => {
  it("size > 5GB → 즉시 throw, MSW handler 호출 0", async () => {
    let hits = 0;
    server.use(
      http.post(FILEBOX_LOCAL, () => {
        hits++;
        return HttpResponse.json({ success: true, data: { id: "x" } });
      }),
      http.post(FILEBOX_INIT, () => {
        hits++;
        return HttpResponse.json({ success: true, data: {} });
      }),
    );

    const huge = makeSizedFile("huge.bin", "application/octet-stream", 6 * 1024 * 1024 * 1024);
    await expect(uploadAttachment(huge)).rejects.toThrow("최대 5GB");
    expect(hits).toBe(0);
  });
});

describe("uploadAttachment — multipart (>50MB)", () => {
  beforeEach(() => {
    // 첫 PART 호출은 etag 반환, complete 는 fileId 반환
    server.use(
      http.post(FILEBOX_INIT, () =>
        HttpResponse.json({
          success: true,
          data: {
            uploadId: "upl-1",
            key: "tenant/2026/abc.bin",
            partSize: 50 * 1024 * 1024,
            partCount: 1,
            folderId: "folder-default",
          },
        }),
      ),
      http.post(FILEBOX_PART, () =>
        HttpResponse.json({ success: true, data: { etag: "etag-1" } }),
      ),
    );
  });

  it("happy: init → part → complete → fileId 반환", async () => {
    server.use(
      http.post(FILEBOX_COMPLETE, () =>
        HttpResponse.json({ success: true, data: { id: "file-mp-1" } }),
      ),
    );

    const file = makeSizedFile("big.zip", "application/zip", 60 * 1024 * 1024);
    const result = await uploadAttachment(file);

    expect(result.fileId).toBe("file-mp-1");
    expect(result.kind).toBe("FILE");
  });

  it("complete 실패 → abort 호출 후 throw", async () => {
    let abortCount = 0;
    server.use(
      http.post(FILEBOX_COMPLETE, () =>
        HttpResponse.json(
          { success: false, error: { message: "completion 실패" } },
          { status: 500 },
        ),
      ),
      http.post(FILEBOX_ABORT, () => {
        abortCount++;
        return HttpResponse.json({ success: true, data: {} });
      }),
    );

    const file = makeSizedFile("big.zip", "application/zip", 60 * 1024 * 1024);
    await expect(uploadAttachment(file)).rejects.toThrow("completion 실패");
    expect(abortCount).toBe(1);
  });
});
