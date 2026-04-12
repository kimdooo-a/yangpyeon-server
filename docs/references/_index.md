# 기술 레퍼런스 색인

> 상위: [CLAUDE.md](../../CLAUDE.md) → **여기**
> 최종 수정: 세션 14 (2026-04-12)

---

## 문서 목록

| 파일 | 내용 | 최종 갱신 |
|------|------|-----------|
| _TEMPLATE_REFERENCE.md | 레퍼런스 작성 템플릿 | 초기 생성 |
| _NAVIGATION_MAP.md | 페이지 라우트 맵, 진입점/이동 대상, 연결성 검증 | 초기 생성 |
| _SUPABASE_TECH_MAP.md | Supabase 13개 모듈 → OSS/표준 기술(GitHub/docs/자체구현) 매핑 | 세션 14 |
| _PROJECT_VS_SUPABASE_GAP.md | 현 프로젝트 vs Supabase 갭 분석 + P0/P1/P2 우선순위 + DAG | 세션 14 |
| supabase-scrape/ | Supabase 대시보드 스크랩 원본 14개 (index + 00~13) | 세션 14 |

## 일반적인 레퍼런스 유형

프로젝트에 따라 아래 유형의 레퍼런스를 생성합니다:

| 유형 | 파일명 예시 | 설명 |
|------|-------------|------|
| DB 스키마 | `_SCHEMA_REFERENCE.md` | 테이블, 관계, 인덱스 |
| 인증 시스템 | `_AUTH_REFERENCE.md` | 인증/인가 흐름, 세션 관리 |
| API | `_API_REFERENCE.md` | 엔드포인트, 요청/응답 스펙 |
| 환경변수 | `_ENV_REFERENCE.md` | 환경변수 목록, 용도, 기본값 |
| 컴포넌트 맵 | `_COMPONENT_MAP.md` | UI 컴포넌트 구조, 의존성 |
| 네비게이션 맵 | `_NAVIGATION_MAP.md` | 페이지 라우트, 진입점, 연결 관계 |
| 서버 인프라 | `_SERVER_INFRA.md` | 서버 구성, 배포, 네트워크 |
| 레거시 시스템 | `_LEGACY_SYSTEM.md` | 기존 시스템 연동 정보 |

## 갱신 규칙

- 코드 변경 시 관련 레퍼런스도 **함께 갱신**
- 문서 상단에 `최종 수정: 세션 N` 표기
- 새 레퍼런스 생성 시 `_TEMPLATE_REFERENCE.md` 복사하여 사용
- 이 색인 테이블에 반드시 등록

---
[← CLAUDE.md](../../CLAUDE.md)
