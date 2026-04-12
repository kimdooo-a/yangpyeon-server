import type { AdvisorRule, AdvisorFinding } from "@/lib/types/supabase-clone";

/**
 * users.password_hash 컬럼이 Data API로 노출될 위험 안내
 *
 * Cluster A의 allowlist 모듈을 직접 import하지 않고 정적 안내만 반환한다.
 * (모듈 경계 분리 — Cluster A 완료 후 동적 연동 예정)
 */
export const passwordHashExposedRule: AdvisorRule = {
  id: "sec-password-hash-exposed",
  category: "security",
  title: "비밀번호 해시 노출 위험",
  description:
    "Data API 허용 테이블 설정(`src/lib/data-api/allowlist.ts`) 작성 시 `users.password_hash` 컬럼이 `exposedColumns`에 포함되지 않았는지 확인해야 합니다.",
  async run(): Promise<AdvisorFinding[]> {
    return [
      {
        ruleId: this.id,
        severity: "info",
        title: "users.password_hash 노출 여부 수동 검토 필요",
        detail:
          "Data API Explorer(Cluster A) 도입 시, users 테이블 allowlist의 exposedColumns에서 password_hash / passwordHash 컬럼을 제외해야 합니다. 현재는 정적 점검 단계이며 실제 allowlist가 구성되면 자동 감지로 전환됩니다.",
        remediation:
          "src/lib/data-api/allowlist.ts 의 users 엔트리에서 password_hash / passwordHash 가 exposedColumns 에 포함되지 않도록 한다.",
        targetObject: "public.users",
      },
    ];
  },
};
