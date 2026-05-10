/**
 * tenant-bootstrap — 모든 등록된 tenant 와 core handler 를 dispatch registry 에 주입.
 *
 * PLUGIN-MIG-5 (S98) — cron runner 가 generic dispatcher 를 사용하기 위해 본 모듈을
 * side-effect import 한다. import 시점에 registry 가 채워짐.
 *
 * 등록 항목:
 *   - Tenant manifest:
 *     - almanac (RSS aggregator) — packages/tenant-almanac/manifest.ts
 *     - 향후 추가 컨슈머는 본 파일에 import + registerTenant 1줄.
 *
 *   - Core handler (tenant 비특정):
 *     - messenger-attachments-deref — 회수된 메시지 첨부 30일 deref.
 *     - 향후 추가 플랫폼-레벨 cron 은 본 파일에 register.
 *
 * Side-effect 안전:
 *   - registerTenant / registerCoreHandler 는 이미 등록된 동일 키 덮어쓰기 (개발 핫리로드).
 *   - globalThis 싱글턴 registry — 본 모듈이 여러 chunk 에서 import 되어도 한 번만 주입.
 *
 * 호출 위치:
 *   - src/lib/cron/runner.ts (cron dispatch 진입점) 가 top-level side-effect import.
 *   - 향후 운영 콘솔, route dispatcher 등도 side-effect import 가능.
 */
import {
  registerTenant,
  registerCoreHandler,
  type TenantCronHandler,
} from "@yangpyeon/core";
import { manifest as almanacManifest } from "@yangpyeon/tenant-almanac";
import { runMessengerAttachmentCleanup } from "@/lib/messenger/attachment-cleanup";

// ─────────────────────────────────────────────────────────────────────────────
// Tenant manifest 등록
// ─────────────────────────────────────────────────────────────────────────────
registerTenant(almanacManifest);

// ─────────────────────────────────────────────────────────────────────────────
// Core handler 등록 — tenant 비특정 cron
// ─────────────────────────────────────────────────────────────────────────────

/**
 * messenger-attachments-deref — 회수된 메시지의 첨부를 30일 경과 시 deref.
 * ADR-030 §Q8 (b), S96 M5-ATTACH-2.
 *
 * messenger 도메인은 모든 tenant 에 공통 — manifest 가 아닌 core handler 로 등록.
 */
const messengerAttachmentsDerefHandler: TenantCronHandler = async (
  _payload,
  ctx,
) => {
  const result = await runMessengerAttachmentCleanup(ctx);
  return {
    ok: true,
    processedCount: result.dereferenced,
  };
};

registerCoreHandler(
  "messenger-attachments-deref",
  messengerAttachmentsDerefHandler,
);
