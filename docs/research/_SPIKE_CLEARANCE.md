# Spike Clearance Registry

> 스파이크 완료 후 코딩 허가 기록

| 날짜 | 주제 | Level | 유형 | 판정 | 산출물 | ADR |
|------|------|-------|------|------|--------|-----|
| 2026-04-06 | 프론트엔드 디자인 | L3 | Full | Go | spikes/spike-001-frontend-design/ | ADR-001 |
| 2026-04-06 | SQLite + Drizzle + Next.js | SPIKE | Tech | Go | spikes/spike-001-sqlite-drizzle-result.md | — |
| 2026-04-06 | SSE + Cloudflare Tunnel | SPIKE | Tech | Go | spikes/spike-002-sse-result.md | — |
| 2026-04-06 | shadcn/ui 다크 테마 호환 | SPIKE | Tech | Go | spikes/spike-004-shadcn-result.md | — |
| 2026-04-12 | SQL Editor (monaco + pg 읽기전용) | SPIKE | Tech | Recommend(조건부) | spikes/spike-005-sql-editor.md | ADR-002 |
| 2026-04-12 | Schema Visualizer (@xyflow + DMMF) | SPIKE | Tech | Go | spikes/spike-005-schema-visualizer.md | ADR-002 |
| 2026-04-12 | Advisors Linter (splinter TS 포팅) | SPIKE | Tech | Go | spikes/spike-005-advisors.md | ADR-002 |
| 2026-04-12 | Edge Functions lite (worker_threads + vm) | SPIKE | Tech | Go(v1 lite) | spikes/spike-005-edge-functions.md | ADR-002 |
| 2026-04-12 | Data API auto-gen (Prisma DMMF + 동적 라우트) | SPIKE | Tech | Go | spikes/spike-005-data-api.md | ADR-002 |
| 2026-04-19 | SP-014 JWKS 캐시 3분 grace | SPIKE | Tech | 조건부 Go | docs/research/spikes/spike-014-jwks-cache-result.md | ADR-013 (보완 대기) |
| 2026-04-19 | SP-015 Session 인덱스 (SQLite vs PG) | SPIKE | Tech | Go | docs/research/spikes/spike-015-session-index-result.md | ADR-006 (보완 대기) |
| 2026-04-19 | SP-011 argon2id vs bcrypt | SPIKE | Tech | Go | docs/research/spikes/spike-011-argon2-result.md | ADR-022 (신규 제안) |
| 2026-04-19 | SP-010 PM2 cluster:4 vs fork | SPIKE | Tech | 조건부 Go | docs/research/spikes/spike-010-pm2-cluster-result.md | ADR-015 (보완 대기) |
| 2026-04-19 | SP-012 isolated-vm v6 Node v24 | SPIKE | Tech | Go | docs/research/spikes/spike-012-isolated-vm-v6-result.md | ADR-009 (재검토 트리거 1 해소) |
| 2026-04-19 | SP-013 wal2json 슬롯 | SPIKE | Tech | Pending (축약) | docs/research/spikes/spike-013-wal2json-slot-result.md | ADR-010 (측정 대기) |
| 2026-04-19 | SP-016 SeaweedFS 50GB | SPIKE | Tech | Pending (축약) | docs/research/spikes/spike-016-seaweedfs-50gb-result.md | ADR-008 (측정 대기) |
| 2026-04-19 | SP-017 Vault AES-256-GCM envelope | SPIKE | Tech | Go | spikes/sp-017-vault-crypto/ | Phase 16a (16a Vault) |
| 2026-04-19 | SP-018 symlink atomic swap + PM2 reload | SPIKE | Tech | Go (16b) / 16c cluster 정당화 | spikes/sp-018-symlink-swap/ | Phase 16b, 16c |
| 2026-04-19 | SP-019 PM2 cluster:4 + better-sqlite3 + v6 delete | SPIKE | Tech | Conditional Go (scheduler fork 분리 필수) | spikes/sp-019-pm2-cluster/ | Phase 16c |
| 2026-04-26 | SP-006 PG LISTEN/NOTIFY + SSE 정합성 (메신저 Phase 2 백본) | MICRO | Tech | Conditional Go (Phase 1 in-memory 유지, Phase 2 진입 시 POC 5건 측정 후 ADR-031) | docs/research/spikes/spike-006-pg-notify-sse.md | ADR-030 (입력 자료) / ADR-031 (Phase 2 작성 예정) |
