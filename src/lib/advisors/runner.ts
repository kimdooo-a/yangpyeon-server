import type {
  AdvisorFinding,
  AdvisorRule,
  AdvisorRunContext,
} from "@/lib/types/supabase-clone";
import { runReadonly } from "@/lib/pg/pool";
import { fkMissingIndexRule } from "./rules/security/fk-missing-index";
import { passwordHashExposedRule } from "./rules/security/password-hash-exposed";
import { rlsNotConfiguredRule } from "./rules/security/rls-not-configured";
import { slowQueriesRule } from "./rules/performance/slow-queries";
import { unusedIndexesRule } from "./rules/performance/unused-indexes";

const SECURITY_RULES: AdvisorRule[] = [
  fkMissingIndexRule,
  passwordHashExposedRule,
  rlsNotConfiguredRule,
];

const PERFORMANCE_RULES: AdvisorRule[] = [slowQueriesRule, unusedIndexesRule];

function buildContext(): AdvisorRunContext {
  return {
    query: async <T = unknown>(sql: string) => {
      const { rows } = await runReadonly(sql);
      return rows as T[];
    },
  };
}

async function runRules(rules: AdvisorRule[]): Promise<AdvisorFinding[]> {
  const ctx = buildContext();
  const results = await Promise.allSettled(rules.map((r) => r.run(ctx)));
  const findings: AdvisorFinding[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      findings.push(...r.value);
    } else {
      findings.push({
        ruleId: rules[i].id,
        severity: "error",
        title: `${rules[i].title} — 실행 실패`,
        detail: String(r.reason instanceof Error ? r.reason.message : r.reason),
      });
    }
  }
  return findings;
}

export async function runSecurityRules(): Promise<AdvisorFinding[]> {
  return runRules(SECURITY_RULES);
}

export async function runPerformanceRules(): Promise<AdvisorFinding[]> {
  return runRules(PERFORMANCE_RULES);
}
