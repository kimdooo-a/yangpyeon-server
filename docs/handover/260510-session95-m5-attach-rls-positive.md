# 인수인계서 — 세션 95 (M5-ATTACH-1 단독 sub-chunk — positive 첨부 flow + cross-tenant RLS 격리)

> 작성일: 2026-05-10
> 이전 세션: [session94 (보안 리뷰 follow-up)](./260509-session94-sharpedge-security-review.md) · [session94 (메인 chunk)](./260509-session94-f-track-m5-m6-mass-chunk.md)

---

## 작업 요약

S94 종료가 다른 터미널에서 진행 중일 때 본 터미널은 S95 진입 — M5 첨부 백엔드 갭 폐쇄 단일 chunk. ADR-033 §2.5 X1 server proxy + ADR-030 §FK 재사용 결정이 모두 정착되어 있어 messenger 첨부 backend 는 90% 정착 상태였고, **잔여 갭 = positive 첨부 flow 테스트 + cross-tenant RLS 격리 검증** 단일 testcase 로 폐쇄. 라이브 vitest 13/13 PASS (WSL 빌드 미러 우회). commit `652ff88`. M5-ATTACH 사전 추정 5-6일이 실제 1-2일로 압축 가능함이 정량 확인됨.

## 대화 다이제스트

### 토픽 1: 동시 터미널 분업 — /cs 와 다음 작업 영역 분리
> **사용자**: "세션종료는 이전 터미널에서 진행중이며 넌 다음작업 진행 ..."

직전 터미널이 S94 sharpedge follow-up 보고서 commit (`8f873c3`) 처리 중. memory `feedback_concurrent_terminal_overlap` 적용 — 즉시 `git status --short` + `git log --oneline -10` 점검:
- HEAD = `d5f9b6b` (S94 /cs main 직후)
- `?? docs/security/sharp-edges-2026-05-09.md` untracked (다른 터미널 작업 영역)
- 본 세션 진입 시점에 다른 터미널이 docs 영역과 git push 점유 가능성

**결론**: 본 터미널은 코드 영역(src/, tests/) 으로 분업. docs/handover/* 와 git push 는 다른 터미널 영역. 첫 단계로 ADR-033 후속 결정 검토.

### 토픽 2: ADR-033 후속 결정 검토 — X1 server proxy 패턴 정착 확인
> next-dev-prompt S95 P0 = M5-ATTACH, "ADR-033 후속 — frontend → SeaweedFS S3 API 직접 vs server proxy 결정 prerequisite"

ADR-033 §2.5 읽으니 **X1 server proxy 패턴이 이미 ACCEPTED 상태** (filebox 도메인 `upload-multipart/{init,part,complete,abort}` 4 라우트 정착, S78-A commit `963eba5`). ADR-030 §"첨부 = filebox `File` 모델 FK 재사용" + §Q8 "30일 cron deref" 결정도 모두 ACCEPTED. 즉 messenger 첨부의 후속 결정은:

| 영역 | 결정 |
|---|---|
| 업로드 인프라 | 기존 filebox `upload-multipart/*` 4 라우트 그대로 호출 (X1 server proxy 일관) |
| 모델 | 별도 storage/IAM 신설 0, filebox `File` FK 재사용 + MessageAttachment join 모델만 추가 |
| cleanup | 30일 cron deref (별도 chunk M5-ATTACH-2) |

**결론**: 신규 ADR 불필요, M5-ATTACH 진입 즉시 가능.

### 토픽 3: 백엔드 갭 분석 — 사전 추정 5-6일 → 실측 1-2일 압축

| 영역 | 상태 |
|---|---|
| Prisma `MessageAttachment` 모델 (line 1001) | ✅ RLS 첫 컬럼 + `ON DELETE RESTRICT` + 인덱스 2 |
| `sendMessage` tx INSERT + owner 검증 | ✅ schema 검증 + Zod 5장 max + IMAGE/FILE 강제 |
| `listMessages` / `searchMessages` include attachments | ✅ |
| Backend test ATTACHMENT_NOT_OWNED (negative) | ✅ |
| **Backend test positive 첨부 + cross-tenant RLS** | ❌ **본 chunk 진입** |
| Cron 30일 deref | ❌ M5-ATTACH-2 |
| Frontend MessageComposer 첨부 UI | ❌ M5-ATTACH-3 |
| Frontend MessageBubble + `<MessageAttachment>` | ❌ M5-ATTACH-4 |

**결론**: schema-first 설계 + ADR-030 §FK 재사용 결정으로 backend 90% 정착. 본 세션은 잔여 backend 갭 (positive flow + RLS 격리) 단일 testcase 로 폐쇄.

### 토픽 4: trivially-pass 함정 인지 (M5-ATTACH-6 신규 task)

`tests/messenger/rls.test.ts` bootstrap (`reseed`) 가 user/conversation/message 만 시드. M5 cross-tenant leak 검증의 9 모델 중 6 (message_attachment, message_mention, message_receipt, user_block, abuse_report, notification_preference) 은 `findMany() → []` 빈 결과로 **vacuous truth pass**. 4개월간 RLS 정책이 깨져도 테스트는 통과 가능한 상태 — S82 "4 latent bug 4개월 hidden" 패턴.

본 세션 chunk 범위 외 (별도 큰 변경) → **M5-ATTACH-6 신규 task 분리**: rls.test.ts bootstrap 6 모델 시드 강화 (~1일).

### 토픽 5: M5-ATTACH-1 단일 testcase 작성

`tests/messenger/messages.test.ts` ATTACHMENT_NOT_OWNED 테스트(line 371-412) 다음 (line 414) 에 86 lines 추가. 단일 testcase 가 3 검증 동시 수행:

1. **MessageAttachment row 2개 INSERT 검증**: alice 가 IMAGE 파일 2개 owner → conv_a 에 첨부 IMAGE 2개 송신 → fileId/kind/displayOrder 정확히 INSERT
2. **listMessages 응답 attachments 정합**: `expect(list.items[0].attachments).toHaveLength(2)` + displayOrder 명시 정렬 후 fileId 매칭
3. **tenant_b context RLS 격리**: `runWithTenant({ tenantId: TENANTS.b }, ...)` 안에서 같은 conv_a id 로 listMessages → `expect(list.items).toHaveLength(0)` (S82 Prisma extension RLS escape 회귀 시 본 expect fail)

**결론**: tsc 신규 오류 0 (사전 phase-14c-alpha-ui.spec.ts 2건 무관, STYLE-2 영역).

### 토픽 6: 라이브 vitest 4-stage 경계 함정 + WSL 빌드 미러 우회

PR 게이트 #4 라이브 검증 시도. Windows ↔ WSL 경계에서 4-stage 함정 발생:

| Stage | 시도 | 결과 |
|---|---|---|
| 1 | PowerShell native + npx vitest | `ECONNREFUSED ::1:5432` — Windows host 에서 WSL postgres 미접근 |
| 2 | `wsl bash scripts/run-integration-tests.sh` (Win npx 호출) | scripts §13-16 함정: env URL `?`/`%`/`=` interop 손실 → HAS_DB=false → 13 tests 모두 skipped |
| 3 | WSL Linux node + Windows node_modules (`source ~/.nvm/nvm.sh`) | `Cannot find module '@rolldown/binding-linux-x64-gnu'` — Windows install 에 Linux native 부재 |
| 4 | **WSL 빌드 미러 cp + 거기서 실행** ✅ | 13/13 PASS (850ms) |

성공 명령:
```bash
wsl -d Ubuntu -- bash -lc 'cp /mnt/e/00_develop/260406_luckystyle4u_server/tests/messenger/messages.test.ts ~/dev/ypserver-build/tests/messenger/messages.test.ts && source ~/.nvm/nvm.sh && cd ~/dev/ypserver-build && bash scripts/run-integration-tests.sh tests/messenger/messages.test.ts'
```

`~/dev/ypserver-build/` 에는 Linux native node_modules + `.env.test.local` 이 이미 정착. 변경분 cp 만으로 라이브 검증 가능. **향후 messenger 라이브 테스트 표준 절차** — solutions 문서 산출 (4.5단계).

### 토픽 7: commit `652ff88` + S95 종료
> 사용자 결정 = "세션 종료" → 본 /cs 진입

ahead/behind 0 (다른 터미널이 8f873c3 까지 origin push 완료 후) 위에 commit 1개. PR 게이트 5항목 모두 자동 통과 (신규 모델 0 / 신규 라우트 0 / Prisma 호출 변경 0 / non-BYPASSRLS 라이브 PASS / timezone 비교 0).

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | 동시 터미널 분업 (코드 vs docs) | (a) /cs 끝나기 대기 (b) 코드 영역 진입 (c) 양 영역 동시 진입 | (b) 채택 — `feedback_concurrent_terminal_overlap` 위반 회피 + 사용자 명시 "다음 작업 진행" |
| 2 | ADR-033 후속 ADR 작성 vs 즉시 진입 | (a) 신규 ADR 작성 (b) 기존 ADR-033 §2.5 + ADR-030 §FK 재사용 그대로 적용 | (b) — X1 server proxy 정착 + filebox 인프라 재사용으로 신규 결정 0 |
| 3 | M5-ATTACH-1 chunk 범위 | (a) positive 테스트만 (b) RLS bootstrap 강화도 동봉 (c) frontend 첨부 UI 까지 | (a) — 단일 testcase 로 압축, RLS bootstrap 강화는 M5-ATTACH-6 분리 (큰 변경) |
| 4 | 라이브 vitest 우회 경로 | (a) WSL 빌드 미러 cp (b) Windows postgres 설치 (c) WSL 직접 실행 | (a) — 가장 가볍고 자가완결 (Linux native modules 정합) |
| 5 | commit push 시점 | (a) 본 세션에서 push (b) /cs 단계에서 push (c) 다음 세션 | (b) /cs 단계에서 다른 터미널 push 완료 확인 후 안전 push |

## 수정 파일 (1개)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `tests/messenger/messages.test.ts` | +86: ATTACHMENT_NOT_OWNED 다음에 positive 첨부 + listMessages 정합 + tenant_b RLS 격리 단일 testcase 추가 |

## 상세 변경 사항

### 1. `tests/messenger/messages.test.ts` — positive 첨부 flow + cross-tenant RLS 격리

ATTACHMENT_NOT_OWNED 테스트(line 371-412) 다음 (line 414) 에 새 testcase. 86 lines 추가.

테스트 골격:
```typescript
it.skipIf(!fx.hasDb)(
  "sendMessage: 첨부 IMAGE 2개 정상 → MessageAttachment row INSERT + listMessages 응답 attachments 정합 + tenant_b context 는 0 row (RLS)",
  async () => {
    // alice 가 두 IMAGE 파일 모두 소유 — 5장 묶음 축소판
    const { fileId: fileId1 } = await seedFile({ tenantId: TENANTS.a, ownerId: alice.id });
    const { fileId: fileId2 } = await seedFile({ tenantId: TENANTS.a, ownerId: alice.id });

    await runWithTenant({ tenantId: TENANTS.a }, async () => {
      const r = await messages.sendMessage({
        kind: "IMAGE", body: null, /* ... */
        attachments: [
          { fileId: fileId1, kind: "IMAGE", displayOrder: 0 },
          { fileId: fileId2, kind: "IMAGE", displayOrder: 1 },
        ],
      });
      // (1) row INSERT 검증 + displayOrder 정렬
      expect(r.message.attachments).toHaveLength(2);
      // (2) listMessages 응답 정합
      const list = await messages.listMessages({ /* ... */ });
      expect(list.items[0].attachments).toHaveLength(2);
    });

    // (3) tenant_b context — RLS 가 conv_a 메시지를 0 row 로 차단 (S82 회귀 시 fail)
    await runWithTenant({ tenantId: TENANTS.b }, async () => {
      const list = await messages.listMessages({ /* ... */ });
      expect(list.items).toHaveLength(0);
    });
  },
);
```

## 검증 결과

- `npx tsc --noEmit -p tsconfig.json` — 에러 2 (사전 존재 `phase-14c-alpha-ui.spec.ts:19/20`, S85 secret recovery 후속, STYLE-2 영역, 본 commit 무관). 신규 0.
- 라이브 vitest (`bash scripts/run-integration-tests.sh tests/messenger/messages.test.ts` in `~/dev/ypserver-build/`) — **13 PASS / 0 fail / 0 skipped** (850ms).
- non-BYPASSRLS `app_test_runtime` role + `?options=-c TimeZone=UTC` 활성 상태에서 통과 = CLAUDE.md PR 게이트 룰 #4 게이트 통과.
- ahead/behind = 0/0 (commit `652ff88` 위 origin push 안 함 — /cs 단계에서 처리).

## 터치하지 않은 영역

- 30일 message_attachments dereference cron (M5-ATTACH-2)
- frontend MessageComposer 첨부 UI (M5-ATTACH-3)
- frontend MessageBubble + `<MessageAttachment>` 컴포넌트 (M5-ATTACH-4)
- search 응답 attachments + 통합 e2e (M5-ATTACH-5)
- **rls.test.ts bootstrap 6 모델 시드 강화 (M5-ATTACH-6 신규 task, ~1일)** — trivially-pass false-positive 차단
- 사이드바 nav 통합 (admin/reports + blocked-users + notification-preferences 직접 URL 진입만)
- 다른 터미널 sharp-edges follow-up `8f873c3` 영역 (commit + handover + index/log/next-dev-prompt 갱신 모두 다른 터미널이 처리 완료)
- S88-USER-VERIFY 사용자 / S88-OPS-LIVE 운영자 / S86-SEC-1 GitHub repo public 확인 / DB password 회전 / S87 carry-over 그대로

## 알려진 이슈

- **사전 존재**: `scripts/e2e/phase-14c-alpha-ui.spec.ts:19/20` tsc 2 errors (S85 secret recovery 후속, STYLE-2 sweep 영역).
- **rls.test.ts trivially-pass 가능성**: M5 cross-tenant leak 검증의 9 모델 중 6 (message_attachment 외 5) 이 bootstrap 시드 부재로 vacuous truth pass — M5-ATTACH-6 신규 task 로 분리.
- **WSL 빌드 미러와 Windows 측 sync**: 본 세션은 `tests/messenger/messages.test.ts` 만 수동 cp. `wsl-build-deploy.sh` 가 매 배포 시 rsync 하지만 본 세션은 deploy 미진행 — 다음 deploy 사이클 또는 frontend chunk 진입 시 sync.

## 다음 작업 제안

| # | Task | 우선 | 추정 |
|---|------|------|------|
| 1 | M5-ATTACH-3 frontend MessageComposer 첨부 UI (filebox upload-multipart 재사용) | P0 messenger | 1-1.5일 |
| 2 | M5-ATTACH-4 MessageBubble + `<MessageAttachment>` 렌더 (IMAGE 미리보기 + FILE 다운로드 + VOICE play) | P0 messenger | 0.5-1일 |
| 3 | M5-ATTACH-2 30일 message_attachments dereference cron | P1 | ~0.5일 |
| 4 | M5-ATTACH-6 rls.test.ts bootstrap 6 모델 시드 강화 (M5-NEW: trivially-pass 차단) | P2 | ~1일 |
| 5 | M5-ATTACH-5 search 응답 attachments + e2e 시나리오 | P2 sweep | ~0.5일 |
| 6 | 거버넌스 단언 sunset 결정 (M5 첨부 frontend 완료 시) | P3 | 5분 |
| 7 | 사이드바 nav 통합 + STYLE-2 sweep | P3 | ~30분 |

## 관련 자료

- 저널: [journal-2026-05-10.md](../logs/journal-2026-05-10.md)
- 솔루션: [WSL 빌드 미러 우회 4-stage 함정](../solutions/2026-05-10-wsl-vitest-windows-modules-rolldown-binding.md)
- ADR-030 §"첨부 = filebox FK 재사용" / ADR-033 §2.5 X1 server proxy
- 이전 세션: [S94 메인](./260509-session94-f-track-m5-m6-mass-chunk.md) · [S94 sharpedge follow-up](./260509-session94-sharpedge-security-review.md)

---
[← handover/_index.md](./_index.md)
