# 인수인계서 — 세션 7 (파일박스 v1→v2: DB 기반 폴더 관리 + 회원 통합)

> 작성일: 2026-04-06
> 이전 세션: [session6](./260406-session6-spike-zod.md)

---

## 작업 요약

파일박스를 플랫 파일 리스트(JSON 메타데이터)에서 **PostgreSQL 기반 폴더 계층 구조 + 회원별 격리**로 전면 재설계·구현했다. v1 구현→배포→사용자 피드백→v2 재설계→구현→빌드 검증까지 완료.

## 대화 다이제스트

### 토픽 1: 파일박스 v1 설계 및 구현
> **사용자**: "파일박스 구현 관련 연구 진행해줘.... 파일 업로드 다운로드 전용 페이지 도"

Plan 모드로 진입하여 프로젝트 탐색 → 스토리지 방식 비교(로컬/Supabase/하이브리드) → 로컬 파일시스템 + JSON 메타데이터 하이브리드 방식 선택. 7개 신규 파일 + 5개 수정으로 v1 구현 완료.

**결론**: 로컬 파일시스템 + JSON 메타데이터, 플랫 파일 리스트, 인메모리 mutex 동시 쓰기 보호

### 토픽 2: v1 배포 및 Prisma 빌드 이슈 해결
> **사용자**: "배포 해줘."

배포 과정에서 3가지 기존 이슈 발견·수정:
1. **Prisma 7 import 경로**: `@/generated/prisma` → `@/generated/prisma/client` (index.ts 미생성)
2. **Zod 4 API 변경**: `.error.errors[0]` → `.error.issues[0]`
3. **Prisma 7 adapter 필수화**: `new PrismaClient()` → `new PrismaClient({ adapter })` + `@prisma/adapter-pg` 설치
4. **DATABASE_URL 빌드 시 미설정**: Proxy 패턴으로 lazy 초기화

**결론**: 모든 이슈 수정 후 빌드 성공, WSL2 배포 완료

### 토픽 3: 폴더 관리 기능 요구 및 v2 재설계
> **사용자**: "파일 박스 인데... 고유계정에 부여된 폴더안에 다시 폴더를 생성하거나하는 기본적인 관리 개념은??"
> **사용자**: "다른 터미널에서 이렇게 구현중이야. 이것을 고려해서 설계해줘...회원관리 백엔드 시스템 구현 완료"

다른 터미널의 회원관리 시스템(Prisma + PostgreSQL + v1 API, Role 기반 RBAC) 전체 구조 조사 후, 파일박스 v2를 재설계:
- JSON → PostgreSQL(Prisma) 메타데이터
- 플랫 → 폴더 트리(parentId 자기참조)
- 단일 사용자 → 회원별 격리(ownerId)
- `/api/filebox` → `/api/v1/filebox/` (withAuth 인증)

**결론**: Plan 승인 후 v2 구현 진행

### 토픽 4: 파일박스 v2 구현
Prisma 스키마(Folder + File 모델) → 마이그레이션 → 코어 로직(filebox-db.ts) → API 6개 → UI 5개 컴포넌트 순서로 구현. 기존 v1 코드 제거. 빌드 성공 확인.

**결론**: 30개 라우트 빌드 통과, v1 filebox API 라우트 모두 정상 등록

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | v1 스토리지: 로컬+JSON | Supabase Storage, 로컬, 하이브리드 | 외부 의존성 최소화, WSL2 로컬 환경 |
| 2 | v2 전환: JSON→PostgreSQL | JSON 유지+폴더 추가, DB 전환 | 트리 탐색/검색 효율, 트랜잭션 안전성, 회원 통합 |
| 3 | 폴더 모델: 자기참조 트리 | 경로 문자열, 중첩 집합, adjacency list | Prisma self-relation 지원, 직관적 CRUD |
| 4 | 인증: withAuth (듀얼) | v1 전용, 대시보드 전용 | 기존 가드 재사용, 두 인증 방식 자동 지원 |
| 5 | Prisma lazy 초기화 | 환경변수 필수, try-catch, Proxy | 빌드 시 DATABASE_URL 없어도 통과 |

## 수정 파일 (24개)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `prisma/schema.prisma` | Folder, File 모델 + User relation 추가 |
| 2 | `src/lib/filebox-db.ts` | DB 기반 코어 로직 (신규, filebox.ts 대체) |
| 3 | `src/lib/schemas/filebox.ts` | 파일박스 Zod 스키마 (신규) |
| 4 | `src/app/api/v1/filebox/folders/route.ts` | 폴더 목록+생성 API (신규) |
| 5 | `src/app/api/v1/filebox/folders/[id]/route.ts` | 폴더 이름변경+삭제 API (신규) |
| 6 | `src/app/api/v1/filebox/files/route.ts` | 파일 업로드 API (신규) |
| 7 | `src/app/api/v1/filebox/files/[id]/route.ts` | 파일 다운로드+삭제 API (신규) |
| 8 | `src/app/api/v1/filebox/usage/route.ts` | 사용량 조회 API (신규) |
| 9 | `src/app/filebox/page.tsx` | 폴더 탐색 UI 전면 재작성 |
| 10 | `src/components/filebox/breadcrumb.tsx` | 브레드크럼 (신규) |
| 11 | `src/components/filebox/folder-list.tsx` | 폴더 목록 (신규) |
| 12 | `src/components/filebox/new-folder-dialog.tsx` | 새 폴더 모달 (신규) |
| 13 | `src/components/filebox/file-upload-zone.tsx` | folderId 파라미터 추가 |
| 14 | `src/components/filebox/file-list.tsx` | DB 구조 적응 |
| 15 | `src/components/filebox/file-type-icon.tsx` | 유지 |
| 16 | `src/components/ui/icons.tsx` | IconFolder, IconNewFolder 추가 |
| 17 | `src/components/layout/sidebar.tsx` | 파일박스 네비게이션 추가 |
| 18 | `src/lib/prisma.ts` | Prisma 7 adapter + lazy Proxy 초기화 |
| 19 | `src/lib/rate-limit.ts` | fileUpload Rate Limit 추가 |
| 20 | `src/middleware.ts` | filebox Rate Limit + 감사 로그 세분화 |
| 21 | `src/lib/schemas.ts` | 기존 filebox 스키마 제거 (filebox.ts로 이동) |
| 22 | `.env.example` | FILEBOX_* 환경변수 문서화 |
| 23 | 기존 Prisma import 수정 | api-guard, jwt-v1, schemas/member, members/route (4파일) |
| 24 | 기존 Zod .errors→.issues | v1 auth login/register/me/password, members (5파일) |

## 검증 결과
- `npx next build` — 성공 (30 라우트)
- `npx prisma migrate dev --name add-filebox` — 성공
- WSL2 배포 (`/ypserver`) — 성공 (PM2 online, HTTP 307)

## 터치하지 않은 영역
- 대시보드 메인 페이지, 프로세스 관리, 로그 뷰어, 네트워크 페이지
- Cloudflare Tunnel 설정
- 기존 v1 auth/members API

## 알려진 이슈
- ADMIN 전용 API (유저별 폴더 탐색) 미구현 — 추후 필요 시 추가
- 파일 이동(폴더 간) 미구현
- 파일 미리보기(이미지 썸네일 등) 미구현
- middleware.ts → proxy.ts 마이그레이션 미수행 (동작 문제 없음)

## 다음 작업 제안
- 파일박스 실사용 테스트 (회원 가입 후 파일 업로드/폴더 생성)
- ADMIN 관리 뷰 (`/filebox?userId=xxx`)
- 파일 이동 기능
- Phase 11b: Sonner 토스트 (마스터 계획서 순서)

---
[← handover/_index.md](./_index.md)
