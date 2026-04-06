# SPIKE-01: SQLite + Drizzle 통합 검증 결과

## 결과: 성공

### 검증 항목
1. npm install: 성공 (better-sqlite3@12.8.0, drizzle-orm@0.45.2, drizzle-kit@0.31.10)
2. serverExternalPackages 필요: 예 (`['better-sqlite3']` 설정 필수)
3. WAL 모드: 성공 (pragma 설정으로 적용)
4. Next.js build: 성공 (Turbopack, 24개 라우트 전부 정상)
5. 마이그레이션 생성/실행: 성공 (3 테이블, data/dashboard.db 32KB 생성)

### 발견 사항
- `prebuild-install` deprecated 경고 있으나 빌드에 영향 없음
- Turbopack 환경에서도 better-sqlite3 네이티브 바인딩 정상 동작
- middleware → proxy 리네임 경고는 Next.js 16 관련 (이번 spike와 무관)
- npm audit에서 4개 moderate 취약점 (drizzle-kit 관련, devDependency이므로 프로덕션 영향 없음)

### PM2 호환성
- better-sqlite3는 프로세스 내 임베디드 DB → PM2 단일 인스턴스 모드에서 문제 없음
- PM2 cluster 모드 사용 시 WAL 모드가 동시 읽기를 지원하므로 읽기 성능 양호
- 쓰기는 SQLite 특성상 직렬화됨 (busy_timeout=5000ms로 대기)

### 생성된 파일
- `src/lib/db/schema.ts` — 3개 테이블 스키마 (audit_logs, metrics_history, ip_whitelist)
- `src/lib/db/index.ts` — DB 연결 싱글톤 (WAL + busy_timeout)
- `src/lib/db/migrations/0000_old_maverick.sql` — 초기 마이그레이션
- `drizzle.config.ts` — Drizzle Kit 설정
- `data/.gitignore` — DB 파일 git 제외
- `data/dashboard.db` — SQLite 데이터베이스 파일

### next.config.ts 변경
- `serverExternalPackages: ['better-sqlite3']` 추가 (기존 headers 설정 유지)

### package.json 스크립트 추가
- `db:generate` — drizzle-kit generate
- `db:migrate` — drizzle-kit migrate
- `db:studio` — drizzle-kit studio
