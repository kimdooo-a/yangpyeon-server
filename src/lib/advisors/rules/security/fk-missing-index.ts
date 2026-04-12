import type { AdvisorRule, AdvisorFinding } from "@/lib/types/supabase-clone";
import { listForeignKeys, listIndexedColumns } from "@/lib/pg/introspect";

/**
 * FK 컬럼에 인덱스가 없는 경우 — 조인 성능 및 삭제 캐스케이드 성능 저하 유발
 */
export const fkMissingIndexRule: AdvisorRule = {
  id: "sec-fk-missing-index",
  category: "security",
  title: "외래키 컬럼에 인덱스 없음",
  description:
    "외래키 컬럼에 인덱스가 없으면 참조 무결성 검사 성능이 저하되고 대량 삭제 시 락 경합이 발생할 수 있습니다.",
  async run(): Promise<AdvisorFinding[]> {
    const [fks, indexed] = await Promise.all([
      listForeignKeys(),
      listIndexedColumns(),
    ]);

    // 인덱스된 첫 컬럼 집합 (복합 인덱스의 선행 컬럼 기준)
    const indexedSet = new Set<string>();
    for (const idx of indexed) {
      const first = idx.columns[0];
      if (first) {
        indexedSet.add(`${idx.schema}.${idx.table}.${first}`);
      }
    }

    const findings: AdvisorFinding[] = [];
    for (const fk of fks) {
      const key = `${fk.source_schema}.${fk.source_table}.${fk.source_column}`;
      if (!indexedSet.has(key)) {
        findings.push({
          ruleId: this.id,
          severity: "warn",
          title: `${fk.source_table}.${fk.source_column} — 인덱스 없음`,
          detail: `외래키 ${fk.constraint_name} 의 컬럼 ${fk.source_column} 에 인덱스가 없습니다. 대상: ${fk.target_table}.${fk.target_column}`,
          remediation: `CREATE INDEX IF NOT EXISTS idx_${fk.source_table}_${fk.source_column} ON ${fk.source_schema}.${fk.source_table}(${fk.source_column});`,
          targetObject: `${fk.source_schema}.${fk.source_table}`,
        });
      }
    }
    return findings;
  },
};
