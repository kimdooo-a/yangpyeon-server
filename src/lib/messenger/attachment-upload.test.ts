/**
 * tests for `classifyAttachmentKind` — pure logic 부분만 (S96 M5-ATTACH-3).
 *
 * `uploadAttachment` 본체는 XHR + fetch 직접 호출이라 jsdom + MSW/fetch-mock
 * 인프라가 필요하므로 본 chunk 범위 외 (filebox file-upload-zone.tsx 도 단위
 * 테스트 부재 — 같은 정책). 라이브 검증은 다음 chunk (3b UI 통합) 의 수동 영역.
 */
import { describe, it, expect } from "vitest";
import { classifyAttachmentKind } from "./attachment-upload";

describe("classifyAttachmentKind", () => {
  it("image/png → IMAGE", () => {
    expect(classifyAttachmentKind("image/png")).toBe("IMAGE");
  });

  it("image/jpeg → IMAGE", () => {
    expect(classifyAttachmentKind("image/jpeg")).toBe("IMAGE");
  });

  it("image/webp → IMAGE (모든 image/* 분기)", () => {
    expect(classifyAttachmentKind("image/webp")).toBe("IMAGE");
  });

  it("audio/mpeg → VOICE", () => {
    expect(classifyAttachmentKind("audio/mpeg")).toBe("VOICE");
  });

  it("audio/ogg → VOICE (모든 audio/* 분기)", () => {
    expect(classifyAttachmentKind("audio/ogg")).toBe("VOICE");
  });

  it("application/pdf → FILE", () => {
    expect(classifyAttachmentKind("application/pdf")).toBe("FILE");
  });

  it("video/mp4 → FILE (이미지/오디오 외 모두 FILE)", () => {
    expect(classifyAttachmentKind("video/mp4")).toBe("FILE");
  });

  it("application/octet-stream → FILE (mimeType 없을 때 default)", () => {
    expect(classifyAttachmentKind("application/octet-stream")).toBe("FILE");
  });

  it("빈 문자열 → FILE (image/audio prefix 미매치)", () => {
    expect(classifyAttachmentKind("")).toBe("FILE");
  });
});
