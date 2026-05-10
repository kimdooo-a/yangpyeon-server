# 인수인계서 — 세션 96 (M5-ATTACH-3a/3c logic+utility — composer-logic kind 분기 + attachment-upload utility)

> 작성일: 2026-05-10
> 이전 세션: [session95](./260510-session95-m5-attach-rls-positive.md)

---

## 작업 요약

S95 /cs push 직후 같은 컨텍스트에서 자율 진입 (사용자 "go on"). M5-ATTACH-3 (1-1.5일 추정) 을 3 sub-step (3a utility / 3b UI 통합 / 3c logic 확장) 으로 분해, 본 세션 = 3a + 3c logic-only 단일 commit. composer-logic.ts 의 `SendPayload` 시그니처를 `kind: TEXT|IMAGE|FILE` + `attachments` 로 확장 + `canSendMessage`/`inferMessageKind` 신규, filebox file-upload-zone.tsx 의 multipart 패턴을 `lib/messenger/attachment-upload.ts` 함수형으로 추출. tsc 신규 0, vitest 61/61 PASS, TDD +26. commit `bf7255a` + push 완료. 3b UI 통합은 jsdom 미도입 = 수동 영역으로 다음 세션 분리.

## 대화 다이제스트

### 토픽 1: S95 /cs push 직후 자율 진입
> **사용자**: "go on"

S95 /cs (commit `b027314`) push 완료 직후 같은 컨텍스트에서 S96 진입. memory `feedback_autonomy.md` (분기 질문 금지, 권장안 즉시 채택) + 거버넌스 단언 §"M5 진행 중 자연 발생한 dependency" 예외 적용 → S96 P0 = M5-ATTACH-3 (frontend MessageComposer 첨부 UI) 자율 진입.

**결론**: 본 세션 = M5-ATTACH-3 sub-step 진입, 1 commit 마감 목표.

### 토픽 2: M5-ATTACH-3 분해 — 3 sub-step

`next-dev-prompt.md` S96 P0 = M5-ATTACH-3 (1-1.5일). 단일 chunk 가 아니라 다음 3 sub-step:

| sub | 영역 | 측정 |
|---|---|---|
| **3a** | `lib/messenger/attachment-upload.ts` utility (filebox 패턴 추출) | XHR/fetch wrapper, type-safe |
| **3b** | MessageComposer Paperclip 버튼 활성화 + 5장 chip + 진행률 + 제거 버튼 | UI 통합 (jsdom 미도입 = 수동 영역) |
| **3c** | `composer-logic.ts` `prepareSendPayload` 확장 — `attachments` 동봉 | TDD logic-only |

**결론**: 본 세션 = 3a + 3c (logic + utility, TDD 가능). 3b 는 jsdom 컴포넌트 테스트 자체 불가 → 수동 영역 분리, 다음 세션 진입.

### 토픽 3: ADR-033 X1 server proxy + ADR-030 §FK 재사용 결정 정합

ADR-033 §2.5: filebox `upload-multipart/{init,part,complete,abort}` 4 라우트 = X1 server proxy 패턴 ACCEPTED (S78-A commit `963eba5`). ADR-030: messenger 첨부 = filebox `File` 모델 FK 재사용 + 30일 cron deref. 즉 messenger 첨부 backend 변경 0:
- 기존 4 라우트 그대로 호출
- response shape `successResponse(file, 201)` → `data.id` 가 fileId

**결론**: 신규 ADR 불필요, frontend 만 추가하면 됨.

### 토픽 4: filebox file-upload-zone.tsx 패턴 분석 — 옵션 B 채택

`src/components/filebox/file-upload-zone.tsx` (S78-A, 330 lines) 의 multipart 패턴:
- `LOCAL_THRESHOLD = 50MB` 임계점 분기
- `uploadLocal` (XHR + FormData + 진행률 추적)
- `uploadMultipart` (init → part × N (slot=3) → complete + abort fallback)
- 진행률 추적 = part 별 byte 가중 평균

두 컴포넌트(filebox + messenger)가 같은 패턴인데 결정점:
- 옵션 A: file-upload-zone 의 두 함수를 export 만 추가 (변경 최소)
- 옵션 B: 공통 utility `lib/messenger/attachment-upload.ts` 신규 + filebox 그대로 (결합 0)
- 옵션 C: cross-domain 추출 `lib/storage/upload-utils.ts` (지금 너무 무거움)

**결론**: 옵션 B 채택. messenger 측은 단일 진입점 `uploadAttachment(file, onProgress)` 만 사용 (size 분기 + AttachmentKind 분류 자동 내부화). filebox 측은 그대로 두고 결합 0, 차후 필요 시 file-upload-zone 도 본 utility 로 마이그레이션 가능.

### 토픽 5: composer-logic 시그니처 확장 + type 전파 점검

`SendPayload.kind: "TEXT"` → `"TEXT" | "IMAGE" | "FILE"` / `body: string` → `string | null` 변경이 호출자 type 전파:

| 호출자 | 영향 | 조치 |
|---|---|---|
| `useMessages.SendOptimisticPayload` | `kind: "TEXT"` 만 — 별도 정의 | 시그니처 확장 (composer-logic.SendPayload 정합) |
| `optimistic-messages.OptimisticBuildInput.payload` | `kind: "TEXT" / body: string` | 시그니처 확장 + buildOptimisticMessage 가 첨부를 MessageAttachmentRow 변환 |
| `MessageRow.kind` | 이미 `"TEXT" \| "IMAGE" \| "FILE" \| "SYSTEM"` 지원 | 호환 (변경 0) |
| `MessageRow.body` | 이미 `string \| null` 지원 | 호환 (변경 0) |
| `MessageRow.attachments` | 이미 `MessageAttachmentRow[]` 지원 | 호환 (변경 0) |

**결론**: 두 시그니처만 확장. `MessageRow` 모델은 ADR-030 시점부터 IMAGE/FILE 미리 지원 — schema-first 설계의 정량 효과. `buildOptimisticMessage` 가 첨부를 `MessageAttachmentRow` 변환 (id="opt-att-{cgid}-{idx}" 임시값, server 응답 swap 시 실제 id 로 교체).

### 토픽 6: TDD +26 + 라이브 검증 정책

- `composer-logic.test.ts` +17 신규 (canSendMessage 7 + inferMessageKind 4 + prepareSendPayload 6)
- `attachment-upload.test.ts` +9 신규 (classifyAttachmentKind mime 분류)
- `uploadAttachment` 본체 = XHR + fetch 직접 호출이라 jsdom + MSW/fetch-mock 인프라 필요 → 본 chunk 범위 외 (filebox file-upload-zone.tsx 도 같은 정책)

**결론**: vitest 61/61 PASS (composer-logic 29 + attachment-upload 9 + optimistic-messages 23). +26 신규. tsc 신규 0 (사전 e2e 2건만). 라이브 검증 = 다음 chunk (3b UI 통합) 의 수동 영역.

### 토픽 7: commit `bf7255a` + push

ahead 1 vs origin (S95 push 후 신규 1) → commit + fetch 검증 → push `b027314..bf7255a`. PR 게이트 5항목 자동 통과 (신규 모델 0 / 신규 라우트 0 / Prisma 호출 변경 0 / RLS 라이브 N/A / timezone 비교 0).

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | M5-ATTACH-3 sub-step 분해 | (a) 단일 commit (b) 3 sub-step 분리 (c) 2 sub-step 합치기 | (b) — logic-only TDD 분리 패턴 (F2-1~F2-5 일관). 3b 는 jsdom 미도입으로 unit test 자체 불가, UI 통합은 수동 영역 분리가 자연 |
| 2 | filebox 패턴 재사용 | (a) export 만 추가 (b) 공통 utility 신규 (c) cross-domain 추출 | (b) — 두 컴포넌트 결합 0, 차후 마이그레이션 옵션 보존. 옵션 C 는 지금 너무 무거움 |
| 3 | type 전파 처리 | (a) MessageRow 도 별도 시그니처 (b) MessageRow 그대로 활용 | (b) — ADR-030 시점부터 schema-first 로 IMAGE/FILE 지원 정착, 그대로 사용 |
| 4 | uploadAttachment 본체 TDD | (a) MSW/fetch-mock 도입 + 본체 TDD (b) 본체 단위 테스트 생략 | (b) — filebox 측도 같은 정책, MSW 도입은 별도 chunk (INFRA-2 후보) |
| 5 | optimistic 첨부 id | (a) 임시 uuid 발급 (b) cgid prefix (`opt-att-{cgid}-{idx}`) | (b) — server swap 시 어차피 교체, prefix 가 디버그 가시성 우위 |

## 수정 파일 (6개)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `src/lib/messenger/composer-logic.ts` | +82: SendPayload kind 분기 + attachments + canSendMessage + inferMessageKind |
| 2 | `src/lib/messenger/composer-logic.test.ts` | +143 (TDD 17): canSendMessage 7 + inferMessageKind 4 + prepareSendPayload 6 |
| 3 | `src/lib/messenger/attachment-upload.ts` | +286 신규: filebox 패턴 추출 utility (uploadAttachment + classifyAttachmentKind) |
| 4 | `src/lib/messenger/attachment-upload.test.ts` | +47 (TDD 9): mime 분류 |
| 5 | `src/lib/messenger/optimistic-messages.ts` | +25: OptimisticBuildInput.payload 시그니처 확장 |
| 6 | `src/hooks/messenger/useMessages.ts` | +14: SendOptimisticPayload 정합 |

## 상세 변경 사항

### 1. composer-logic.ts — kind 분기 + attachments + canSendMessage/inferMessageKind

```typescript
// SendPayload 시그니처 확장
export interface SendPayload {
  kind: "TEXT" | "IMAGE" | "FILE";  // F2-1 "TEXT" 단독 → S96 IMAGE/FILE
  body: string | null;               // 캡션 0자 → null
  clientGeneratedId: string;
  replyToId?: string;
  mentions?: string[];
  attachments?: SendAttachment[];   // M5-ATTACH-3 신규
}

// 신규 함수
export function canSendMessage(raw: string, attachments: SendAttachment[] = []): boolean {
  if (attachments.length > 5) return false;
  if (attachments.length > 0) return raw.length <= 5000;  // 캡션
  return canSendText(raw);  // 첨부 0 = TEXT 검증
}

export function inferMessageKind(attachments: SendAttachment[]): "IMAGE" | "FILE" {
  return attachments.every((a) => a.kind === "IMAGE") ? "IMAGE" : "FILE";
}

// prepareSendPayload — kind 자동 분기 + displayOrder 자동 부여
```

### 2. attachment-upload.ts — filebox 패턴 함수형 추출

```typescript
export interface UploadAttachmentResult {
  fileId: string;
  kind: "IMAGE" | "FILE" | "VOICE";
}

export function classifyAttachmentKind(mimeType: string): AttachmentKind {
  if (mimeType.startsWith("image/")) return "IMAGE";
  if (mimeType.startsWith("audio/")) return "VOICE";
  return "FILE";
}

export async function uploadAttachment(file: File, onProgress?: (pct: number) => void): Promise<UploadAttachmentResult> {
  if (file.size > SEAWEED_MAX_SIZE) throw new Error("파일 크기 초과 — 최대 5GB");
  const kind = classifyAttachmentKind(file.type || "application/octet-stream");
  const fileId = file.size > LOCAL_THRESHOLD
    ? await uploadMultipart(file, onProgress)
    : await uploadLocal(file, onProgress);
  return { fileId, kind };
}
```

내부 `uploadLocal`/`uploadMultipart` 는 file-upload-zone.tsx 패턴 그대로 (XHR + multipart 워커풀 3 슬롯 + abort fallback). 응답에서 `data.id` 추출.

### 3. optimistic-messages.ts — OptimisticBuildInput 확장

```typescript
export interface OptimisticBuildInput {
  payload: {
    kind: "TEXT" | "IMAGE" | "FILE";
    body: string | null;
    clientGeneratedId: string;
    replyToId?: string;
    attachments?: Array<{ fileId: string; kind: "IMAGE" | "FILE" | "VOICE"; displayOrder?: number }>;
  };
  senderId: string;
  now?: Date;
}

// buildOptimisticMessage 가 첨부를 MessageAttachmentRow 로 변환
const attachments: MessageAttachmentRow[] = (input.payload.attachments ?? []).map((a, idx) => ({
  id: `opt-att-${input.payload.clientGeneratedId}-${idx}`,  // 임시값
  fileId: a.fileId,
  kind: a.kind,
  displayOrder: a.displayOrder ?? idx,
}));
```

### 4. useMessages.ts — SendOptimisticPayload 정합

```typescript
interface SendOptimisticPayload {
  kind: "TEXT" | "IMAGE" | "FILE";
  body: string | null;
  clientGeneratedId: string;
  replyToId?: string;
  mentions?: string[];
  attachments?: Array<{ fileId: string; kind: "IMAGE" | "FILE" | "VOICE"; displayOrder?: number }>;
}
```

composer-logic.SendPayload 와 호환 — page.tsx 가 SendPayload 그대로 sendOptimistic 에 넘기면 자동 호환.

## 검증 결과

- `npx tsc --noEmit -p tsconfig.json` — 신규 오류 0. 사전 존재 `phase-14c-alpha-ui.spec.ts:19/20` 2건만 (S85 secret recovery 후속, STYLE-2 영역, 본 commit 무관).
- `npx vitest run --no-file-parallelism src/lib/messenger/composer-logic.test.ts src/lib/messenger/attachment-upload.test.ts src/lib/messenger/optimistic-messages.test.ts` — **61/61 PASS** (591ms). composer-logic 29 (12 기존 + 17 신규) + attachment-upload 9 신규 + optimistic-messages 23 기존. +26 신규.
- 라이브 messenger 통합 테스트 = 본 commit 영역 X (logic only, DB/RLS 변경 0) → S95 의 13/13 PASS 그대로 유효.
- ahead/behind 0/0 (push 완료).
- PR 게이트 5항목: 신규 모델 0 / 신규 라우트 0 / Prisma 호출 변경 0 / RLS 라이브 N/A / timezone 비교 0 — 모두 자동 통과.

## 터치하지 않은 영역

- **M5-ATTACH-3b UI 통합**: MessageComposer.tsx 의 Paperclip 버튼 활성화 (현 line 242-250 disabled), 5장 묶음 chip, 진행률 bar, 파일 input — 다음 세션 수동 영역
- M5-ATTACH-2 30일 message_attachments dereference cron
- M5-ATTACH-4 MessageBubble 첨부 렌더 + `<MessageAttachment>` 컴포넌트
- M5-ATTACH-6 rls.test.ts bootstrap 6 모델 시드 강화
- M5-ATTACH-5 search 응답 attachments + e2e
- 사이드바 nav 통합
- file-upload-zone.tsx 의 본 utility 마이그레이션 (별도 sweep 가능, 결합 0 유지 결정)
- S88-USER-VERIFY 사용자 / S88-OPS-LIVE 운영자 / S86-SEC-1 / DB password 회전 / S87 carry-over
- 다른 터미널 영역 (없음 — 본 세션은 단일 컨텍스트)

## 알려진 이슈

- **사전 존재**: `scripts/e2e/phase-14c-alpha-ui.spec.ts:19/20` tsc 2 errors (S85 secret recovery 후속, STYLE-2 sweep 영역).
- **uploadAttachment 본체 단위 테스트 부재**: jsdom + MSW/fetch-mock 인프라 미도입. 라이브 검증 = 다음 chunk (3b UI) 의 수동 영역.
- **rls.test.ts bootstrap 6 모델 시드 부재**: M5-ATTACH-6 신규 task 분리 (S95 종료 시 인지).

## 다음 작업 제안

| # | Task | 우선 | 추정 |
|---|------|------|------|
| 1 | M5-ATTACH-3b MessageComposer Paperclip UI + 5장 chip + 진행률 (수동 검증) | P0 messenger | ~1일 |
| 2 | M5-ATTACH-4 MessageBubble + `<MessageAttachment>` 렌더 | P0 messenger | 0.5-1일 |
| 3 | M5-ATTACH-2 30일 message_attachments dereference cron | P1 | ~0.5일 |
| 4 | M5-ATTACH-6 rls.test.ts bootstrap 6 모델 시드 강화 | P2 | ~1일 |
| 5 | M5-ATTACH-5 search 응답 attachments + e2e 시나리오 | P2 sweep | ~0.5일 |
| 6 | 거버넌스 단언 sunset 결정 (3b + 4 완료 시) | P3 | 5분 |

## 관련 자료

- 저널: [journal-2026-05-10.md](../logs/journal-2026-05-10.md) §"세션 96"
- ADR-033 §2.5 X1 server proxy / ADR-030 §"첨부 = filebox FK 재사용"
- 이전 세션: [S95 (M5-ATTACH-1)](./260510-session95-m5-attach-rls-positive.md)
- 패턴 출처: `src/components/filebox/file-upload-zone.tsx` (S78-A commit `963eba5`)

---
[← handover/_index.md](./_index.md)
