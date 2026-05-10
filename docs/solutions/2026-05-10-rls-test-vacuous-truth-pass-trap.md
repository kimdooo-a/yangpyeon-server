---
title: RLS 테스트의 vacuous truth pass 함정 — 빈 시드가 가린 4개월 prod hidden 위험
date: 2026-05-10
session: 96
tags: [rls, postgres, vitest, multi-tenant, prisma, baas, test-design]
category: pattern
confidence: high
---

## 문제

`tests/messenger/rls.test.ts` 의 M5 매개변수화 testcase 가 9 model (conversation, conversationMember, message, messageAttachment, messageMention, messageReceipt, userBlock, abuseReport, notificationPreference) 의 cross-tenant 격리를 검증한다고 *주장*했지만, 실제로는 6 model 에 대해 **vacuous truth pass** (공허 참 통과) 였다. 4개월간 RLS 정책이 깨져도 통과 가능한 상태.

```ts
// 기존 (취약):
it.skipIf(!HAS_DB).each([
  "conversation",
  "conversationMember",
  "message",
  "messageAttachment",
  "messageMention",
  "messageReceipt",
  "userBlock",
  "abuseReport",
  "notificationPreference",
] as const)("M5-%s: cross-tenant leak 0", async (model) => {
  await runWithTenant({ tenantId: TENANTS.a }, async () => {
    const rows: Array<{ tenantId: string }> = await client[model].findMany();
    for (const row of rows) {
      expect(row.tenantId).toBe(TENANTS.a);  // 빈 배열 → for 루프 0회 실행 → 통과
    }
  });
});
```

`reseed()` 가 user/conversation/message 만 시드 → 나머지 6 model 은 `findMany() → []` → for-of 가 0회 실행 → `expect` 가 호출조차 안 됨 → **테스트 통과**. RLS 정책이 두 tenant 의 모든 row 를 가린 경우와 RLS 정책이 정상 작동한 경우의 결과가 같다.

## 원인

**근본**: 매개변수화 테스트의 매개변수(model 9개) 와 시드 셋업이 분리된 관계 — 매개변수 추가는 1줄이지만 시드 추가는 수십 줄 → 매개변수만 늘리고 시드는 후속 PR 로 미루는 자연스러운 drift.

**구체적 메커니즘 (S82 "4 latent bug" 패턴 변형)**:
1. M5 매개변수화 첫 도입 시점 (세션 64) 에는 conversation/message 정도만 시드 → 다른 model 은 `[]` 가 정답일 수 있다고 판단 (실제 테스트 시점에 row 0 일 수 있다는 가정).
2. 이후 신규 모델 (messageAttachment 등) 가 schema 에 추가 + 매개변수 list 에도 추가 → 시드 강화는 수반되지 않음.
3. RLS 정책 자체가 깨지면 `tenant_a` context 에서도 `[]` 가 나올 가능성 — 이 경우에도 for-of 0회 실행으로 통과. → "테스트가 동작 안 함" 과 "RLS 가 깨짐" 이 같은 통과 결과.

**파급 효과**: S82 첫 라이브 테스트가 4개월간 prod 에서 가려져 있던 "4 latent bug" (Prisma extension RLS escape, PrismaPg timezone shift, AbuseReport @map 누락, fixture/test invariant) 를 동시 노출했는데, 본 vacuous truth 패턴이 그 게이트를 의미 없게 만들었던 동일 원인.

## 해결

**핵심**: 시드 강화 + active assertion (`rows.length >= 1`) 두 변경의 조합. 둘 중 하나만으로는 부족.

### 수정 1: 시드 강화 (`reseed()`)

각 tenant 에 시드해야 하는 9 model 모두 row 1+ 보장. FK 의존 순서 엄수:

```sql
-- DELETE 순서: children → parents
DELETE FROM notification_preferences WHERE tenant_id IN ($a, $b);
DELETE FROM abuse_reports WHERE tenant_id IN ($a, $b);
DELETE FROM user_blocks WHERE tenant_id IN ($a, $b);
DELETE FROM message_receipts WHERE tenant_id IN ($a, $b);
DELETE FROM message_attachments WHERE tenant_id IN ($a, $b);
DELETE FROM message_mentions WHERE tenant_id IN ($a, $b);
DELETE FROM messages WHERE tenant_id IN ($a, $b);
DELETE FROM conversation_members WHERE tenant_id IN ($a, $b);
DELETE FROM conversations WHERE tenant_id IN ($a, $b);
DELETE FROM files WHERE tenant_id IN ($a, $b) AND stored_name LIKE 'rls-test-%';
DELETE FROM folders WHERE tenant_id IN ($a, $b) AND name LIKE 'rls-test-%';
DELETE FROM users WHERE email IN ('msg-a@x.com', 'msg-a2@x.com', 'msg-b@x.com', 'msg-b2@x.com');

-- INSERT 순서: parents → children, mention/block 의 의미를 위해 tenant 당 user 2명
-- (userIdA + userIdA2 / userIdB + userIdB2)
```

mention/block 같은 양방향 관계는 같은 tenant 안에서 user 2명이 있어야 의미 있는 row 시드 가능 (cross-tenant block 은 비정상 케이스).

### 수정 2: active assertion 추가

```ts
it.skipIf(!HAS_DB).each([...9 model])("M5-%s: cross-tenant leak 0", async (model) => {
  await runWithTenant({ tenantId: TENANTS.a }, async () => {
    const rows = await client[model].findMany();
    // 능동 단언: 시드된 1+ row 가 보여야 한다 (없으면 vacuous truth 가능성 차단).
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows) {
      expect(row.tenantId).toBe(TENANTS.a);
    }
  });
});
```

이 한 줄이 결정적: 시드 깨지거나 RLS 가 양 tenant 다 가리면 즉시 fail. RLS 정상 + 시드 정상 + cross-tenant 격리 정상 = 3 조건 동시 만족 시에만 pass.

## 교훈

- **매개변수화 테스트는 매개변수와 시드의 결합도를 명시적으로 표현해야 한다**. each([...]) 로 model 9개 추가는 1줄이지만, 시드 셋업은 model 별 FK 의존 chain 으로 수십 줄 — 자연 drift 가 일어남. 시드를 매개변수와 같이 늘리는 정책이 필요.
- **vacuous truth pass 차단의 정석 = `length >= N` active assertion**. for-of 만으로는 빈 배열이 통과 → 명시적으로 "비어 있으면 fail" 강제. RLS / authorization / filtering / tenant-scoped query 등 "정확히 N 개 보여야 한다" 류 테스트 일반에 적용.
- **테스트가 통과해도 RLS 가 깨졌을 가능성 = vacuous truth 의심 신호**. testcase 추가 후 라이브 통과 시 "정말 보호망이 동작한 것인가" 점검: (a) 시드된 row 가 존재하는지 (b) 시드가 양 tenant 모두 있는지 (c) `length >= 1` 같은 active assertion 이 있는지.
- **S82 "4 latent bug" 패턴의 구조적 원인은 검증 깊이 부족이 아니라 검증 자체의 무력화**. handler 진입 후 1 step 검증하는 메모리 룰 (`feedback_verification_scope_depth.md`) 외에도 본 vacuous truth pass 차단이 결정적 — 검증 코드가 "동작하는지" 자체를 능동적으로 증명해야 한다.

## 관련 파일

- `tests/messenger/rls.test.ts` — 본 패턴 적용 (commit `da8786b`)
- `tests/messenger/_fixtures.ts` — 보강된 시드 helper (createUser/createConversation/createMessage 등)
- `memory/feedback_verification_scope_depth.md` — 검증 깊이 룰 (자매 메모리)
- `memory/feedback_grant_check_for_bypassrls_roles.md` — BYPASSRLS=t role 도 GRANT 검증 (자매 메모리)
- `CLAUDE.md` PR 게이트 룰 #4 — non-BYPASSRLS 라이브 테스트 강제 (본 패턴이 게이트 의미 보장)
- `docs/research/baas-foundation/04-architecture-wave/wave-tracker.md` §2.2 (S82 4 latent bug 분류)
