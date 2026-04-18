# Phase 14c-γ: 권한 매트릭스 E2E — 설계 스펙

> **생성일**: 2026-04-18 (세션 24 연장)
> **저자**: Claude (자율 실행 모드)
> **상태**: DRAFT → 자율 모드
> **선행**: α(낙관적 잠금) + β(복합 PK)

---

## 1. 목적

Phase 14b/α/β의 3롤(ADMIN/MANAGER/USER) × 4작업(SELECT/INSERT/UPDATE/DELETE) 권한 매트릭스를 curl E2E로 자동 검증한다. 기존 권한 게이트 회귀를 방지하고 각 롤의 403 차등을 재현 가능한 스크립트로 기록한다.

## 2. 범위

### 2.1 In Scope
- `/api/settings/users` POST로 테스트 계정 2개(MANAGER, USER) seed
- `folders` 테이블에 대한 3롤 × 4작업 매트릭스 = 12 시나리오
- curl 자동 실행, 기대 HTTP 상태 코드 + 에러 코드 검증
- teardown: 테스트 계정 비활성(isActive=false) 또는 직접 DB DELETE

### 2.2 Out of Scope
- **USER 역할을 "VIEWER"(SELECT 허용)로 확장** — 민감 테이블(`users`, `api_keys`, `_prisma_migrations`) 읽기 정책 재설계 필요. 별도 spec에서 처리.
- Playwright 브라우저 E2E — 본 세션 Playwright 미설치 유지
- 관리 페이지(`/settings/users`) UI E2E — API 매트릭스가 권한 게이트의 진실 소스

## 3. 현재 권한 매트릭스 (검증 대상)

| Role | GET schema | GET data | POST | PATCH `/[pk]` | DELETE `/[pk]` | PATCH `/composite` | DELETE `/composite` |
|------|:----------:|:--------:|:----:|:-------------:|:--------------:|:------------------:|:-------------------:|
| ADMIN | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| MANAGER | 200 | 200 | 200 | 200 | **403** | 200 | **403** |
| USER | **403** | **403** | **403** | **403** | **403** | **403** | **403** |

**게이트 구조 2계층**:
1. `withRole([...])` — 라우트 레벨. 허용되지 않은 role은 403 `FORBIDDEN`.
2. `checkTablePolicy(table, op, role)` — withRole 통과 후 호출. INSERT/UPDATE/DELETE만 대상. DELETE는 ADMIN만 통과. INSERT/UPDATE는 MANAGER 이상.

현재 구현: `withRole(["ADMIN","MANAGER"])`가 모든 tables/* 라우트에 걸려 있어 USER는 1계층에서 차단. 따라서 USER의 모든 시나리오에 대해 403 `FORBIDDEN`.

## 4. 테스트 시나리오 (G1~G12)

모두 `folders` 테이블 대상. 임시 행은 ADMIN이 seed한 뒤 각 롤이 동일 행에 대해 작업.

| # | Role | Method | Path | body | 기대 | 코드 검증 |
|---|------|--------|------|------|------|-----------|
| G1 | ADMIN | GET | `/schema` | — | 200 | `success:true`, `columns` 존재 |
| G2 | ADMIN | GET | `/tables/folders` | — | 200 | `rows` 배열 |
| G3 | ADMIN | POST | `/tables/folders` | values(id,name,owner_id,is_root) | 200 | `row.id` 일치 |
| G4 | ADMIN | PATCH | `/tables/folders/[id]` | values(name="γ-ADMIN") | 200 | name 반영 |
| G5 | MANAGER | GET | `/schema` | — | 200 | 열 |
| G6 | MANAGER | GET | `/tables/folders` | — | 200 | 행 |
| G7 | MANAGER | POST | `/tables/folders` | (동일 형태, 새 id) | 200 | row 반환 |
| G8 | MANAGER | PATCH | `/tables/folders/[id]` | values(name="γ-MANAGER") | 200 | name 반영 |
| G9 | MANAGER | DELETE | `/tables/folders/[id]` | — | **403** | `code=FORBIDDEN`(withRole) |
| G10 | USER | GET | `/schema` | — | **403** | `code=FORBIDDEN` |
| G11 | USER | POST | `/tables/folders` | values | **403** | `code=FORBIDDEN` |
| G12 | ADMIN | DELETE | `/tables/folders/[id]` | — | 200 | `deleted:true` (cleanup) |

추가 보조 시나리오:
- G0a: ADMIN이 MANAGER 계정 생성 (`POST /api/settings/users`) → 201
- G0b: ADMIN이 USER 계정 생성 → 201
- G99: teardown — 테스트 계정 비활성화 (PATCH `/api/settings/users` `isActive:false`)

## 5. 테스트 계정

| email | role | password |
|-------|------|----------|
| gamma-manager@test.local | MANAGER | GammaTest123! |
| gamma-user@test.local | USER | GammaTest123! |

기존 계정이 있으면 `DUPLICATE_EMAIL` 409 회피를 위해 스크립트는 setup 시 이미 존재하면 skip.

## 6. 에러 코드 검증

withRole이 반환하는 403 응답 형식 확인 필요. 소스 `src/lib/api-guard.ts` 참조 후 기대 shape 명시. (예: `{success:false, error:{code:"FORBIDDEN", message:"..."}}`)

## 7. 테스트 격리

- seed folder의 PK는 runtime UUID → 각 실행마다 독립
- 테스트 계정은 고정 이메일 → 재실행 시 DUPLICATE 방지를 위해 첫 실행에만 생성
- 최종 teardown은 isActive=false로 계정 비활성(삭제 대신) — 감사 로그 연결 보존

## 8. 롤백 전략

- 코드 변경 없음 — 순수 검증 스크립트
- 테스트 계정은 isActive=false로 비활성 (필요 시 ADMIN이 isActive=true로 재활성 가능)
- 더 적극적인 정리 필요 시 `wsl -d Ubuntu -u postgres` 로 DELETE

## 9. 커밋 경계

단일 커밋: `test(14c-γ): 권한 매트릭스 E2E 스크립트 + 실행 결과 DOD`. 순수 테스트 추가이므로 분할 이점 적음.

## 10. 결정 로그

| 결정 | 선택 | 사유 |
|------|------|------|
| VIEWER enum 추가 | 보류 | USER가 현재 "no tables access"라 VIEWER(read-only)와 의미 다름. USER의 SELECT 허용은 민감 테이블 gate 설계 선행 필요. |
| 계정 seed 방식 | `/api/settings/users` POST | 비밀번호 해시 일관성 + 표준 경로 재사용. 직접 SQL INSERT는 hash 불일치 위험. |
| 테스트 테이블 | `folders` (일반 업무) | FULL_BLOCK 밖, DELETE_ONLY 밖, 복합 PK 아님 → 3롤 × 4op 매트릭스에 적합 |
| Teardown 정책 | isActive=false | 감사 로그 FK 연결 보존, 재활성 가능 |

---

## 11. 다음 단계

자율 모드: writing-plans 생략하고 단일 E2E 스크립트 + 실행 + DOD 기록으로 직행 (α/β와 달리 순수 검증 작업이라 플랜 오버헤드 불필요 — ADR-006에 해당 판단 기록).
