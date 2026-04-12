import type { AdvisorRule, AdvisorFinding } from "@/lib/types/supabase-clone";
import { runReadonly } from "@/lib/pg/pool";

interface UnusedIndexRow {
  schemaname: string;
  relname: string;
  indexrelname: string;
  idx_scan: number;
  index_size: string;
}

/**
 * pg_stat_user_indexes에서 idx_scan = 0 인 인덱스 탐지 (스토리지/쓰기 비용 낭비)
 */
export const unusedIndexesRule: AdvisorRule = {
  id: "perf-unused-indexes",
  category: "performance",
  title: "사용되지 않는 인덱스",
  description:
    "통계상 한 번도 사용되지 않은 인덱스를 탐지합니다. 인덱스는 쓰기 성능을 저하시키므로 삭제를 검토하세요.",
  async run(): Promise<AdvisorFinding[]> {
    try {
      const { rows } = await runReadonly<UnusedIndexRow>(
        `SELECT s.schemaname,
                s.relname,
                s.indexrelname,
                s.idx_scan,
                pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size
         FROM pg_stat_user_indexes s
         JOIN pg_index i ON i.indexrelid = s.indexrelid
         WHERE s.idx_scan = 0
           AND NOT i.indisunique
           AND NOT i.indisprimary
           AND s.schemaname = 'public'
         ORDER BY pg_relation_size(s.indexrelid) DESC
         LIMIT 50`
      );

      return rows.map((r) => ({
        ruleId: `${this.id}-${r.indexrelname}`,
        severity: "info",
        title: `${r.indexrelname} — 사용되지 않음 (${r.index_size})`,
        detail: `테이블 ${r.schemaname}.${r.relname} 의 인덱스 ${r.indexrelname} 는 통계 수집 이후 한 번도 사용되지 않았습니다.`,
        remediation: `쓰기 빈도를 고려해 DROP INDEX ${r.schemaname}.${r.indexrelname}; 를 검토하세요. 단, 통계 수집 기간이 짧은 경우 오탐 가능.`,
        targetObject: `${r.schemaname}.${r.relname}`,
      }));
    } catch (err) {
      return [
        {
          ruleId: this.id,
          severity: "info",
          title: "인덱스 통계 조회 실패",
          detail: String(err instanceof Error ? err.message : err),
        },
      ];
    }
  },
};
