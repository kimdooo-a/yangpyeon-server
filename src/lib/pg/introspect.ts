import { runReadonly } from "./pool";
import type { SchemaNode, SchemaEdge, SchemaGraph, SchemaNodeColumn } from "@/lib/types/supabase-clone";

/**
 * 세션 14: PostgreSQL 스키마 내성(introspection) 헬퍼
 * 사용처: Schema Visualizer, Data API allowlist 검증, Advisors 규칙
 */

interface RawColumn {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
  ordinal_position: number;
}

interface RawPrimaryKey {
  table_schema: string;
  table_name: string;
  column_name: string;
}

interface RawForeignKey {
  constraint_name: string;
  source_schema: string;
  source_table: string;
  source_column: string;
  target_schema: string;
  target_table: string;
  target_column: string;
}

/** 공용 스키마(public) 외의 내부 스키마는 기본 제외 */
const DEFAULT_SCHEMAS = ["public"];

export async function listColumns(schemas: string[] = DEFAULT_SCHEMAS): Promise<RawColumn[]> {
  const { rows } = await runReadonly<RawColumn>(
    `SELECT table_schema, table_name, column_name, data_type, is_nullable, ordinal_position
     FROM information_schema.columns
     WHERE table_schema = ANY($1::text[])
     ORDER BY table_schema, table_name, ordinal_position`,
    [schemas]
  );
  return rows;
}

export async function listPrimaryKeys(schemas: string[] = DEFAULT_SCHEMAS): Promise<RawPrimaryKey[]> {
  const { rows } = await runReadonly<RawPrimaryKey>(
    `SELECT tc.table_schema, tc.table_name, kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
     WHERE tc.constraint_type = 'PRIMARY KEY'
       AND tc.table_schema = ANY($1::text[])`,
    [schemas]
  );
  return rows;
}

export async function listForeignKeys(schemas: string[] = DEFAULT_SCHEMAS): Promise<RawForeignKey[]> {
  const { rows } = await runReadonly<RawForeignKey>(
    `SELECT
        tc.constraint_name,
        tc.table_schema AS source_schema,
        tc.table_name   AS source_table,
        kcu.column_name AS source_column,
        ccu.table_schema AS target_schema,
        ccu.table_name   AS target_table,
        ccu.column_name  AS target_column
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = ANY($1::text[])`,
    [schemas]
  );
  return rows;
}

/** 모든 FK 인덱스 유무를 판정하기 위한 pg_indexes 정보 */
export async function listIndexedColumns(schemas: string[] = DEFAULT_SCHEMAS): Promise<
  { schema: string; table: string; columns: string[] }[]
> {
  const { rows } = await runReadonly<{
    schemaname: string;
    tablename: string;
    columns: string;
  }>(
    `SELECT schemaname, tablename,
            string_agg(attname, ',' ORDER BY array_position(ix.indkey::smallint[], a.attnum)) AS columns
     FROM pg_indexes pi
     JOIN pg_class c ON c.relname = pi.tablename
     JOIN pg_index ix ON ix.indrelid = c.oid
     JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(ix.indkey)
     WHERE schemaname = ANY($1::text[])
     GROUP BY schemaname, tablename, ix.indexrelid`,
    [schemas]
  );
  return rows.map((r) => ({
    schema: r.schemaname,
    table: r.tablename,
    columns: r.columns.split(","),
  }));
}

/**
 * 스키마 그래프 조립 (Schema Visualizer에서 사용)
 */
export async function buildSchemaGraph(schemas: string[] = DEFAULT_SCHEMAS): Promise<SchemaGraph> {
  const [cols, pks, fks] = await Promise.all([
    listColumns(schemas),
    listPrimaryKeys(schemas),
    listForeignKeys(schemas),
  ]);

  const pkSet = new Set(pks.map((p) => `${p.table_schema}.${p.table_name}.${p.column_name}`));
  const fkMap = new Map<string, { table: string; column: string }>();
  for (const fk of fks) {
    const key = `${fk.source_schema}.${fk.source_table}.${fk.source_column}`;
    fkMap.set(key, { table: `${fk.target_schema}.${fk.target_table}`, column: fk.target_column });
  }

  const tables = new Map<string, { schema: string; table: string; columns: SchemaNodeColumn[] }>();
  for (const c of cols) {
    const key = `${c.table_schema}.${c.table_name}`;
    if (!tables.has(key)) {
      tables.set(key, { schema: c.table_schema, table: c.table_name, columns: [] });
    }
    const colKey = `${key}.${c.column_name}`;
    const fk = fkMap.get(colKey);
    tables.get(key)!.columns.push({
      name: c.column_name,
      dataType: c.data_type,
      nullable: c.is_nullable === "YES",
      isPrimaryKey: pkSet.has(colKey),
      isForeignKey: !!fk,
      references: fk,
    });
  }

  const nodes: SchemaNode[] = Array.from(tables.values()).map((t) => ({
    id: `${t.schema}.${t.table}`,
    schema: t.schema,
    table: t.table,
    columns: t.columns,
    source: "information_schema",
  }));

  const edges: SchemaEdge[] = fks.map((fk) => ({
    id: `${fk.constraint_name}`,
    source: `${fk.source_schema}.${fk.source_table}`,
    target: `${fk.target_schema}.${fk.target_table}`,
    sourceColumn: fk.source_column,
    targetColumn: fk.target_column,
  }));

  return { nodes, edges };
}
