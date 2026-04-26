---
title: Prisma 1:1 관계는 복합 PK만으로 부족 — FK 측에 @unique 별도 필요
date: 2026-04-26
session: 67
tags: [prisma, multi-tenant, schema-design, 1to1-relation, validation]
category: pattern
confidence: high
---

## 문제

multi-tenant 프로젝트에서 1:1 관계를 표현하려고 복합 PK `@@id([tenantId, userId])`만 사용하니 `prisma validate`가 `P1012`로 실패.

```prisma
model User {
  // ...
  notificationPreference NotificationPreference? @relation("UserNotifPref")
}

model NotificationPreference {
  tenantId String @map("tenant_id") @db.Uuid
  userId   String @map("user_id")
  // ... 기타 필드
  user     User   @relation("UserNotifPref", fields: [userId], references: [id], onDelete: Cascade)

  @@id([tenantId, userId])
  @@map("notification_preferences")
}
```

```
Error parsing attribute "@relation": A one-to-one relation must use unique fields
on the defining side. Either add an `@unique` attribute to the field `userId`, or
change the relation to one-to-many.
```

## 원인

**Prisma의 1:1 관계 검증은 컬럼 단위**: User에 `NotificationPreference?` (옵셔널 단수)로 선언하면, 반대편의 FK 컬럼(`userId`) 자체가 unique해야 한다. 복합 PK `(tenantId, userId)`가 `tenantId`+`userId` 조합으로 unique하더라도, **단일 컬럼 unique 제약을 만족하지 않으므로** 1:1로 인정 안 됨.

이는 spec이지 버그가 아님 — Prisma는 schema 차원에서 "user 1명 → preference 0~1개"를 강제하려면 userId 단독 unique가 필요. 그렇지 않으면 user A가 tenant X와 Y 양쪽에 preference를 가질 수 있고, 이는 `NotificationPreference?` (단수) 시맨틱과 충돌.

복합 PK는 query locality / RLS planner 효율 / cross-tenant 충돌 차단에는 충분하지만 1:1 표현에는 불충분.

## 해결

FK 컬럼에 `@unique` 추가. 복합 PK는 query locality 목적으로 유지.

```prisma
model NotificationPreference {
  tenantId String @map("tenant_id") @db.Uuid
  userId   String @unique @map("user_id")  // 1:1 관계 요건
  // ...
  @@id([tenantId, userId])  // query locality + RLS planner 효율
}
```

마이그레이션에도 동일 반영:
```sql
CREATE UNIQUE INDEX "notification_preferences_user_id_key"
  ON "notification_preferences"("user_id");
```

**왜 안전한가** — User가 이미 tenant-scoped (multi-tenant 환경에서 (tenantId, email) composite unique 적용됨)이므로, userId 자체가 글로벌 unique. cross-tenant 동일 userId 재사용 0건이 schema invariant. 복합 PK + 단일 FK unique 조합이 중복 인덱스처럼 보이지만, planner는 두 인덱스를 다른 query 패턴에 사용 — `WHERE userId = ?` (1:1 lookup) vs `WHERE tenantId = ? AND userId = ?` (RLS join).

이 프로젝트의 동일 패턴: `MfaEnrollment` (line 167) — `userId @unique`.

## 교훈

1. **1:1 관계는 단일 컬럼 unique가 강제 사항** — 복합 PK가 있어도 별도 명시 필요. Prisma validate가 즉시 잡아주므로 schema 작성 후 곧바로 `npx prisma validate` 실행 습관 필수.
2. **multi-tenant + 1:1 = 글로벌 @unique 정당화** — User-scoped 1:1 모델(MfaEnrollment, NotificationPreference 등)은 cross-tenant 충돌 없으므로 글로벌 unique가 올바름. tenant-scoped composite와 모순 아님.
3. **두 unique 인덱스는 의도적** — 복합 PK는 RLS query locality(`tenant_id` 첫 컬럼이 partition key 역할), 단일 unique는 1:1 lookup 가속 + Prisma 관계 invariant. 중복 인덱스로 오해하고 제거 시 1:1 관계 깨짐.

## 관련 파일

- `prisma/schema.prisma` — `NotificationPreference` (세션 67 추가) / `MfaEnrollment` (Phase 15 동일 패턴)
- `prisma/migrations/20260501030000_messenger_phase1_safety/migration.sql` — `notification_preferences_user_id_key` UNIQUE 인덱스
- `docs/research/messenger/data-model.md` §2.9 — 본 모델의 RLS + composite PK 의도
