/**
 * ESLint flat config — Phase 1.4 (T1.4) 신설.
 *
 * 목표:
 *   - tenant/no-raw-prisma-without-tenant rule 등록 (ADR-023 §6).
 *   - Next.js 16 flat config 양식 호환 (eslint v9+).
 *
 * 한계:
 *   - 본 worktree 에는 eslint 가 install 되어 있지 않다 (npm install 미실행).
 *     상위 모노레포에서 eslint 가 install 된 후 본 config 가 활성화됨.
 *   - 현 단계는 rule 정의 + config skeleton 까지. 실제 lint 실행은 운영자가 install 후 수행.
 *
 * 후속:
 *   - `next lint` 가 Next.js 16 에서 deprecated → 직접 `eslint src/` 실행 권장.
 *   - 본 config 가 활성화되면 기존 호출 사이트의 raw prisma 사용이 warn 으로 표시.
 *   - Phase 1.4 sweep 후 `tenant/no-raw-prisma-without-tenant: 'error'` 로 승격.
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const tenantRule = require("./eslint-rules/no-raw-prisma-without-tenant.cjs");

export default [
  {
    name: "tenant-rls/baseline",
    files: ["src/**/*.ts", "src/**/*.tsx"],
    plugins: {
      tenant: {
        rules: {
          "no-raw-prisma-without-tenant": tenantRule,
        },
      },
    },
    rules: {
      // TODO(Phase 1.4 sweep): 'warn' → 'error' 로 승격 후 신규 위반 PR 차단.
      "tenant/no-raw-prisma-without-tenant": "warn",
    },
  },
  // packages/core 는 plugin 분리 정합 검사용 — Tenant 도메인 강제는 동일.
  {
    name: "tenant-rls/packages",
    files: ["packages/**/*.ts"],
    plugins: {
      tenant: {
        rules: {
          "no-raw-prisma-without-tenant": tenantRule,
        },
      },
    },
    rules: {
      "tenant/no-raw-prisma-without-tenant": "warn",
    },
  },
  // generated / artifact 디렉토리는 ignore.
  {
    name: "tenant-rls/ignores",
    ignores: [
      ".next/**",
      "standalone/**",
      "src/generated/**",
      "node_modules/**",
      "spikes/**",
      "scripts/**",
      "tests/**",
      "docs/**",
    ],
  },
];
