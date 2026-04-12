import type { AdvisorRule, AdvisorFinding } from "@/lib/types/supabase-clone";
import { runReadonly } from "@/lib/pg/pool";

interface TableInfo {
  schemaname: string;
  tablename: string;
  rowsecurity: boolean;
}

interface PolicyInfo {
  schemaname: string;
  tablename: string;
  policyname: string;
}

/**
 * public 스키마의 테이블 중 RLS가 활성화되지 않았거나 정책이 없는 경우 경고
 */
export const rlsNotConfiguredRule: AdvisorRule = {
  id: "sec-rls-not-configured",
  category: "security",
  title: "RLS(Row Level Security) 미구성",
  description:
    "public 스키마 테이블 중 RLS가 활성화되지 않았거나 정책이 정의되지 않은 테이블이 있습니다.",
  async run(): Promise<AdvisorFinding[]> {
    const [tablesRes, policiesRes] = await Promise.all([
      runReadonly<TableInfo>(
        `SELECT schemaname, tablename, rowsecurity
         FROM pg_tables
         WHERE schemaname = 'public'`
      ),
      runReadonly<PolicyInfo>(
        `SELECT schemaname, tablename, policyname
         FROM pg_policies
         WHERE schemaname = 'public'`
      ),
    ]);

    const policyMap = new Map<string, number>();
    for (const p of policiesRes.rows) {
      const key = `${p.schemaname}.${p.tablename}`;
      policyMap.set(key, (policyMap.get(key) ?? 0) + 1);
    }

    const findings: AdvisorFinding[] = [];
    for (const t of tablesRes.rows) {
      const key = `${t.schemaname}.${t.tablename}`;
      const policyCount = policyMap.get(key) ?? 0;

      if (!t.rowsecurity) {
        findings.push({
          ruleId: this.id,
          severity: "warn",
          title: `${t.tablename} — RLS 비활성화`,
          detail: `테이블 ${key} 의 ROW LEVEL SECURITY가 꺼져있습니다. Data API를 통해 외부에 노출될 경우 모든 행이 조회됩니다.`,
          remediation: `ALTER TABLE ${key} ENABLE ROW LEVEL SECURITY;`,
          targetObject: key,
        });
      } else if (policyCount === 0) {
        findings.push({
          ruleId: this.id,
          severity: "error",
          title: `${t.tablename} — RLS 활성화되었으나 정책 없음`,
          detail: `${key} 는 RLS가 활성화되었지만 정책(policy)이 한 개도 정의되지 않아 모든 접근이 거부됩니다.`,
          remediation: `CREATE POLICY ... ON ${key} ... 로 최소 하나의 정책을 정의하세요.`,
          targetObject: key,
        });
      }
    }
    return findings;
  },
};
