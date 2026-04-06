# Supabase 셀프호스팅 (Self-Hosting)

> 작성일: 2026-04-06 | Wave 1 리서치 문서

---

## 목차

1. [개요](#1-개요)
2. [아키텍처 전체 맵](#2-아키텍처-전체-맵)
3. [구성요소 상세](#3-구성요소-상세)
4. [Docker Compose 배포](#4-docker-compose-배포)
5. [Kubernetes 배포](#5-kubernetes-배포)
6. [클라우드 배포 (AWS/GCP)](#6-클라우드-배포-awsgcp)
7. [설정 관리](#7-설정-관리)
8. [운영 고려사항](#8-운영-고려사항)
9. [Managed vs Self-Hosted 비교](#9-managed-vs-self-hosted-비교)

---

## 1. 개요

### Supabase 셀프호스팅이란?

Supabase는 오픈소스 프로젝트이므로, 클라우드(supabase.com)를 사용하는 대신 자신의 서버에 직접 설치하여 운영할 수 있다. 이를 **셀프호스팅(Self-Hosting)**이라 부른다.

### 셀프호스팅을 선택하는 이유

| 이유 | 설명 |
|------|------|
| **데이터 주권** | 모든 데이터가 자체 인프라 내에 존재 |
| **규정 준수** | 특정 지역 데이터 거주 요건 충족 |
| **비용 통제** | 대규모 트래픽 시 클라우드 대비 비용 절감 가능 |
| **커스터마이징** | PostgreSQL 확장 프로그램 직접 설치/관리 |
| **Air-gapped 환경** | 인터넷 격리 환경에서 운영 필요 시 |

### 셀프호스팅의 전제 조건

- Linux 서버 (Ubuntu 20.04+, Debian, CentOS 등)
- Docker Engine 20.10+ / Docker Compose v2+
- 최소 4GB RAM (권장 8GB 이상)
- 20GB 이상 디스크 여유 공간
- 도메인 및 SSL 인증서 (HTTPS 운영 시)

---

## 2. 아키텍처 전체 맵

### 서비스 의존성 그래프

```
인터넷
    │
    ▼
[Kong API Gateway] ──────────────── 포트 80/443
    │
    ├── /rest/v1/*      → [PostgREST]
    │                         │
    ├── /auth/v1/*      → [GoTrue]
    │                         │
    ├── /storage/v1/*   → [Storage API] → [imgproxy]
    │                         │
    ├── /realtime/v1/*  → [Realtime]
    │                         │
    ├── /functions/v1/* → [Edge Runtime]
    │                         │
    └── /pg/*           → [pg_meta]
                              │
                    ┌─────────▼─────────┐
                    │   PostgreSQL DB    │
                    │  (+ Extensions)    │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │    Supavisor       │
                    │  (Connection Pool) │
                    └───────────────────┘

로그 수집:
[Vector] → 모든 컨테이너 로그 수집 → [Analytics/Logflare]

관리 UI:
[Supabase Studio] → API 게이트웨이 통해 모든 서비스 접근
```

### 네트워크 포트 매핑

| 서비스 | 내부 포트 | 외부 노출 | 설명 |
|--------|----------|----------|------|
| Kong | 8000, 8443 | 80, 443 | HTTP/HTTPS API 게이트웨이 |
| PostgreSQL | 5432 | 5432 (선택) | 직접 DB 접근 시만 노출 |
| Supabase Studio | 3000 | 3000 (내부) | 관리 대시보드 |
| Analytics | 4000 | - | 내부 전용 |
| GoTrue | 9999 | - | 내부 전용 |
| PostgREST | 3000 | - | 내부 전용 |
| Realtime | 4000 | - | 내부 전용 |
| Storage | 5000 | - | 내부 전용 |

---

## 3. 구성요소 상세

### 3.1 PostgreSQL (데이터베이스)

모든 Supabase 데이터의 핵심 저장소다.

**기본 확장 프로그램 (Extensions)**:
```sql
-- 기본 활성화된 주요 확장
pgcrypto          -- 암호화 함수
pgjwt             -- JWT 생성/검증
uuid-ossp         -- UUID 생성
pg_stat_statements -- 쿼리 성능 통계
plpgsql           -- PL/pgSQL 절차적 언어
plv8              -- JavaScript 절차적 언어 (선택)
pg_net            -- 비동기 HTTP 요청
pg_graphql        -- GraphQL API 지원
pgvector          -- 벡터 임베딩 (AI/ML)
timescaledb       -- 시계열 데이터 (선택)
postgis           -- 지리공간 데이터 (선택)
```

**스키마 구조**:
```
PostgreSQL Database
├── auth          ← GoTrue가 관리 (사용자/세션)
├── storage       ← Storage API가 관리 (파일 메타데이터)
├── realtime      ← Realtime 서비스 (구독 관리)
├── supabase_functions ← Edge Functions 관련
├── public        ← 사용자 테이블 (기본 스키마)
└── extensions    ← 확장 함수들
```

### 3.2 GoTrue (인증 서비스)

Netlify에서 개발한 오픈소스 인증 API를 Supabase가 포크하여 개선한 서비스다.

**담당 기능**:
- 이메일/비밀번호 인증
- OAuth 소셜 로그인 (Google, GitHub, Kakao 등 30+)
- 매직 링크 (Passwordless)
- OTP (Phone/Email)
- JWT 토큰 발급 및 검증
- 사용자 세션 관리
- MFA (Multi-Factor Authentication)

**주요 환경변수**:
```env
GOTRUE_JWT_SECRET=your_super_secret_jwt_token
GOTRUE_JWT_EXP=3600
GOTRUE_DB_DRIVER=postgres
GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:password@db:5432/postgres?search_path=auth
GOTRUE_SITE_URL=https://yourdomain.com
GOTRUE_URI_ALLOW_LIST=https://yourdomain.com,https://app.yourdomain.com
GOTRUE_SMTP_HOST=smtp.example.com
GOTRUE_SMTP_PORT=587
GOTRUE_SMTP_USER=your_smtp_user
GOTRUE_SMTP_PASS=your_smtp_password
GOTRUE_MAILER_AUTOCONFIRM=false
```

### 3.3 PostgREST (REST API)

PostgreSQL 스키마를 읽어 자동으로 RESTful API를 생성하는 Haskell로 작성된 서비스다.

**동작 원리**:
```
HTTP 요청 → PostgREST → SQL 쿼리 변환 → PostgreSQL
                                              │
                                              ▼
                                         RLS 정책 검증
                                              │
                                              ▼
                                         결과 반환 (JSON)
```

**주요 환경변수**:
```env
PGRST_DB_URI=postgres://authenticator:password@db:5432/postgres
PGRST_DB_SCHEMA=public,graphql_public
PGRST_DB_ANON_ROLE=anon
PGRST_JWT_SECRET=your_jwt_secret
PGRST_DB_USE_LEGACY_GUCS=false
PGRST_APP_SETTINGS_JWT_SECRET=your_jwt_secret
PGRST_APP_SETTINGS_JWT_EXP=3600
```

### 3.4 Realtime (실시간 서비스)

Elixir로 작성된 WebSocket 기반 실시간 이벤트 서비스다.

**주요 기능**:
- **Broadcast**: 채널을 통한 메시지 브로드캐스트
- **Presence**: 온라인 사용자 추적
- **Postgres Changes**: DB 변경사항 실시간 구독 (INSERT/UPDATE/DELETE)

**동작 방식 (Postgres Changes)**:
```
PostgreSQL WAL (Write Ahead Log)
    │
    ▼ (wal2json)
Realtime 서비스 (Elixir)
    │
    ▼ (WebSocket)
클라이언트 구독자들
```

**주요 환경변수**:
```env
PORT=4000
DB_HOST=db
DB_PORT=5432
DB_NAME=postgres
DB_USER=supabase_admin
DB_PASSWORD=your_password
DB_SSL=false
SECRET_KEY_BASE=your_secret_key_base
JWT_SECRET=your_jwt_secret
REPLICATION_MODE=RLS
REPLICATION_POLL_INTERVAL=100
SUBSCRIPTION_SYNC_INTERVAL=60000
```

### 3.5 Storage API (스토리지)

파일 업로드/다운로드/관리를 담당하는 서비스다.

**지원 백엔드**:
- **로컬 파일시스템**: 기본 설정
- **S3 호환 스토리지**: AWS S3, MinIO, Cloudflare R2, Backblaze B2 등

**주요 환경변수**:
```env
ANON_KEY=your_anon_key
SERVICE_KEY=your_service_role_key
POSTGREST_URL=http://rest:3000
PGRST_JWT_SECRET=your_jwt_secret
DATABASE_URL=postgres://supabase_storage_admin:password@db:5432/postgres
FILE_SIZE_LIMIT=52428800  # 50MB
STORAGE_BACKEND=file      # 또는 s3
FILE_STORAGE_BACKEND_PATH=/var/lib/storage
TENANT_ID=stub
# S3 사용 시
GLOBAL_S3_BUCKET=your-bucket-name
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_DEFAULT_REGION=ap-northeast-2
```

### 3.6 imgproxy (이미지 변환)

스토리지에서 이미지를 제공할 때 리사이즈, 포맷 변환 등을 처리하는 서비스다.

```env
IMGPROXY_BIND=:5001
IMGPROXY_LOCAL_FILESYSTEM_ROOT=/
IMGPROXY_USE_ETAG=true
IMGPROXY_ENABLE_WEBP_DETECTION=true
```

### 3.7 Kong (API 게이트웨이)

모든 서비스 앞에 위치하는 API 게이트웨이로, 라우팅, JWT 검증, Rate Limiting을 담당한다.

**kong.yml 설정 예시**:
```yaml
# volumes/api/kong.yml

_format_version: "1.1"

consumers:
  - username: anon
    keyauth_credentials:
      - key: ${ANON_KEY}
  - username: service_role
    keyauth_credentials:
      - key: ${SERVICE_ROLE_KEY}

services:
  - name: auth-v1-open
    url: http://auth:9999/verify
    routes:
      - name: auth-v1-open
        strip_path: true
        paths:
          - /auth/v1/verify

  - name: rest-v1
    url: http://rest:3000/
    routes:
      - name: rest-v1-all
        strip_path: true
        paths:
          - /rest/v1/
    plugins:
      - name: cors
      - name: key-auth
        config:
          hide_credentials: false
      - name: acl
        config:
          hide_groups_header: true
          allow:
            - anon
            - service_role

  - name: realtime-v1
    url: http://realtime:4000/socket/
    routes:
      - name: realtime-v1-all
        strip_path: true
        paths:
          - /realtime/v1/
    plugins:
      - name: cors
      - name: key-auth
```

### 3.8 Supabase Studio (관리 대시보드)

Next.js로 구축된 Supabase 관리 웹 인터페이스다.

**접근 방법**:
```bash
# 기본 포트 3000에서 접근
http://your-server:3000

# 또는 Kong을 통해
http://your-domain/dashboard
```

**주요 기능**:
- 테이블 에디터 (시각적 DB 관리)
- SQL 에디터
- Auth 사용자 관리
- Storage 파일 관리
- API 문서 자동 생성
- 로그 뷰어

### 3.9 pg_meta (메타데이터 API)

PostgreSQL 메타데이터(테이블, 컬럼, 정책 등)에 대한 REST API를 제공한다. Studio가 이를 통해 DB 구조를 조회/수정한다.

### 3.10 Supavisor (커넥션 풀러)

Elixir로 작성된 클라우드-네이티브 PostgreSQL 커넥션 풀러다.

```
클라이언트 앱 (다수)
    │
    ▼
Supavisor (포트 5432 또는 6543)
    │
    ▼ (제한된 수의 연결)
PostgreSQL
```

```env
# Supavisor 설정
POOLER_PROXY_PORT=6543
POOLER_DEFAULT_POOL_SIZE=20
POOLER_MAX_CLIENT_CONN=100
```

### 3.11 Analytics/Logflare (로그 분석)

Vector가 수집한 로그를 저장하고 분석하는 서비스다.

```env
LOGFLARE_NODE_HOST=127.0.0.1
LOGFLARE_API_KEY=your_logflare_api_key
LOGFLARE_SINGLE_TENANT=true
LOGFLARE_SUPABASE_MODE=true
```

---

## 4. Docker Compose 배포

### 빠른 시작

```bash
# Supabase 공식 docker-compose.yml 다운로드
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker

# 환경변수 파일 복사 및 수정
cp .env.example .env
```

### .env 필수 설정

```env
# .env

############
# 시크릿 (반드시 변경 필요!)
############
POSTGRES_PASSWORD=your-super-secret-and-long-postgres-password
JWT_SECRET=your-super-secret-jwt-token-with-at-least-32-characters-long
ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYxMzUzMTk4NSwiZXhwIjo0NzY5MjA1OTg1fQ.Rn5pSmZeOJ-nBkxVp_7rC0z5h39kEOxz40m2hDqK5Qc
SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjEzNTMxOTg1LCJleHAiOjQ3NjkyMDU5ODV9.twj5CJcJuPW8vY7cgf1yhtY4eFuLoFEh3FTPF8FiGBw
DASHBOARD_USERNAME=supabase
DASHBOARD_PASSWORD=this_password_is_insecure_and_should_be_updated
SMTP_ADMIN_EMAIL=admin@example.com

############
# 데이터베이스 설정
############
POSTGRES_HOST=db
POSTGRES_DB=postgres
POSTGRES_PORT=5432

############
# 애플리케이션 설정
############
SITE_URL=https://yourdomain.com
ADDITIONAL_REDIRECT_URLS=
OPERATOR_TOKEN=unused

############
# API 설정
############
API_EXTERNAL_URL=https://yourdomain.com

############
# 이메일 설정 (SMTP)
############
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=587
SMTP_USER=your_smtp_user@yourdomain.com
SMTP_PASS=your_smtp_password
SMTP_SENDER_NAME=YourApp
```

### JWT 토큰 생성

```bash
# anon key 및 service_role key 생성
# https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys

# JWT payload for anon role:
# { "role": "anon", "iss": "supabase", "iat": 1613531985, "exp": 4769205985 }

# JWT payload for service_role:
# { "role": "service_role", "iss": "supabase", "iat": 1613531985, "exp": 4769205985 }

# jwt.io에서 위 payload + JWT_SECRET으로 서명하여 생성
```

### 서비스 시작

```bash
# 백그라운드로 모든 서비스 시작
docker compose up -d

# 로그 확인
docker compose logs -f

# 특정 서비스 로그
docker compose logs -f db
docker compose logs -f auth
docker compose logs -f kong

# 서비스 상태 확인
docker compose ps

# 서비스 재시작
docker compose restart auth

# 전체 중지 (데이터 보존)
docker compose down

# 완전 초기화 (데이터 삭제 - 주의!)
docker compose down -v
```

### Docker Compose 파일 커스터마이징

```yaml
# docker-compose.override.yml (오버라이드 파일)

version: '3.8'

services:
  db:
    # 커스텀 postgresql.conf 마운트
    volumes:
      - ./volumes/db/postgresql.conf:/etc/postgresql/postgresql.conf
    command: postgres -c config_file=/etc/postgresql/postgresql.conf

  kong:
    # HTTPS 인증서 마운트
    volumes:
      - ./volumes/certs:/etc/certs:ro
    environment:
      KONG_SSL_CERT: /etc/certs/fullchain.pem
      KONG_SSL_CERT_KEY: /etc/certs/privkey.pem

  storage:
    # S3 대신 로컬 스토리지 용량 제한 없이 사용
    volumes:
      - /data/supabase/storage:/var/lib/storage
```

---

## 5. Kubernetes 배포

### Helm Chart 사용

```bash
# Helm 레포지토리 추가
helm repo add supabase https://helm.supabase.com
helm repo update

# 기본 values.yaml 확인
helm show values supabase/supabase > values.yaml

# 설치
helm install supabase supabase/supabase \
  --namespace supabase \
  --create-namespace \
  --values values.yaml
```

### values.yaml 핵심 설정

```yaml
# values.yaml

global:
  jwt:
    anonKey: "your_anon_key"
    serviceKey: "your_service_role_key"
    secret: "your_jwt_secret"

db:
  enabled: true
  image:
    tag: "15.1.0.147"
  persistence:
    enabled: true
    storageClass: "standard"
    size: 50Gi
  resources:
    requests:
      memory: "2Gi"
      cpu: "1000m"
    limits:
      memory: "4Gi"
      cpu: "2000m"

auth:
  enabled: true
  environment:
    GOTRUE_SITE_URL: "https://yourdomain.com"
    GOTRUE_MAILER_AUTOCONFIRM: "true"
    GOTRUE_SMTP_HOST: "smtp.yourdomain.com"

studio:
  enabled: true
  image:
    tag: "20240101-abc1234"
  ingress:
    enabled: true
    hosts:
      - host: "supabase.yourdomain.com"
        paths:
          - path: /
    tls:
      - secretName: supabase-studio-tls
        hosts:
          - supabase.yourdomain.com

kong:
  ingress:
    enabled: true
    hosts:
      - host: "api.yourdomain.com"
    tls:
      - secretName: supabase-api-tls
        hosts:
          - api.yourdomain.com
```

### Kubernetes 네임스페이스 구조

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: supabase

---
# 시크릿 관리 (실제 운영 시 Vault나 Sealed Secrets 사용 권장)
apiVersion: v1
kind: Secret
metadata:
  name: supabase-secrets
  namespace: supabase
type: Opaque
stringData:
  postgres-password: "your_secure_password"
  jwt-secret: "your_jwt_secret"
  anon-key: "your_anon_key"
  service-role-key: "your_service_role_key"
```

---

## 6. 클라우드 배포 (AWS/GCP)

### AWS EC2 + Docker Compose 배포

```bash
# EC2 인스턴스 권장 사양
# - t3.large (2 vCPU, 8GB RAM) 최소
# - t3.xlarge (4 vCPU, 16GB RAM) 권장 (프로덕션)

# 1. EC2 인스턴스 생성 후 SSH 접속
ssh -i your-key.pem ubuntu@your-ec2-ip

# 2. Docker 설치
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu

# 3. Supabase 설정
git clone https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
# .env 파일 수정

# 4. 시작
docker compose up -d

# 5. Nginx + Certbot으로 HTTPS 설정
sudo apt install -y nginx certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### AWS RDS 연동 (외부 PostgreSQL)

```env
# .env - 외부 RDS 사용 시
DB_HOST=your-rds-endpoint.rds.amazonaws.com
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=your_rds_password
DB_SSL=require
```

### GCP Cloud Run 배포 (실험적)

```yaml
# cloud-run-service.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: supabase-auth
spec:
  template:
    spec:
      containers:
        - image: supabase/gotrue:latest
          env:
            - name: GOTRUE_DB_DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: supabase-secrets
                  key: db-url
```

---

## 7. 설정 관리

### 환경변수 보안 관리

```bash
# .env 파일은 절대 커밋하지 않음
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore

# 프로덕션에서는 시크릿 관리 도구 사용 권장:
# - AWS Secrets Manager
# - HashiCorp Vault
# - Docker Secrets
# - Kubernetes Secrets (+ Sealed Secrets)
```

### Docker Secrets 활용

```yaml
# docker-compose.yml (시크릿 방식)

version: '3.8'

secrets:
  postgres_password:
    external: true
  jwt_secret:
    external: true

services:
  db:
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
    secrets:
      - postgres_password
```

```bash
# Docker Swarm에서 시크릿 생성
echo "your_secure_password" | docker secret create postgres_password -
echo "your_jwt_secret" | docker secret create jwt_secret -
```

### SSL/TLS 인증서 설정

```nginx
# nginx.conf (Kong 앞에 Nginx를 리버스 프록시로 사용)

server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # API 요청 → Kong
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 지원 (Realtime)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Studio 대시보드
    location /dashboard {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }
}
```

---

## 8. 운영 고려사항

### 8.1 백업 전략

```bash
# PostgreSQL 전체 백업
docker exec supabase-db-1 pg_dumpall \
  -U postgres \
  > /backup/supabase_$(date +%Y%m%d_%H%M%S).sql

# 특정 데이터베이스만 백업
docker exec supabase-db-1 pg_dump \
  -U postgres \
  -Fc \
  postgres \
  > /backup/postgres_$(date +%Y%m%d_%H%M%S).dump

# 복구
docker exec -i supabase-db-1 pg_restore \
  -U postgres \
  -d postgres \
  < /backup/postgres_20240101_000000.dump

# 자동 백업 크론잡 (crontab -e)
0 2 * * * /scripts/backup-supabase.sh >> /var/log/supabase-backup.log 2>&1
```

### 8.2 모니터링 설정

```yaml
# docker-compose 모니터링 스택 추가

services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: your_grafana_password
    volumes:
      - grafana_data:/var/lib/grafana
```

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'kong'
    static_configs:
      - targets: ['kong:8001']  # Kong Admin API

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']
```

**핵심 모니터링 지표**:

| 지표 | 경고 임계값 | 심각 임계값 |
|------|------------|------------|
| DB CPU 사용률 | > 70% | > 90% |
| DB 메모리 사용률 | > 75% | > 90% |
| DB 연결 수 | > 80% 최대값 | > 95% 최대값 |
| 디스크 사용률 | > 70% | > 85% |
| API 응답 시간 | > 500ms | > 2000ms |
| API 에러율 | > 1% | > 5% |

### 8.3 업그레이드 절차

```bash
# 1. 현재 버전 확인
docker compose images

# 2. 새 버전 변경사항 확인
# https://github.com/supabase/supabase/releases

# 3. 백업 실행
./scripts/backup-supabase.sh

# 4. 이미지 업데이트 (docker-compose.yml에서 태그 변경)
# image: supabase/gotrue:v2.149.0 → v2.150.0

# 5. 무중단 롤링 업데이트
docker compose pull
docker compose up -d --no-deps auth    # auth만 재시작
docker compose up -d --no-deps rest    # rest만 재시작
# ... 서비스별로 순차 업데이트

# 6. 전체 재시작이 필요한 경우 (짧은 다운타임 허용)
docker compose down && docker compose up -d
```

### 8.4 스케일링 전략

```yaml
# 수평 스케일링 (docker-compose)
services:
  rest:
    deploy:
      replicas: 3   # PostgREST 인스턴스 3개
    # 앞에 로드 밸런서 필요

  auth:
    deploy:
      replicas: 2   # GoTrue 인스턴스 2개
```

```bash
# Docker Swarm으로 스케일링
docker service scale supabase_rest=3

# 수직 스케일링 (리소스 제한 설정)
# docker-compose.yml에 resources 추가
services:
  db:
    deploy:
      resources:
        limits:
          cpus: '4.0'
          memory: 8G
        reservations:
          cpus: '2.0'
          memory: 4G
```

### 8.5 성능 튜닝

```sql
-- postgresql.conf 주요 설정 (서버 사양에 맞게 조정)

-- 메모리 설정 (RAM의 25%)
shared_buffers = 2GB

-- 쿼리 실행 시 사용 가능한 메모리 (전체 RAM / max_connections)
work_mem = 64MB

-- VACUUM, CREATE INDEX 등에 사용할 메모리
maintenance_work_mem = 512MB

-- 디스크 캐시 추정치 (RAM의 75%)
effective_cache_size = 6GB

-- WAL 설정
wal_buffers = 64MB
min_wal_size = 1GB
max_wal_size = 4GB

-- 체크포인트 설정
checkpoint_completion_target = 0.9

-- 병렬 쿼리
max_parallel_workers_per_gather = 2
max_parallel_workers = 4

-- 커넥션 설정
max_connections = 200
```

### 8.6 로그 관리

```yaml
# docker-compose.yml 로그 설정
services:
  db:
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "10"
        compress: "true"
```

```bash
# 로그 조회
docker compose logs --since 1h auth    # 최근 1시간 auth 로그
docker compose logs -f --tail=100 db   # DB 로그 실시간 모니터링

# 로그 파일 위치 (json-file 드라이버)
# /var/lib/docker/containers/{container-id}/{container-id}-json.log
```

---

## 9. Managed vs Self-Hosted 비교

### 기능 비교표

| 기능 | Managed (supabase.com) | Self-Hosted |
|------|----------------------|-------------|
| **설치/설정** | 즉시 사용 | 직접 설정 필요 |
| **PostgreSQL** | 완전 지원 | 완전 지원 |
| **Auth (GoTrue)** | 완전 지원 | 대부분 지원 |
| **PostgREST** | 완전 지원 | 완전 지원 |
| **Realtime** | 완전 지원 | 지원 (설정 복잡) |
| **Storage** | 완전 지원 | 지원 |
| **Edge Functions** | 완전 지원 | 지원 (Deno runtime) |
| **Database Branching** | 지원 | 미지원 |
| **자동 백업** | 일일 백업 포함 | 직접 구현 필요 |
| **Point-in-Time Recovery** | Pro 플랜 이상 | 직접 구현 필요 |
| **Dashboard (Studio)** | 완전 지원 | 일부 기능 미지원* |
| **Email 템플릿 편집** | Dashboard에서 지원 | CLI/파일로만 가능 |
| **실시간 로그 뷰어** | 지원 | 제한적 지원 |
| **대시보드 분석** | 지원 | 제한적 |
| **자동 스케일링** | 지원 | 직접 구현 필요 |
| **CDN** | 포함 | 별도 설정 필요 |
| **모니터링/알림** | 기본 제공 | 직접 구현 필요 |
| **보안 패치** | 자동 | 수동 업데이트 |
| **SOC2/HIPAA** | Enterprise 플랜 | 직접 인증 필요 |
| **공식 지원** | 플랜별 지원 | 커뮤니티만 |

*Self-hosted Studio에서 일부 미지원 항목: Email Template 편집, Auth Providers 설정, 일부 Realtime 설정, Edge Function 설정 UI

### 비용 비교 시나리오

```
시나리오: MAU 10만, DB 50GB, 100GB 스토리지

Managed (Pro 플랜):
- 기본: $25/월
- 추가 MAU (10만 이상): 없음 (Pro 포함)
- 추가 DB 스토리지 42GB: $0.125/GB × 42 = $5.25/월
- 추가 스토리지: 없음 (100GB Pro 포함)
- 합계: ~$30/월

Self-Hosted (AWS EC2):
- EC2 t3.xlarge (4vCPU/16GB): ~$150/월
- EBS gp3 100GB: ~$8/월
- 데이터 전송: ~$10-50/월
- 엔지니어 운영 시간 (월 10시간): ???
- 합계: ~$170-200/월 (엔지니어 비용 제외)

결론: 소규모에서는 Managed가 총비용 더 저렴
      대규모(MAU 수백만+)에서는 Self-Hosted가 유리
```

### 어떤 경우에 셀프호스팅을 선택하나?

**셀프호스팅 적합한 경우**:
- 데이터 주권 요건 (의료/금융/정부 기관)
- 특정 국가 데이터 거주 요건 (EU GDPR 엄격 적용)
- Air-gapped 네트워크 환경
- MAU 수백만 이상의 대규모 서비스
- 특수 PostgreSQL 확장 프로그램 필요
- 기존 인프라와 통합 필요

**Managed 적합한 경우**:
- 스타트업 / 빠른 개발 속도 필요
- 운영 인력 부족
- MAU 수십만 이하
- Database Branching 워크플로우 필요
- 공식 지원 필요
- 자동 백업/모니터링 원하는 경우

---

## 참고 자료

- [Supabase Self-Hosting 공식 문서](https://supabase.com/docs/guides/self-hosting)
- [Docker Compose 배포 가이드](https://supabase.com/docs/guides/self-hosting/docker)
- [Supabase Docker GitHub](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml)
- [Kubernetes Helm Chart](https://github.com/supabase-community/supabase-kubernetes)
- [Self-hosting 커뮤니티 토론](https://github.com/orgs/supabase/discussions/39820)
- [셀프호스팅 vs Managed 분석](https://vela.simplyblock.io/articles/self-hosting-supabase/)
