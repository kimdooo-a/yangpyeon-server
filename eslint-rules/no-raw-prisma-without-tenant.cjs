/**
 * eslint-rules/no-raw-prisma-without-tenant.cjs
 *
 * Phase 1.4 (T1.4) — ADR-023 §6 ESLint custom rule.
 *
 * 목표:
 *   raw `prisma.<model>.<op>()` / `prisma.$queryRaw` / `$executeRaw` / `$executeRawUnsafe` 호출이
 *   `withTenant` / `withTenantTx` / `withTenantQuery` / `runWithTenant` callback 내부에서만
 *   실행되도록 강제. cross-tenant leak 의 정적 backstop.
 *
 * 적용 범위:
 *   src/app/, src/components/ 등 컨슈머/대시보드 라우트. 일반 비즈니스 코드.
 *
 * 예외 (allowlist):
 *   - src/lib/db/      — 본 rule 자체의 호출자 (prisma-tenant-client). raw 호출이 정상.
 *   - src/lib/prisma.ts — basePrisma lazy proxy. 정의 위치.
 *   - scripts/         — bootstrap / migration / 운영 스크립트.
 *   - tests/           — 격리 테스트 자체가 raw 호출을 의도.
 *
 * 심각도 (Phase 1.4 단계):
 *   warn — 점진적 도입. 기존 호출 사이트 (sessions/tokens.ts, mfa/* 등) 가 sweep 전.
 *
 * TODO (Phase 1.4 sweep 완료 후):
 *   error 로 승격. 새 위반 PR 차단. ADR-023 §6 의 minimum bar.
 *
 * 한계 (spec §6.3):
 *   - 함수 분리 시 false-negative — 예: helper 가 prisma.* 호출하면 호출자 컨텍스트 추적 불가.
 *   - tests/rls/cross-tenant-leak.test.ts (T1.4 §7) 가 dynamic backstop.
 *
 * Format: CommonJS (.cjs). Next.js eslint flat config 의 flat-compat 가 require 가능.
 */

"use strict";

const TENANT_WRAPPER_NAMES = new Set([
  "withTenant",
  "withTenantTx",
  "withTenantQuery",
  "runWithTenant",
]);

const RAW_METHOD_NAMES = new Set([
  "$queryRaw",
  "$queryRawUnsafe",
  "$executeRaw",
  "$executeRawUnsafe",
]);

const ALLOWED_PATH_FRAGMENTS = [
  // OS-independent: 슬래시 양방향 매칭.
  "/lib/db/",
  "\\lib\\db\\",
  "/lib/prisma.ts",
  "\\lib\\prisma.ts",
  "/scripts/",
  "\\scripts\\",
  "/tests/",
  "\\tests\\",
  // Phase 1.4 도입 단계 — 이미 존재하는 raw 호출 사이트 (sweep 전).
  // 이 allowlist 는 Phase 1.4 후속 PR 에서 점진적 축소. TODO: 비워질 때까지 유지.
  "/lib/sessions/",
  "\\lib\\sessions\\",
  "/lib/jwks/",
  "\\lib\\jwks\\",
  "/lib/mfa/",
  "\\lib\\mfa\\",
  "/lib/cron/",
  "\\lib\\cron\\",
  "/lib/audit",
  "\\lib\\audit",
];

function isAllowedFile(filename) {
  if (!filename) return true; // 파일명 없으면 회피 (in-memory eval 등).
  for (const frag of ALLOWED_PATH_FRAGMENTS) {
    if (filename.includes(frag)) return true;
  }
  return false;
}

function isWithTenantCall(node) {
  if (!node || node.type !== "CallExpression") return false;
  const callee = node.callee;
  if (!callee) return false;
  if (callee.type === "Identifier" && TENANT_WRAPPER_NAMES.has(callee.name)) {
    return true;
  }
  // 멤버 호출 — `obj.withTenant()` 등도 허용 (re-export 케이스).
  if (
    callee.type === "MemberExpression" &&
    callee.property &&
    callee.property.type === "Identifier" &&
    TENANT_WRAPPER_NAMES.has(callee.property.name)
  ) {
    return true;
  }
  return false;
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "raw prisma 호출은 withTenant/withTenantTx/withTenantQuery/runWithTenant 안에서만 허용",
      recommended: true,
      url: "docs/research/baas-foundation/04-architecture-wave/01-architecture/02-adr-023-impl-spec.md#6",
    },
    schema: [],
    messages: {
      rawPrisma:
        "prisma.* 직접 호출 금지 — withTenant() / withTenantTx() / withTenantQuery() 안에서만 사용 가능 " +
        "(cross-tenant leak 방지). system 작업이라면 src/lib/db/ 또는 scripts/ 안에서 호출하세요.",
      rawSql:
        "raw SQL ($queryRaw/$executeRaw/$queryRawUnsafe/$executeRawUnsafe) 은 " +
        "withTenant() 안에서만 호출 가능. tenant_id WHERE 누락 시 cross-tenant 유출 위험.",
    },
  },

  create(context) {
    const filename = context.getFilename
      ? context.getFilename()
      : context.filename;
    if (isAllowedFile(filename)) {
      // allowlist 파일은 검사 스킵 — 빈 visitor 반환.
      return {};
    }

    // wrapper 호출 깊이 카운트 (중첩 허용).
    let withTenantDepth = 0;

    return {
      CallExpression(node) {
        if (isWithTenantCall(node)) {
          withTenantDepth++;
        }
      },
      "CallExpression:exit"(node) {
        if (isWithTenantCall(node)) {
          withTenantDepth--;
        }
      },

      // prisma.<model>.<op>() — Member 체인.
      // prisma.user.findMany() 의 내부 MemberExpression `prisma.user` 의 object.name === 'prisma'.
      "MemberExpression[object.name='prisma']"(node) {
        if (withTenantDepth > 0) return;
        // raw method 는 별도 메시지.
        if (
          node.property &&
          node.property.type === "Identifier" &&
          RAW_METHOD_NAMES.has(node.property.name)
        ) {
          context.report({ node, messageId: "rawSql" });
          return;
        }
        context.report({ node, messageId: "rawPrisma" });
      },

      // basePrisma.* 도 동일하게 차단 (re-export alias).
      "MemberExpression[object.name='basePrisma']"(node) {
        if (withTenantDepth > 0) return;
        context.report({ node, messageId: "rawPrisma" });
      },
    };
  },
};
