# 기술 검증 스파이크 사양

> Wave 4+5 리서치 문서 07  
> 작성일: 2026-04-06  
> 목적: Phase 11-15 구현 전, 기술적 불확실성이 높은 항목을 사전 검증한다. 각 스파이크는 최소 비용으로 "동작 가능/불가능"을 확인하는 실험이다.

---

## 0. 스파이크 개요

### 스파이크란?

스파이크(Spike)는 불확실성을 줄이기 위해 실제 구현 전에 수행하는 시간 제한(time-boxed) 기술 실험이다. 결과물은 프로덕션 코드가 아닌 "동작 여부 확인"이다.

### 이 프로젝트의 스파이크 원칙

```
1. 시간 제한 준수: 각 스파이크는 명시된 시간을 초과하지 않는다
2. 최소 코드: 검증에 필요한 최소한만 작성한다 (프로덕션 품질 불필요)
3. 결과 기록: 성공/실패 여부와 발견 사항을 템플릿에 기록한다
4. 대안 준비: 실패 시 즉시 전환할 대안을 명시한다
5. 격리 실행: 스파이크 코드는 `spike/` 디렉토리에 분리, 완료 후 삭제
```

### 스파이크 실행 순서 (의존성 기반)

```
SPIKE-01 (SQLite+Drizzle)
    │
    └─→ Phase 11d 진행 가능 판단
    
SPIKE-04 (shadcn 호환)  ← Phase 11b와 병렬 실행 가능
    │
    └─→ Phase 15c 진행 가능 판단

SPIKE-02 (SSE)          ← SPIKE-01 완료 후 (DB 스키마 필요)
    │
    └─→ Phase 12b 진행 가능 판단

SPIKE-03 (Monaco)       ← SPIKE-02 완료 후
    │
    └─→ Phase 14c 진행 가능 판단

SPIKE-05 (파일 업로드)  ← SPIKE-03 완료 후
    │
    └─→ Phase 15a 파일 업로드 방식 결정

실행 순서: SPIKE-01 → SPIKE-04 → SPIKE-02 → SPIKE-03 → SPIKE-05
병렬 가능: SPIKE-01 + SPIKE-04 동시 실행 (독립적)
```

### 전체 스파이크 일정

| 스파이크 | 제목 | 예상 시간 | 의존성 | 검증 Phase |
|----------|------|----------|--------|-----------|
| SPIKE-01 | SQLite + Drizzle + Next.js 통합 | 2시간 | 없음 | Phase 11d |
| SPIKE-02 | SSE + Next.js Route Handler | 1시간 | SPIKE-01 | Phase 12b |
| SPIKE-03 | Monaco Editor 번들 크기 | 1시간 | 없음 | Phase 14c |
| SPIKE-04 | shadcn/ui 기존 테마 호환 | 1시간 | 없음 | Phase 15c |
| SPIKE-05 | 파일 업로드 + Cloudflare Tunnel | 30분 | SPIKE-02 | Phase 15a |

**총 예상 시간**: 5.5시간 (Phase 11 시작 전 집중 실행)

---

## SPIKE-01: SQLite + Drizzle + Next.js 통합

### 기본 정보

| 항목 | 값 |
|------|-----|
| 스파이크 ID | SPIKE-01 |
| 유형 | 마이크로 스파이크 |
| 예상 시간 | 2시간 |
| 선행 조건 | 없음 |
| 검증 대상 Phase | Phase 11d (SQLite + Drizzle 도입) |
| 격리 디렉토리 | `spike/sqlite-drizzle/` |

---

### 검증 목표

**핵심 질문**: Next.js 16 App Router 환경에서 better-sqlite3 + Drizzle ORM이 정상 작동하는가?

Next.js의 특수한 빌드 환경(webpack, edge runtime 고려, RSC/Client Component 경계)이 C++ 네이티브 모듈(better-sqlite3)과 충돌할 가능성이 있다. 또한 WSL2 + PM2 환경에서의 파일 락킹과 동시 접근 특성을 확인해야 한다.

---

### 검증 항목

#### 1. Native Module 빌드 문제 (가장 중요)

```
검증 내용: better-sqlite3는 C++ 네이티브 모듈이다.
Next.js webpack이 이를 번들링하려다 실패할 수 있다.

확인 방법:
1. npm install better-sqlite3 drizzle-orm drizzle-kit 실행
2. 기본 next.config.ts로 npm run build 시도
3. webpack externals 설정 없이 빌드 성공 여부 확인

예상 오류 패턴:
- "Module not found: Can't resolve 'better-sqlite3'"
- "Module parse failed: Unexpected character '\\x00'"
- "can't open file" 관련 NAPI 오류

해결 방법 (예상):
// next.config.ts
const nextConfig = {
  webpack: (config) => {
    config.externals.push({
      'better-sqlite3': 'commonjs better-sqlite3',
    })
    return config
  },
}
```

#### 2. API Route Handler에서 동기 SQLite 접근

```
검증 내용: better-sqlite3는 동기 API이다.
Next.js Route Handler는 async function이다.
동기 DB 호출이 이벤트 루프를 블로킹하지 않는지, 또는
Drizzle의 추상화가 async처럼 작동하는지 확인.

테스트 코드:
// spike/sqlite-drizzle/api/test-db/route.ts
import { getDb } from '../lib/db'
import { users } from '../lib/schema'

export async function GET() {
  const db = getDb()
  // better-sqlite3는 동기이지만 Drizzle 쿼리는 await 가능
  const result = await db.select().from(users).limit(1)
  return Response.json({ ok: true, count: result.length })
}

확인 사항:
- await db.select()... 구문이 TypeScript 오류 없이 컴파일되는가
- 실제 쿼리 실행이 정상적으로 결과 반환하는가
- 연속 요청 시 응답 시간이 허용 범위 내인가 (< 10ms)
```

#### 3. PM2 클러스터 모드 동시 접근

```
검증 내용: PM2 cluster 모드에서 여러 워커가 같은 SQLite 파일에 동시 접근.
SQLite는 기본적으로 단일 쓰기 락이므로 클러스터 모드에서 충돌 가능.

테스트 시나리오:
1. PM2 cluster 모드로 Next.js 실행 (instances: 2)
2. 동시에 2개 요청으로 동일 테이블에 INSERT 수행
3. 데이터 손실 또는 SQLITE_BUSY 오류 발생 여부 확인

WAL 모드 효과 확인:
// sqlite.pragma('journal_mode = WAL')
WAL 모드: 읽기는 완전 동시, 쓰기는 직렬화 (BUSY 오류 최소화)

허용 기준:
- SQLITE_BUSY 오류 발생률 < 0.1% (100req 중 0건)
- WAL 모드에서 읽기 성능 저하 없음
```

#### 4. WSL2 파일 락킹

```
검증 내용: WSL2 환경에서 SQLite 파일이 Windows NTFS 볼륨에 있을 때
(예: /mnt/e/...) 파일 락킹이 정상 동작하는가.

주의: WSL2에서 /mnt/ 경로는 Windows 파일시스템 (NTFS).
SQLite 파일 락킹은 POSIX 락이 필요한데, NTFS에서는 불완전할 수 있음.

권장 해결책:
- SQLite 파일을 WSL2 네이티브 경로에 저장 (예: ~/data/)
- 환경변수로 경로 주입: DB_PATH=/home/user/dashboard/data/dashboard.db

테스트:
1. DB_PATH를 /mnt/e/ 경로로 설정 → 오류 재현
2. DB_PATH를 ~/data/ 경로로 설정 → 정상 동작 확인
```

#### 5. Drizzle Kit migrate 동작

```
검증 내용: 마이그레이션 자동화가 Next.js 프로젝트에서 정상 동작하는가.

테스트:
1. drizzle.config.ts 작성
2. npm run db:generate → 마이그레이션 SQL 파일 생성 확인
3. npm run db:migrate → 실제 테이블 생성 확인
4. 스키마 변경 후 재실행 → ALTER TABLE 자동 생성 확인
```

---

### 성공 기준

```
모든 항목 충족 시 SPIKE-01 성공 → Phase 11d 진행 가능

✅ npm run build 성공 (webpack externals 설정 포함)
✅ GET /api/test-db → {"ok": true, "count": 0} 응답
✅ INSERT → SELECT 왕복 쿼리 < 10ms
✅ WAL 모드에서 PM2 클러스터 2 워커 동시 읽기 오류 없음
✅ npm run db:generate + db:migrate → 테이블 생성 성공
✅ DB_PATH를 WSL2 네이티브 경로로 설정 시 정상 동작
```

---

### 실패 시 대안

#### 대안 A: sql.js (WASM 기반)

```
특징:
- 네이티브 모듈 없음 (순수 WASM)
- 빌드 문제 완전 해소
- 성능: better-sqlite3 대비 약 2-5배 느림 (대시보드 수준에서는 무관)
- 파일 저장: 직접 관리 필요 (Buffer → fs.writeFile)

마이그레이션 비용: 낮음 (Drizzle이 sql.js 어댑터 지원)

// drizzle.config.ts 변경
dialect: 'sqlite' (동일)
driver: 'better-sqlite3' → 'sql.js'
```

#### 대안 B: Turso (libsql)

```
특징:
- better-sqlite3의 libsql 포크 (Turso에서 만든 SQLite 호환)
- WASM과 네이티브 모두 지원
- Drizzle이 공식 지원
- WSL2 파일 락킹 문제 없음 (네이티브 Linux)

마이그레이션 비용: 낮음
npm install @libsql/client drizzle-orm
```

#### 대안 C: lowdb (JSON 파일 기반)

```
특징:
- JS 순수 라이브러리 (빌드 문제 없음)
- JSON 파일로 데이터 저장
- 쿼리 기능 없음 (JS 배열 조작)
- SQLite 대비 기능 제한

적용 범위: 감사 로그 + IP 화이트리스트만 (메트릭 히스토리는 너무 느림)
마이그레이션 비용: 높음 (Drizzle 사용 불가)
```

**추천 대안 순서**: 대안 B (libsql) → 대안 A (sql.js) → 대안 C (lowdb)

---

### 스파이크 실행 체크리스트

```
실행 전:
□ spike/ 디렉토리 생성
□ 별도 git branch 생성 (spike/sqlite-drizzle)

실행 중:
□ better-sqlite3 설치 + 빌드 확인
□ next.config.ts webpack externals 추가
□ 최소 스키마 (users 테이블 1개) 작성
□ 최소 API Route 작성 (/api/test-db)
□ npm run build 성공 확인
□ PM2 cluster 2워커로 실행 + 동시 요청 테스트
□ WSL2 경로 문제 확인

완료 후:
□ 결과 기록 (아래 결과 기록 템플릿)
□ spike/ 디렉토리 삭제 또는 보관
□ Phase 11d 진행 여부 결정
```

---

## SPIKE-02: SSE + Next.js Route Handler

### 기본 정보

| 항목 | 값 |
|------|-----|
| 스파이크 ID | SPIKE-02 |
| 유형 | 마이크로 스파이크 |
| 예상 시간 | 1시간 |
| 선행 조건 | SPIKE-01 완료 |
| 검증 대상 Phase | Phase 12b (SSE 실시간 스트리밍) |
| 격리 디렉토리 | `spike/sse/` |

---

### 검증 목표

**핵심 질문**: Next.js 16 App Router Route Handler에서 SSE 스트림이 Cloudflare Tunnel을 통과하여 브라우저까지 정상 전달되는가?

Cloudflare는 기본적으로 HTTP 응답을 버퍼링한다. SSE는 청크 단위로 스트리밍되어야 하므로, Cloudflare의 버퍼링 설정 또는 헤더 조정이 필요할 수 있다.

---

### 검증 항목

#### 1. Next.js App Router SSE 기본 동작

```
검증 내용: ReadableStream 기반 SSE 응답이 브라우저에서 수신되는가.

테스트 코드:
// spike/sse/api/test-sse/route.ts
export async function GET() {
  const encoder = new TextEncoder()
  let counter = 0

  const stream = new ReadableStream({
    start(controller) {
      const interval = setInterval(() => {
        counter++
        const data = JSON.stringify({ counter, time: new Date().toISOString() })
        controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        if (counter >= 10) {
          clearInterval(interval)
          controller.close()
        }
      }, 1000)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

확인 사항:
- 브라우저 DevTools Network 탭에서 EventStream 타입으로 표시되는가
- 1초마다 이벤트 수신되는가
- 연결 유지 중 메모리 누수 없는가
```

#### 2. Cloudflare Tunnel 버퍼링 문제

```
검증 내용: Cloudflare는 기본적으로 응답을 버퍼링할 수 있다.
SSE는 즉시 청크 전송이 필요하므로 버퍼링 비활성화가 필요.

테스트 방법:
1. localhost:3000에서 직접 SSE 접근 → 정상 동작 확인 (기준선)
2. stylelucky4u.com (Cloudflare Tunnel 경유)에서 SSE 접근 → 비교

버퍼링 비활성화 헤더:
'X-Accel-Buffering': 'no'  // Nginx/Cloudflare에 버퍼링 비활성화 신호

Cloudflare 무료 플랜의 SSE 제한:
- 응답 크기 제한: 없음 (스트리밍)
- 연결 시간 제한: ~100초 (무료 플랜)
  → 클라이언트에서 100초마다 재연결 필요
```

#### 3. PM2 재시작 시 SSE 연결 복구

```
검증 내용: PM2로 Next.js 프로세스 재시작 시, 기존 SSE 연결이 끊기고
클라이언트가 자동으로 재연결하는가.

테스트 시나리오:
1. 브라우저에서 SSE 연결 유지
2. PM2 restart dashboard 실행
3. 브라우저에서 이벤트 수신 중단 확인
4. EventSource 자동 재연결 대기 (브라우저 기본: 3초)
5. 재연결 성공 + 이벤트 재수신 확인

EventSource 자동 재연결:
- 브라우저 내장 기능 (명시적 구현 불필요)
- onerror 이벤트 후 3초 대기 후 자동 재연결
- 재연결 간격 제어: 서버에서 retry: 5000\n\n 응답
```

#### 4. 동시 접속 수 영향

```
검증 내용: SSE 연결이 서버 메모리에 미치는 영향 확인.
(1인 운영 환경이므로 동시 접속 수는 적으나, 다중 탭/브라우저 고려)

테스트:
1. 5개 탭에서 동시 SSE 연결
2. PM2 show dashboard로 메모리 사용량 비교 (연결 전/후)
3. 메모리 증가량이 탭당 < 1MB 인지 확인

예상: ReadableStream은 GC 가능하므로 메모리 안정적
위험: 연결 종료 시 clearInterval이 호출되지 않으면 메모리 누수
```

---

### 성공 기준

```
✅ localhost에서 EventSource로 1초 간격 이벤트 수신 성공
✅ stylelucky4u.com 경유에서도 동일 동작 확인
✅ PM2 재시작 후 5초 이내 자동 재연결 성공
✅ 5개 탭 동시 연결 시 메모리 증가 < 5MB
✅ 10분 이상 연결 유지 중 이벤트 누락 없음
```

---

### 실패 시 대안

#### 대안 A: 폴링 유지 (간격 단축)

```
현재: 5초 폴링
대안: 2초 폴링 (서버 부하 허용 범위 내)

구현 비용: 없음 (현재 코드 유지)
단점: 2초 지연 + 불필요한 요청
적용 조건: Cloudflare Tunnel 버퍼링 문제 해결 불가 시
```

#### 대안 B: WebSocket

```
특징:
- 양방향 통신 (SSE보다 기능 많음)
- Next.js App Router에서 직접 지원 안 함 (별도 WebSocket 서버 필요)
- PM2와 함께 Socket.io 또는 ws 패키지 필요

구현 비용: 높음 (별도 서버 프로세스 관리)
적용 조건: SSE로 불가능한 기능 필요 시 (현재 필요 없음)
```

#### 대안 C: Long Polling

```
특징:
- HTTP 연결을 30초간 유지 후 응답
- SSE보다 구현 단순
- Cloudflare 버퍼링 문제 없음
- 응답 지연 최대 30초

구현 비용: 낮음
```

---

### 스파이크 실행 체크리스트

```
실행 전:
□ spike/sse/ 디렉토리 생성
□ Next.js dev 서버 실행

실행 중:
□ 최소 SSE route 작성
□ 브라우저 DevTools → Network → EventStream 타입 확인
□ X-Accel-Buffering: no 헤더 추가 후 Cloudflare 경유 테스트
□ PM2 재시작 + 자동 재연결 확인
□ 5탭 동시 연결 메모리 측정

완료 후:
□ 결과 기록
□ Phase 12b 진행 여부 결정
```

---

## SPIKE-03: Monaco Editor 번들 크기

### 기본 정보

| 항목 | 값 |
|------|-----|
| 스파이크 ID | SPIKE-03 |
| 유형 | 마이크로 스파이크 |
| 예상 시간 | 1시간 |
| 선행 조건 | 없음 (독립적) |
| 검증 대상 Phase | Phase 14c (SQL Editor) |
| 격리 디렉토리 | `spike/monaco/` |

---

### 검증 목표

**핵심 질문**: Monaco Editor (@monaco-editor/react)가 Next.js 빌드 크기를 과도하게 증가시키지 않는가? 코드 분할(dynamic import)로 메인 번들 영향 없이 SQL Editor 페이지에만 로드 가능한가?

---

### 검증 항목

#### 1. 기본 번들 크기 측정

```
측정 방법:
1. 현재 빌드 크기 측정 (기준선)
   npm run build && npx next-bundle-analyzer

2. @monaco-editor/react 설치
   npm install @monaco-editor/react

3. dynamic import로 Monaco 사용하는 페이지 추가
   // spike/monaco/app/sql/page.tsx
   const MonacoEditor = dynamic(
     () => import('@monaco-editor/react'),
     { ssr: false }
   )

4. 빌드 후 크기 재측정 비교

허용 기준:
- 메인 번들 (layout, _app) 크기 변화: < 10KB
- SQL Editor 페이지 청크 크기 증가: < 500KB gzip
- 전체 빌드 크기 증가: < 3MB uncompressed
```

#### 2. SQL 언어만 로드 (선택적 로딩)

```
검증 내용: Monaco는 수십 개 언어를 기본으로 포함한다.
SQL Editor에는 SQL 언어만 필요. 나머지 언어 제거 가능한가?

최소 로딩 설정:
import * as monaco from 'monaco-editor'
// 기본 번들 대신 최소 번들 사용
import 'monaco-editor/esm/vs/language/...'  // SQL만

대안: MonacoEnvironment webpack 플러그인으로 언어 트리 쉐이킹
```

#### 3. Next.js App Router SSR 비호환 처리

```
검증 내용: Monaco는 브라우저 전용 (window 객체 필요).
SSR(서버사이드 렌더링) 시 오류 발생 가능.

처리 방법:
const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then(mod => mod.Editor),
  {
    ssr: false,  // 서버에서 렌더링 건너뜀
    loading: () => <div className="animate-pulse h-64 bg-surface-2 rounded" />
  }
)

확인 사항:
- ssr: false 설정 시 Hydration 오류 없음
- 초기 로딩 시 스켈레톤 플레이스홀더 표시
- 에디터 로드 완료 후 정상 입력 가능
```

#### 4. SQL 언어 자동완성 + 구문 강조

```
검증 내용: Monaco에서 SQL 키워드 자동완성과 구문 강조가 기본 제공되는가.
추가 설정 없이 SQL 편집 경험이 충분한가.

테스트:
1. language="sql" 설정으로 Monaco 렌더링
2. SELECT, FROM, WHERE 등 입력 시 자동완성 확인
3. 키워드 색상 강조 확인
4. 오류 하이라이팅 (기본 제공 여부 확인)
```

#### 5. 초기 로딩 시간

```
측정 방법:
1. /sql 페이지 첫 방문 시 Monaco 로드 시간 측정
2. 브라우저 DevTools Performance 탭 활용

허용 기준:
- Monaco 에디터 인터랙티브까지: < 3초 (일반 인터넷)
- localhost에서: < 1초
```

---

### 성공 기준

```
✅ 메인 번들 크기 증가 없음 (dynamic import 적용)
✅ SQL Editor 페이지 청크 크기 증가 < 500KB gzip
✅ SQL 언어 구문 강조 + 키워드 자동완성 동작
✅ SSR 오류 없음 (ssr: false)
✅ 초기 로딩 < 3초
✅ Ctrl+Enter 단축키 커스터마이징 가능
```

---

### 실패 시 대안

#### 대안 A: CodeMirror 6

```
특징:
- 번들 크기: ~50KB gzip (Monaco ~500KB 대비 10배 작음)
- React 통합: @uiw/react-codemirror
- SQL 지원: @codemirror/lang-sql
- 자동완성: @codemirror/autocomplete
- 모바일 지원 우수

단점:
- Monaco 대비 자동완성 기능 제한
- VSCode 친숙도 없음

설치:
npm install @uiw/react-codemirror @codemirror/lang-sql
```

#### 대안 B: react-simple-code-editor + Prism

```
특징:
- 번들 크기: ~5KB
- 기본 구문 강조 (Prism 기반)
- 자동완성 없음
- 최소 구현

적용 조건: 구문 강조만 필요하고 자동완성 불필요 시
```

---

## SPIKE-04: shadcn/ui 기존 테마 호환

### 기본 정보

| 항목 | 값 |
|------|-----|
| 스파이크 ID | SPIKE-04 |
| 유형 | 마이크로 스파이크 |
| 예상 시간 | 1시간 |
| 선행 조건 | 없음 (독립적) |
| 검증 대상 Phase | Phase 11b (sonner), Phase 13c (cmdk), Phase 15c (전면 전환) |
| 격리 디렉토리 | `spike/shadcn-compat/` |

---

### 검증 목표

**핵심 질문**: 현재 Tailwind CSS 기반 다크 테마 + 커스텀 색상 변수와 shadcn/ui가 충돌 없이 공존할 수 있는가?

현재 대시보드는 커스텀 색상 팔레트(brand, surface 등)를 사용한다. shadcn/ui는 CSS 변수 기반 색상 시스템(--primary, --secondary 등)을 사용한다. 두 시스템이 충돌하지 않고 공존 가능한지 확인이 필요하다.

---

### 검증 항목

#### 1. Tailwind CSS 4 + shadcn/ui 호환성

```
확인 배경: Tailwind CSS 4는 CSS-first 설정 방식으로 변경되었다.
shadcn/ui는 tailwind.config.ts 기반 설정을 전제로 설계되었다.

확인 사항:
- shadcn/ui CLI (npx shadcn@latest init)가 Tailwind CSS 4 프로젝트에서 정상 동작하는가
- globals.css에 shadcn CSS 변수가 정상 주입되는가
- Tailwind CSS 4의 새 @theme 지시어와 shadcn 변수 충돌 없는가

테스트:
npx shadcn@latest init
→ 설정 파일 변경 내용 확인
→ 기존 커스텀 색상 덮어쓰기 여부 확인
```

#### 2. 기존 커스텀 색상과 shadcn 색상 변수 공존

```
현재 프로젝트 색상 구조 (예상):
// tailwind.config.ts 또는 globals.css
:root {
  --color-brand-500: ...;
  --color-surface-1: ...;
  --color-surface-2: ...;
}

shadcn 요구 색상 변수:
:root {
  --background: ...;
  --foreground: ...;
  --primary: ...;
  --secondary: ...;
  --muted: ...;
  ...
}

테스트:
1. shadcn init 후 두 색상 시스템이 동시 존재하는지 확인
2. 충돌 있으면 네임스페이스 분리 방법 탐색
   예: --ds-background (대시보드) vs --background (shadcn)
```

#### 3. 기존 컴포넌트와 shadcn 컴포넌트 혼용

```
테스트 시나리오:
1. 기존 커스텀 Button 컴포넌트 옆에 shadcn Button 렌더링
2. 시각적 일관성 확인 (색상, 폰트, 크기)
3. 충돌하는 CSS 클래스 없는지 확인

테스트 컴포넌트 3개 (가장 대표적):
- Button: 가장 많이 사용, 충돌 가능성 높음
- Dialog: 모달 로직 변경
- Table: TanStack Table과 결합 패턴
```

#### 4. 다크 테마 CSS 변수 동작

```
shadcn 다크 테마 방식:
.dark { --background: ...; --foreground: ...; }

현재 프로젝트 다크 테마 방식:
html[class="dark"] { ... } 또는 항상 다크 테마

확인 사항:
- shadcn 컴포넌트가 현재 다크 테마 설정에서 올바른 색상 사용하는가
- 밝은 색상이 의도치 않게 표시되지 않는가
```

---

### 성공 기준

```
✅ npx shadcn@latest init이 Tailwind CSS 4 환경에서 오류 없이 실행
✅ Button 컴포넌트가 기존 다크 테마에서 올바른 색상으로 렌더링
✅ Dialog (Modal) 컴포넌트가 기존 모달 대체 가능
✅ Table + TanStack Table 조합 예제 동작
✅ 기존 커스텀 컴포넌트와 shadcn 컴포넌트 동시 렌더링 시 시각적 충돌 없음
```

---

### 실패 시 대안

#### 대안 A: shadcn 색상을 기존 변수에 매핑

```
// globals.css
:root {
  /* 기존 커스텀 변수 유지 */
  --color-surface-1: oklch(0.18 0.005 240);

  /* shadcn 변수를 기존 변수에 매핑 */
  --background: var(--color-surface-1);
  --foreground: var(--color-text-primary);
  --primary: var(--color-brand-500);
}
```

#### 대안 B: shadcn 도입 시점 조정

```
Phase 11b (sonner)와 Phase 13c (cmdk)는 shadcn 의존성 있지만
직접 구현 가능 → shadcn 전면 도입(Phase 15c)을 뒤로 미루고
컴포넌트 선별 도입
```

---

## SPIKE-05: 파일 업로드 + Cloudflare Tunnel

### 기본 정보

| 항목 | 값 |
|------|-----|
| 스파이크 ID | SPIKE-05 |
| 유형 | 마이크로 스파이크 |
| 예상 시간 | 30분 |
| 선행 조건 | SPIKE-02 (Cloudflare 환경 이해) |
| 검증 대상 Phase | Phase 15a (파일 매니저) |
| 격리 디렉토리 | `spike/file-upload/` |

---

### 검증 목표

**핵심 질문**: Cloudflare Tunnel을 경유한 파일 업로드에서 최대 허용 크기는 얼마인가? Next.js Route Handler의 기본 body 크기 제한과 Cloudflare 제한 중 어느 것이 실제 병목인가?

---

### 검증 항목

#### 1. Cloudflare 무료 플랜 업로드 제한

```
공식 제한:
- Cloudflare 무료/Pro 플랜: 최대 100MB per request
- Cloudflare Enterprise: 최대 1GB
- Cloudflare Tunnel (무료): 일반 HTTP 요청과 동일

테스트:
1. 10MB 파일 업로드 → 성공 여부 확인
2. 100MB 파일 업로드 → 413 오류 발생 여부 확인
3. 오류 시 정확한 메시지 캡처
```

#### 2. Next.js Route Handler Body 크기 제한

```
Next.js 기본 제한:
- API Route: 4MB (기본값)
- Route Handler: 설정 필요

제한 해제 방법:
// src/app/api/files/upload/route.ts
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb',
    },
  },
}

// 또는 Next.js 15+ Route Segment Config
export const maxDuration = 60
// next.config.ts
experimental: {
  serverActions: {
    bodySizeLimit: '100mb',
  },
}

테스트:
1. 기본 설정으로 10MB 업로드 → 오류 여부
2. sizeLimit 설정 후 재테스트
```

#### 3. 업로드 진행률 표시 가능 여부

```
검증 내용: 대용량 파일 업로드 시 진행률 표시가 필요한가.

옵션 A: XMLHttpRequest + onprogress (진행률 지원)
옵션 B: fetch API (진행률 미지원)
옵션 C: FormData + Server Actions (Next.js 기본 지원)

추천: XMLHttpRequest로 구현 (UX 우선)
```

---

### 성공 기준

```
✅ 10MB 파일 업로드 성공 (Cloudflare Tunnel 경유)
✅ 정확한 최대 업로드 크기 확인 (Cloudflare 제한 또는 Next.js 제한)
✅ 제한 초과 시 명확한 에러 메시지 반환 방법 확인
✅ Next.js body size limit 설정 방법 확정
```

---

### 실패 시 대안

#### 대안: 직접 업로드 URL (Presigned URL 방식)

```
적용 조건: Cloudflare가 100MB 이상 파일 업로드를 차단할 경우

방법:
1. 서버에서 파일 경로 + 임시 토큰 발급
2. 클라이언트가 내부 네트워크 직접 업로드 (Cloudflare 우회)
3. 대시보드 특성상 로컬 네트워크 접근 가능

WSL2 환경에서 구현:
- localhost:3001 포트에 별도 업로드 서버
- 또는 Next.js 서버와 동일 프로세스 (multipart 스트리밍)
```

---

## 스파이크 결과 기록 템플릿

각 스파이크 완료 후 아래 템플릿을 사용하여 `docs/platform-evolution-wave/wave-4-5/spike-results/SPIKE-XX-결과.md`에 기록한다.

```markdown
# SPIKE-XX: [제목] 결과

## 기본 정보
- 실행일: YYYY-MM-DD
- 실행자: [이름]
- 실제 소요 시간: X시간 X분 (예상: X시간)

## 결과 요약
- 상태: ✅ 성공 / ⚠️ 조건부 성공 / ❌ 실패
- 권장 대안: [성공 시 '계획대로 진행' / 실패 시 '대안 A/B/C']

## 검증 항목 결과

| 항목 | 결과 | 비고 |
|------|------|------|
| 항목 1 | ✅ 통과 | - |
| 항목 2 | ❌ 실패 | 오류 메시지: ... |
| 항목 3 | ⚠️ 조건부 | 설정 X 필요 |

## 발견 사항

### 예상과 다른 점
- [예상]: ...
- [실제]: ...

### 필요한 추가 설정
```
// 필요한 설정 코드 스니펫
```

### 성능 측정 결과
- 지표 1: X ms
- 지표 2: X KB

## 결정 사항
- [ ] Phase XX를 계획대로 진행
- [ ] 대안 [A/B/C]로 변경 → 이유: ...
- [ ] 추가 조사 필요 → 항목: ...

## Phase XX에 반영할 사항
1. ...
2. ...

## 참고 링크
- [공식 문서](...)
- [관련 이슈](...)
```

---

## 스파이크 관리 규칙

### 스파이크 코드 관리

```
스파이크 코드는 프로덕션 코드와 분리한다:

spike/
├── sqlite-drizzle/       ← SPIKE-01
├── sse/                  ← SPIKE-02
├── monaco/               ← SPIKE-03
├── shadcn-compat/        ← SPIKE-04
└── file-upload/          ← SPIKE-05

규칙:
1. spike/ 디렉토리는 .gitignore에 추가하거나 별도 브랜치 관리
2. 스파이크 완료 후 해당 디렉토리 삭제
3. 결과 기록(spike-results/)만 main 브랜치에 유지
```

### 시간 초과 처리

```
각 스파이크는 명시된 예상 시간의 150%를 초과하지 않는다:

SPIKE-01: 2h → 최대 3h
SPIKE-02: 1h → 최대 1.5h
SPIKE-03: 1h → 최대 1.5h
SPIKE-04: 1h → 최대 1.5h
SPIKE-05: 30m → 최대 45m

시간 초과 시:
1. 진행 상황 기록
2. 대안으로 즉시 전환 결정
3. 나중에 재시도할 가치가 있으면 TODO로 기록
```

### 스파이크 결과의 Phase 반영

```
스파이크 완료 후 Phase 계획 업데이트:

성공 시:
→ 해당 Phase 진행 승인
→ 스파이크에서 발견한 설정/주의사항을 Phase 구현 메모에 추가

조건부 성공 시:
→ 추가 설정 포함하여 Phase 진행
→ Phase 시작 시 주의사항 체크리스트 추가

실패 시:
→ 대안 기술로 Phase 계획 수정
→ 06-phase-roadmap.md의 해당 Phase 업데이트
```

---

## 부록: 스파이크 의존성 그래프

```
독립 실행 가능:          SPIKE-01  SPIKE-03  SPIKE-04
                              │                   │
                              ↓                   ↓
SPIKE-01 결과 후:         SPIKE-02          Phase 15c 결정
                              │
                              ↓
SPIKE-02 결과 후:         SPIKE-05
                              │
                              ↓
모든 스파이크 완료:     Phase 11-15 전체 계획 확정
```

```
최적 병렬 실행 순서:

Day 1 오전:  SPIKE-01 + SPIKE-04 동시 실행 (독립, 2시간)
Day 1 오후:  SPIKE-03 실행 (독립, 1시간)
             SPIKE-01 결과 확인 후 SPIKE-02 실행 (1시간)
Day 2 오전:  SPIKE-02 결과 확인 후 SPIKE-05 실행 (30분)
             모든 결과 종합 → Phase 11 시작 결정
```

---

> 최종 수정: 2026-04-06  
> 이전 문서: [06-phase-roadmap.md](./06-phase-roadmap.md) — 단계별 구현 로드맵  
> 다음 단계: 스파이크 실행 후 [spike-results/](./spike-results/) 디렉토리에 결과 기록
