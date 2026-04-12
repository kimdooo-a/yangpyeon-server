import type { AdvisorRule, AdvisorFinding } from "@/lib/types/supabase-clone";
import { runReadonly } from "@/lib/pg/pool";

interface StatementRow {
  query: string;
  calls: number;
  total_exec_time: number;
  mean_exec_time: number;
}

/**
 * pg_stat_statements가 활성화된 경우 상위 5개 slow query 반환
 */
export const slowQueriesRule: AdvisorRule = {
  id: "perf-slow-queries",
  category: "performance",
  title: "느린 쿼리 Top 5",
  description:
    "pg_stat_statements 확장을 통해 평균 실행 시간이 가장 긴 쿼리 5개를 식별합니다.",
  async run(): Promise<AdvisorFinding[]> {
    // 확장 활성화 여부 확인
    const ext = await runReadonly<{ extname: string }>(
      `SELECT extname FROM pg_extension WHERE extname = 'pg_stat_statements'`
    );

    if (ext.rows.length === 0) {
      return [
        {
          ruleId: this.id,
          severity: "info",
          title: "pg_stat_statements 미설치",
          detail:
            "pg_stat_statements 확장이 활성화되지 않아 느린 쿼리 감지를 수행할 수 없습니다.",
          remediation:
            "postgresql.conf 에 shared_preload_libraries = 'pg_stat_statements' 추가 후 재시작하고 `CREATE EXTENSION pg_stat_statements;` 실행하세요.",
        },
      ];
    }

    try {
      const { rows } = await runReadonly<StatementRow>(
        `SELECT query, calls, total_exec_time, mean_exec_time
         FROM pg_stat_statements
         WHERE query NOT ILIKE '%pg_stat_statements%'
         ORDER BY mean_exec_time DESC
         LIMIT 5`
      );

      return rows.map((r, i) => ({
        ruleId: `${this.id}-${i + 1}`,
        severity: r.mean_exec_time > 1000 ? "warn" : "info",
        title: `느린 쿼리 #${i + 1} — 평균 ${r.mean_exec_time.toFixed(2)}ms`,
        detail: `호출 ${r.calls}회 / 총 ${r.total_exec_time.toFixed(0)}ms\n쿼리: ${r.query.slice(0, 280)}${r.query.length > 280 ? "…" : ""}`,
        remediation:
          "EXPLAIN ANALYZE 로 실행 계획을 확인하고 필요한 인덱스 추가 또는 쿼리 재작성을 검토하세요.",
      }));
    } catch (err) {
      return [
        {
          ruleId: this.id,
          severity: "info",
          title: "pg_stat_statements 조회 실패",
          detail: String(err instanceof Error ? err.message : err),
        },
      ];
    }
  },
};
