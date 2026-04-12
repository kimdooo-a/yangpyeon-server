import { Pool, type QueryResultRow } from "pg";

/**
 * 세션 14: 직접 PostgreSQL 연결 풀 (Prisma와 병용)
 *
 * 용도:
 * - SQL Editor: 읽기전용 쿼리 실행 (app_readonly 롤로 SET ROLE)
 * - Advisors: information_schema / pg_stat_statements 조회
 * - Schema Visualizer: information_schema 컬럼/FK 조회
 *
 * Why: Prisma $queryRawUnsafe는 공식 경고(문자열 보간 위험). 직접 pg로 분리.
 * How to apply: 쓰기 쿼리는 Prisma를 사용. 읽기/introspection만 이 풀 사용.
 */

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function buildPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다");
  }
  return new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export function getPgPool(): Pool {
  if (!globalThis.__pgPool) {
    globalThis.__pgPool = buildPool();
  }
  return globalThis.__pgPool;
}

/**
 * 읽기전용 트랜잭션에서 SQL 실행. statement_timeout 강제.
 * app_readonly 롤이 DB에 존재하면 SET ROLE로 전환, 없으면 스킵(경고만).
 */
export async function runReadonly<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  options: { timeoutMs?: number; useReadonlyRole?: boolean } = {}
): Promise<{ rows: T[]; fields: { name: string; dataType: string }[]; rowCount: number }> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const useRole = options.useReadonlyRole ?? true;
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
    if (useRole) {
      try {
        await client.query("SET LOCAL ROLE app_readonly");
      } catch {
        // app_readonly 롤이 없는 환경에서는 통과(READ ONLY 트랜잭션이 1차 방어)
      }
    }
    const result = await client.query<T>(sql, params);
    await client.query("COMMIT");
    return {
      rows: result.rows,
      fields: (result.fields ?? []).map((f) => ({
        name: f.name,
        dataType: String(f.dataTypeID),
      })),
      rowCount: result.rowCount ?? 0,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}
