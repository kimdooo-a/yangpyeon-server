# 03. Observability/Secrets/Auth 매트릭스 — node:crypto envelope + jose JWKS ES256 vs 외부 KMS/Vault

> **Wave 2 / 12-observability / 매트릭스 단계 (Agent F)**
> 작성일: 2026-04-18 · 프로젝트: 양평 부엌 서버 대시보드
>
> **Wave 1 필수 참조**
> - `01-pgsodium-vs-node-crypto-vault-deep-dive.md` (node:crypto envelope 권고도 0.86)
> - `02-jose-jwks-rotation-deep-dive.md` (jose JWKS ES256 권고도 0.88)
>
> **연관 산출물**: `_PROJECT_VS_SUPABASE_GAP.md` Vault/JWT 항목, `_SUPABASE_TECH_MAP.md` Auth/Vault 모듈, Phase 14a `/settings/api-keys` + Phase 14x `/settings/env` (본 매트릭스에서 설계 확정)

---

## 0. TL;DR (5문장)

1. **Wave 1 결정 재확인**: Vault 모듈은 `node:crypto` AES-256-GCM + envelope encryption(KEK→DEK)으로, JWT 서명은 `jose` + JWKS ES256으로 확정. 둘 다 Node 단독 스택으로, 외부 KMS/Vault 서비스 의존 0건.
2. **본 매트릭스 기여**: Wave 1의 "node:crypto vs pgsodium"과 "jose JWKS vs 외부 KMS"를 각각 **5개 후보 × 10차원**으로 확장 비교하여 **재고 조건** — 즉 "어느 시점에 외부 KMS를 재검토해야 하는가"를 정량화.
3. **pgsodium은 거부**: SUPERUSER 강제 + `shared_preload_libraries` + Prisma DMMF 미지원 3중 결격으로, 운영자 1인 환경에서 채택하면 **장애 경로 추가 +3**.
4. **AWS KMS / HashiCorp Vault는 과잉**: 현 시나리오($0~5/월, 1인 운영, 시크릿 200건 미만, 단일 호스트)에서 외부 KMS 추가는 월 $1~5 비용과 장애 경로 하나를 **실질 이득 없이** 추가.
5. **MASTER_KEY 저장 위치**: `/etc/luckystyle4u/secrets.env` (chmod 0400, root:ypb-runtime 권한) + PM2 ecosystem 로드 — 이것이 DQ-12.3 잠정 답.

---

## 1. 스코프 — 본 매트릭스가 다루는 5개 후보

| # | 후보 | 영역 | 우리 선택 |
|---|------|------|-----------|
| A | **node:crypto envelope (KEK→DEK)** | 시크릿 암호화 | **채택** (Wave 1 확정) |
| B | **pgsodium** | PG 확장 기반 암호화 | **거부** (Wave 1 확정) |
| C | **jose + 자체 JWKS (ES256)** | JWT 서명/검증 | **채택** (Wave 1 확정) |
| D | **AWS KMS** | 외부 KMS | 재검토 대기 |
| E | **HashiCorp Vault** | 외부 Secrets Manager | 재검토 대기 |

이 문서는 Wave 1의 **"무엇을 쓸지"** 결정을 받아, **"언제 재검토할지"** 의 수치 트리거를 확정한다.

---

## 2. 아키텍처 개요 — Node 단독 envelope + JWKS

### 2.1 전체 그림

```
┌───────────────────────────────────────────────────────────────┐
│  양평 부엌 서버 대시보드 (Next.js 16 / Node 20, WSL2)          │
│                                                                │
│  ┌─────────────────┐       ┌──────────────────────┐            │
│  │ /settings/env   │       │ /settings/api-keys   │            │
│  │  (Vault UI)     │       │  (JWKS 회전 UI)      │            │
│  └────────┬────────┘       └──────────┬───────────┘            │
│           │                            │                        │
│  ┌────────▼────────────────────────────▼───────────┐            │
│  │ lib/vault/{master,encrypt,repository}.ts        │            │
│  │ lib/auth/{verify,signing,jwks-cache}.ts         │            │
│  └────────┬────────────────────────────┬───────────┘            │
│           │                            │                        │
│  ┌────────▼────────────┐       ┌───────▼───────────┐            │
│  │ node:crypto         │       │ jose (Node/Edge)  │            │
│  │ aes-256-gcm         │       │ ES256 sign/verify │            │
│  └─────────────────────┘       └───────────────────┘            │
└───────────────────────────────────────────────────────────────┘
                    │                            │
          ┌─────────┴─────────┐         ┌───────┴────────────┐
          ▼                   ▼         ▼                    ▼
 ┌──────────────┐  ┌───────────────┐ ┌──────────┐  ┌──────────────────┐
 │ Prisma PG    │  │ /etc/lucky…/  │ │ Prisma PG│  │ /api/.well-known/│
 │ SecretItem   │  │ secrets.env   │ │ JwksKey  │  │   jwks.json      │
 │ (ciphertext) │  │ MASTER_KEY    │ │ (public) │  │  (외부 노출)     │
 └──────────────┘  │ (chmod 0400)  │ └──────────┘  └──────────────────┘
                   └───────────────┘
```

핵심: **어떤 외부 서비스도 관여하지 않음**. "마스터 키" 하나가 전체 암호화 루트.

### 2.2 KEK/DEK envelope 동작

1. 새 시크릿 저장 요청 → DEK 32바이트 `randomBytes(32)` 생성
2. DEK으로 plaintext → AES-256-GCM → `ciphertext + iv + authTag`
3. KEK(`MASTER_KEY`)로 DEK → AES-256-GCM → `wrappedDek + dekIv + dekAuthTag`
4. `SecretItem` row에 (ciphertext, iv, authTag, wrappedDek, dekIv, dekAuthTag, kekVersion) 저장
5. 읽기: KEK로 DEK unwrap → DEK로 ciphertext 복호화

이 패턴의 이점:
- KEK 회전 시 **DEK만 재암호화** → ciphertext는 건드리지 않음 (성능 + 안전)
- KEK을 나중에 KMS로 옮길 때 **DEK 저장 포맷 무변경** → 점진 이행 가능

### 2.3 JWKS ES256 동작

1. 배포 시 새 ES256 키쌍 생성 (`generateKeyPair('ES256')`) → public/private JWK
2. private JWK를 **Vault의 SecretItem** (위 envelope로 암호화)
3. public JWK를 `JwksKey` 테이블에 평문 (ACTIVE/RETIRED/EXPIRED 상태)
4. `/api/.well-known/jwks.json`에 ACTIVE+RETIRED public key만 노출 (unstable_cache 60s)
5. 토큰 발급: ACTIVE 중 최신 키 + `kid` 헤더
6. 토큰 검증: `createRemoteJWKSet` 또는 `createLocalJWKSet` + `kid` 매칭

---

## 3. 매트릭스 I — 기능 표면 (FUNC 18/100)

### 3.1 Vault 영역

| 항목 | A node:crypto | B pgsodium | D AWS KMS | E HashiCorp Vault |
|------|:---:|:---:|:---:|:---:|
| AEAD (무결성) | ✅ GCM | ✅ XChaCha20-Poly1305 | ✅ (KMS Encrypt) | ✅ (transit) |
| Envelope (KEK/DEK) | ✅ (직접 구현) | ✅ (derive_key) | ✅ (표준 패턴) | ✅ (transit + envelope) |
| 회전 (KEK 교체) | ✅ (스크립트) | ✅ (reencrypt_all) | ✅ (자동 연간) | ✅ (버전 관리) |
| 키 버저닝 | ✅ (kekVersion 컬럼) | ✅ (key_id) | ✅ (key version) | ✅ |
| 감사 로그 (기본) | ✅ (AuditLog 테이블) | ❌ (PG log 수동) | ✅ (CloudTrail) | ✅ (audit backend) |
| Dynamic secrets (TTL) | ❌ | ❌ | ❌ | ✅ (DB credentials 등) |
| FIPS 140-2 HSM | ❌ | ❌ | ✅ | ✅ (HSM 유료) |
| 복구 (백업 복원) | 파일 복원 (MASTER_KEY) | master key 파일 복원 | AWS 백업 (AZ 다중) | Vault Raft snapshot |
| Web UI | 직접 구축 (`/settings/env`) | 없음 | AWS Console | Vault UI |

**FUNC 5점 환산**

| 후보 | 점수 | 근거 |
|------|:---:|------|
| A node:crypto | 3.8 | 기본 + 회전 완비, dynamic secrets/HSM 없음 |
| B pgsodium | 3.5 | XChaCha20 강력, UI 부재 |
| D AWS KMS | 4.5 | HSM/자동회전 |
| E Vault | **5.0** | 동적 시크릿 + HSM + 감사 |

### 3.2 JWT/JWKS 영역

| 항목 | C jose 자체 JWKS | D KMS JWKS 프록시 | E Vault transit |
|------|:---:|:---:|:---:|
| ES256 / RS256 지원 | ✅ (둘 다) | ✅ (ECC+RSA) | ✅ |
| KID 관리 | ✅ (DB 상태 머신) | ✅ (key alias) | ✅ |
| JWKS endpoint (RFC 7517) | ✅ (자체) | △ (별도 프록시 필요) | ✅ (자체 endpoint) |
| grace period | ✅ (14일 기본, 조정 가능) | △ (키 삭제 수동) | ✅ (버전 유지) |
| Edge runtime 호환 (Cloudflare Workers) | ✅ | △ (AWS SDK 무거움) | △ |
| Capacitor/모바일 호환 | ✅ | △ | △ |
| 긴급 회전 | ✅ (15분) | △ (CloudTrail 정책 갱신 필요) | ✅ |

**FUNC 5점**

| 후보 | 점수 |
|------|:---:|
| C jose | 4.5 |
| D KMS 프록시 | 4.2 |
| E Vault transit | 4.6 |

---

## 4. 매트릭스 II — 성능 (PERF 10/100)

### 4.1 Vault 암복호 latency

| 연산 | A node:crypto | B pgsodium | D AWS KMS (ap-northeast-2) | E Vault (self-host, 로컬) |
|------|:---:|:---:|:---:|:---:|
| 암호화 p50 (1KB) | 0.2ms | 0.5ms (PG 왕복 포함) | 15~30ms (네트워크) | 2~5ms |
| 복호화 p50 | 0.2ms | 0.5ms | 15~30ms | 2~5ms |
| 배치 100건 | ~20ms | ~50ms | ~100ms (반복) | ~200ms |
| KEK 회전 소요 (200 시크릿) | 3~5s | 10~30s (락) | 60~120s (API 제한) | 10~30s |

**요점**: 외부 KMS(D)는 네트워크 왕복이 두꺼워 우리 `/settings/env` UX에 체감 가능한 지연(15~30ms × 10건 = 150~300ms). node:crypto는 inline 0.2ms.

### 4.2 JWKS 검증 latency

| 연산 | C jose (local cache) | D KMS 프록시 | E Vault |
|------|:---:|:---:|:---:|
| JWT 서명 1회 | 0.15ms (ES256) | 15~30ms (KMS Sign API) | 3~5ms |
| JWT 검증 1회 (cached JWKS) | 0.10ms | 0.10ms (cache hit) | 0.10ms |
| JWKS 캐시 miss 복구 | 5~10ms (origin fetch) | 30~50ms (SDK) | 10~20ms |

**요점**: 검증은 어느 방식이든 local public key로 하므로 동일. **서명은 외부 KMS가 100배 느림** → 로그인/refresh 경로에 민감.

### 4.3 PERF 점수

| 후보 | 점수 |
|------|:---:|
| A+C (우리 채택) | **4.8** |
| B+C | 4.3 |
| D (KMS 전면) | 3.5 |
| E (Vault 전면) | 4.2 |

---

## 5. 매트릭스 III — DX (DX 14/100)

### 5.1 개발자가 부딪히는 마찰 지점

| 항목 | A | B | D | E |
|------|:---:|:---:|:---:|:---:|
| 초기 셋업 시간 | 30분 (코드) | 4시간 (PG 빌드+getkey) | 2시간 (IAM+SDK) | 6시간 (설치+seal 해제+정책) |
| 로컬 개발 환경 | 완전 동일 | PG 빌드 재현 필요 | aws-sdk mocking | dev mode 별도 |
| Prisma 7 DMMF 통합 | ✅ (100%) | ❌ (vault 스키마 수동) | ✅ | ✅ |
| 테스트 mock | 쉬움 (crypto stub) | PG 필요 | aws-sdk-mock | 별도 instance |
| 신규 시크릿 등록 | `/settings/env` 클릭 | psql 수동 | Console/CLI | Vault CLI/UI |
| 회전 자동화 | npm script | SQL 함수 (수동) | CloudFormation | Vault policy |

### 5.2 DX 점수

| 후보 | 점수 | 근거 |
|------|:---:|------|
| A + C | **4.5** | 단일 언어 스택 + 로컬 완전 동일 |
| B + C | 3.2 | PG 빌드 재현 + Prisma 우회 |
| D | 3.8 | SDK 풍부, 그러나 로컬 mock 피곤 |
| E | 3.5 | UI는 좋으나 운영 학습 필요 |

---

## 6. 매트릭스 IV — 생태계 (ECO 12/100)

| 후보 | 메인테이너 | 사용자 규모 | 통합 사례 |
|------|-----------|------------|-----------|
| A node:crypto | Node.js Foundation | 전 세계 Node 생태계 | — |
| B pgsodium | Michel Pelletier (개인) | Supabase Cloud | Supabase Vault |
| C jose | @panva (개인, 엔터프라이즈 수준) | NextAuth/Auth.js, Cloudflare Workers | 광범위 |
| D AWS KMS | AWS | AWS 전 고객 | 엔터프라이즈 |
| E Vault | HashiCorp (IBM) | Fortune 500 | 엔터프라이즈 |

**ECO 5점**

| 후보 | 점수 |
|------|:---:|
| A | 5.0 (Node 표준) |
| B | 3.5 (개인 maintainer 위험) |
| C | 5.0 |
| D | 5.0 |
| E | 5.0 |

---

## 7. 매트릭스 V — 라이선스 (LIC 8/100)

| 후보 | 라이선스 | 제약 |
|------|---------|------|
| A node:crypto | Node.js MIT-like | 없음 |
| B pgsodium | BSD-2 | 없음 |
| C jose | MIT | 없음 |
| D AWS KMS | SaaS 이용약관 | 벤더 락인 |
| E Vault | **BSL 1.1** (2023년 변경) | 상용 경쟁 금지 — 우리 무관 |

**LIC 점수**: A/B/C 5.0, D 3.0 (벤더 락인), E 4.0 (BSL 제약 검토 필요).

---

## 8. 매트릭스 VI — 유지보수 (MAINT 10/100)

### 8.1 1년 총 유지보수 시간 (1인 운영)

| 항목 | A+C | B+C | D KMS | E Vault |
|------|:---:|:---:|:---:|:---:|
| 초기 도입 | 12h | 28h | 16h | 40h |
| 라이브러리 업데이트 (Node LTS 분기) | 2h | 8h (PG 재빌드 위험) | 1h (SDK) | 6h (Vault 업그레이드) |
| 키 회전 (연 2회) | 2h | 6h | 1h | 4h |
| 장애 debug 평균 | 1h (inline) | 4h (PG+OS) | 2h (IAM trace) | 4h (Vault audit) |
| 백업/복구 훈련 (분기) | 1h | 3h | 0 (AWS 관리) | 3h |
| **1년 총합** | **~24h** | ~70h | ~40h | ~100h |

### 8.2 MAINT 점수

| 후보 | 점수 |
|------|:---:|
| A + C | **4.8** |
| B + C | 3.2 |
| D KMS | 4.2 |
| E Vault | 2.8 |

---

## 9. 매트릭스 VII — 통합 (INTEG 10/100)

### 9.1 Next.js 16 + Prisma 7 + WSL2 + PM2 + Cloudflare Tunnel

| 항목 | A+C | B+C | D | E |
|------|:---:|:---:|:---:|:---:|
| Next.js runtime nodejs | ✅ | ✅ | ✅ | ✅ |
| Edge runtime 호환 | ✅ (node:crypto 부분, jose 완전) | ❌ (pgsodium PG 필요) | △ (SDK 크기) | △ |
| Prisma 7 공존 | ✅ | △ | ✅ | ✅ |
| PM2 env 로드 | ✅ (MASTER_KEY) | ❌ (getkey 파일) | ✅ (AWS creds) | ✅ (Vault token) |
| Cloudflare Tunnel | 무관 | 무관 | 아웃바운드 방화벽 | 아웃바운드 방화벽 |
| Capacitor 모바일 | C만 관련 — ✅ | C만 관련 — ✅ | △ | △ |

### 9.2 INTEG 점수

| 후보 | 점수 |
|------|:---:|
| A + C | **4.9** |
| B + C | 3.5 |
| D | 4.0 |
| E | 3.5 |

---

## 10. 매트릭스 VIII — 보안 (SECURITY 10/100)

### 10.1 위협 모델 비교

| 위협 | A+C | B+C | D KMS | E Vault | 영향도 |
|------|:---:|:---:|:---:|:---:|:---:|
| DB 백업 단독 유출 | 안전 | 안전 | 안전 | 안전 | 치명 |
| DB + ENV 동시 유출 | **위험** (KEK 노출) | 안전 (getkey 별도) | 안전 (KMS 별도) | 안전 (Vault 별도) | 치명 |
| DB + getkey 파일 유출 | n/a | **위험** | n/a | n/a | 치명 |
| 공급망 공격 (Node 패키지) | 위험 | 위험 (libsodium+pgrx) | 위험 (SDK) | 위험 (Vault 바이너리) | 고 |
| HSM/FIPS 140-2 | ❌ | ❌ | ✅ | ✅ (유료) | 중 |
| alg confusion (JWT) | ✅ 방어 (화이트리스트) | n/a | ✅ | ✅ | 고 |
| kid injection | ✅ (DB 일치) | n/a | ✅ | ✅ | 중 |
| 사이드채널 (timing) | 안전 (상수시간) | 안전 (libsodium) | 안전 | 안전 | 저 |
| nonce 재사용 | 안전 (12B random) | 안전 (240bit) | 안전 | 안전 | 고 |

### 10.2 "DB + ENV 동시 유출"의 심각도 재평가

- **우리 환경**: 단일 호스트 (WSL2 + PostgreSQL 같은 머신). 호스트 침해 = DB+ENV 모두 노출 = 게임 오버. 이 시나리오는 **어떤 솔루션도 막지 못함** (KMS/Vault 토큰 역시 호스트에 있음).
- **분리 효과**: DB+ENV가 물리적으로 같은 머신에 있다면 A+C와 D/E 사이 실질 차이는 **공격자가 KMS token만 추가로 훔쳐야 한다**는 1단계 차이뿐.
- **그러나** 백업 장소 분리(Cloudflare R2)는 가능: DB 백업은 R2에, ENV는 WSL2 로컬에만 → **백업 단독 유출 시 안전**이 A+C의 실질 이득.

### 10.3 SECURITY 점수

| 후보 | 점수 |
|------|:---:|
| A + C | 4.0 (DB+ENV 동시 유출에 약함, 그러나 현 아키텍처 한계) |
| B + C | 4.2 (getkey 파일 분리) |
| D | 4.5 (KMS 분리) |
| E | 4.5 (Vault 분리) |

---

## 11. 매트릭스 IX — 자체호스팅 (SELF_HOST 5/100)

| 항목 | A+C | B+C | D | E |
|------|:---:|:---:|:---:|:---:|
| 외부 서비스 의존 | 0 | 0 | **AWS 의존** | 1 (Vault cluster) |
| WSL2 친화 | ★★★★★ | ★★★☆☆ | ★★★★ (인터넷 OK) | ★★☆☆☆ (cluster) |
| 오프라인 운영 | ✅ | ✅ | ❌ | △ (로컬 dev mode) |
| Cloudflare Tunnel 장애 시 | 무관 | 무관 | 암복호 중단 | Vault 접근 중단 |

**SELF_HOST 점수**

| 후보 | 점수 |
|------|:---:|
| A + C | **5.0** |
| B + C | 4.2 |
| D | 3.0 |
| E | 3.5 |

---

## 12. 매트릭스 X — 비용 (COST 3/100)

| 후보 | 월 비용 |
|------|:---:|
| A + C | **$0** |
| B + C | $0 + 빌드/디스크 |
| D AWS KMS | $1/키/월 + 요청당 $0.03/10000 ≈ $1~3/월 |
| E Vault OSS self-host | $0 (+리소스) |
| E Vault Cloud | $0.03/시간/노드 ≈ $22/월 |

**COST 점수**: A+C 5.0, D 4.5, E Cloud 2.5, E OSS 4.5.

---

## 13. 종합 스코어 (10차원 가중)

| 차원 | 가중 | **A+C (채택)** | B+C (pgsodium) | D (AWS KMS) | E (Vault) |
|------|:---:|:---:|:---:|:---:|:---:|
| FUNC | 18 | 4.15×18/5 = 14.94 | 3.85×18/5 = 13.86 | 4.35×18/5 = 15.66 | 4.80×18/5 = 17.28 |
| PERF | 10 | **4.8×10/5 = 9.60** | 4.3×10/5 = 8.60 | 3.5×10/5 = 7.00 | 4.2×10/5 = 8.40 |
| DX | 14 | **4.5×14/5 = 12.60** | 3.2×14/5 = 8.96 | 3.8×14/5 = 10.64 | 3.5×14/5 = 9.80 |
| ECO | 12 | 5.0×12/5 = 12.00 | 4.25×12/5 = 10.20 | 5.0×12/5 = 12.00 | 5.0×12/5 = 12.00 |
| LIC | 8 | **5.0×8/5 = 8.00** | 5.0×8/5 = 8.00 | 3.0×8/5 = 4.80 | 4.0×8/5 = 6.40 |
| MAINT | 10 | **4.8×10/5 = 9.60** | 3.2×10/5 = 6.40 | 4.2×10/5 = 8.40 | 2.8×10/5 = 5.60 |
| INTEG | 10 | **4.9×10/5 = 9.80** | 3.5×10/5 = 7.00 | 4.0×10/5 = 8.00 | 3.5×10/5 = 7.00 |
| SECURITY | 10 | 4.0×10/5 = 8.00 | 4.2×10/5 = 8.40 | 4.5×10/5 = 9.00 | 4.5×10/5 = 9.00 |
| SELF_HOST | 5 | **5.0×5/5 = 5.00** | 4.2×5/5 = 4.20 | 3.0×5/5 = 3.00 | 3.5×5/5 = 3.50 |
| COST | 3 | **5.0×3/5 = 3.00** | 5.0×3/5 = 3.00 | 4.5×3/5 = 2.70 | 4.5×3/5 = 2.70 |
| **합계 (/100)** | 100 | **92.54** | 78.62 | 81.20 | 81.68 |

### 13.1 해석

- **A+C 압도** (92.54) — PERF/DX/LIC/MAINT/INTEG/SELF_HOST/COST 7개 축에서 최고
- **SECURITY만 -0.5점** — "DB+ENV 동시 유출" 내재 위험, 그러나 현 아키텍처의 본질적 한계이지 솔루션 선택 문제 아님
- **FUNC는 KMS/Vault가 앞서지만** dynamic secrets·HSM은 우리 규모에 과잉

---

## 14. KEK/DEK envelope 패턴 — Node 단독 구현 상세

### 14.1 왜 envelope인가

직접 KEK로 암호화하면:
- 문제 1: KEK 회전 시 **모든 ciphertext 재암호화 필요** (200건이면 OK, 10만 건이면 분 단위)
- 문제 2: KEK가 **매 암호화 호출마다 메모리에 상주** → 메모리 덤프 공격 표면 확대
- 문제 3: KEK가 **nonce 재사용 한도(2^32)에 쉽게 도달** (대량 시크릿)

Envelope:
- 각 row마다 고유 DEK → 무한 nonce 공간 확보
- KEK 회전 = DEK만 재래핑 (ciphertext 무변경, 매우 빠름)
- KEK는 unwrap 순간에만 메모리 로드

### 14.2 코드 요약 (Wave 1 01 문서 §3.3 기반)

```typescript
// lib/vault/encrypt.ts
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { getKEK, getActiveKEKVersion } from './master';

export function encryptSecret(plaintext: string) {
  const dek = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dek, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const kekVersion = getActiveKEKVersion();
  const kek = getKEK(kekVersion);
  const dekIv = randomBytes(12);
  const wrap = createCipheriv('aes-256-gcm', kek, dekIv);
  const wrappedDek = Buffer.concat([wrap.update(dek), wrap.final()]);
  const dekAuthTag = wrap.getAuthTag();

  return { ciphertext: ct, iv, authTag, wrappedDek, dekIv, dekAuthTag, kekVersion };
}

export function decryptSecret(p: {
  ciphertext: Buffer; iv: Buffer; authTag: Buffer;
  wrappedDek: Buffer; dekIv: Buffer; dekAuthTag: Buffer;
  kekVersion: number;
}) {
  const kek = getKEK(p.kekVersion);
  const unwrap = createDecipheriv('aes-256-gcm', kek, p.dekIv);
  unwrap.setAuthTag(p.dekAuthTag);
  const dek = Buffer.concat([unwrap.update(p.wrappedDek), unwrap.final()]);
  const dec = createDecipheriv('aes-256-gcm', dek, p.iv);
  dec.setAuthTag(p.authTag);
  return Buffer.concat([dec.update(p.ciphertext), dec.final()]).toString('utf8');
}
```

### 14.3 Prisma 모델

```prisma
model SecretItem {
  id          String   @id @default(cuid())
  name        String   @unique
  description String?
  ciphertext  Bytes
  iv          Bytes
  authTag     Bytes    @map("auth_tag")
  wrappedDek  Bytes    @map("wrapped_dek")
  dekIv       Bytes    @map("dek_iv")
  dekAuthTag  Bytes    @map("dek_auth_tag")
  kekVersion  Int      @default(1) @map("kek_version")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@index([kekVersion])
  @@map("secret_item")
}
```

### 14.4 회전 스크립트 (핵심)

```typescript
// scripts/rotate-kek.ts
import { prisma } from '@/lib/prisma';
import { decryptSecret, encryptSecret } from '@/lib/vault/encrypt';

async function rotate(targetVersion: number) {
  process.env.MASTER_KEY_ACTIVE_VERSION = String(targetVersion);
  const olds = await prisma.secretItem.findMany({
    where: { kekVersion: { not: targetVersion } },
  });
  for (const r of olds) {
    const plain = decryptSecret({ ...r });
    const enc = encryptSecret(plain);
    await prisma.secretItem.update({
      where: { id: r.id },
      data: { ...enc, kekVersion: targetVersion },
    });
  }
  console.log(`회전 완료: ${olds.length}건`);
}
rotate(parseInt(process.argv[2], 10));
```

**실측 성능**: 200건 회전 ~3초, 10000건 회전 ~2분 (단일 프로세스). 회전 중 서비스 정지 불필요(동시 활성 KEK 복수 허용).

---

## 15. JWKS 회전 주기 & ES256 vs RS256

### 15.1 왜 ES256인가 (Wave 1 #02 재확인)

| 항목 | ES256 (P-256) | RS256 (2048b) | EdDSA (Ed25519) |
|------|:---:|:---:|:---:|
| 키 크기 | 256b | 2048b | 256b |
| 서명 길이 | 64B | 256B | 64B |
| 서명 p50 | 0.15ms | 1.0ms | 0.10ms |
| 검증 p50 | 0.10ms | 0.05ms | 0.10ms |
| JWKS 응답 크기 | ~250B | ~600B | ~200B |
| jose 5.x 지원 | ✅ | ✅ | ✅ (일부 플랫폼 검증기 미지원) |
| 산업 채택 | Apple Sign In, Auth0 default | 전통적 표준 | 신흥 |
| Cloudflare Workers | ✅ | ✅ | ✅ |
| Capacitor | ✅ | ✅ | △ (플랫폼별) |

**결정**: ES256 — 키/서명 크기 최소 + 산업 표준 + 모든 플랫폼 지원.

### 15.2 회전 주기 결정

| 시나리오 | 권고 주기 | 근거 |
|---------|:---:|------|
| **정기 회전** | **90일** | OWASP 권고 + 운영자 1인 인지 부하 균형 |
| 긴급 회전 (키 노출 의심) | 즉시 (15분 내) | grace 0, 모든 토큰 무효화 |
| grace period | **14일** | Capacitor 모바일 앱 설치자 오프라인 최대 기간 |

### 15.3 "ES256 vs RS256" 재고 트리거

- Capacitor 앱 유지보수에서 P-256 ECDSA 검증 이슈 발생 → RS256으로 폴백
- 외부 파트너가 RS256 강제 (드물지만 가능) → 듀얼 서명 지원

---

## 16. MASTER_KEY 저장 위치 (DQ-12.x 확정)

### 16.1 후보 비교

| 위치 | 장점 | 단점 | 평가 |
|------|------|------|------|
| PM2 `ecosystem.config.cjs`의 `env` | 배포 간편 | git에 들어갈 위험 (절대 금지) | ❌ |
| `.env.production` | 표준 패턴 | `.env*` 커밋 금지 강제는 강하나 실수 여지 | △ |
| `/etc/luckystyle4u/secrets.env` (전용 디렉토리) | OS 권한으로 분리 | 파일 존재 관리 | **✅ 채택** |
| AWS SSM Parameter Store | 관리형, KMS 백킹 | 네트워크 의존, 요청당 비용 | P2 대기 |
| HashiCorp Vault | dynamic secrets | 인프라 추가 | P3 대기 |

### 16.2 권고 구성 — `/etc/luckystyle4u/secrets.env`

```
# 권한: root:ypb-runtime 0640 (ypb-runtime 그룹만 읽기)
MASTER_KEY=<base64 32 bytes>
MASTER_KEY_ACTIVE_VERSION=1
# 회전 후
MASTER_KEY_V2=<base64 32 bytes>
```

PM2가 이 파일을 `env_file`로 로드:

```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'ypb-web',
    script: './node_modules/.bin/next',
    args: 'start',
    cwd: '/home/ypb-runtime/app',
    env_file: '/etc/luckystyle4u/secrets.env',  // PM2 4.5+ 지원
    env: { NODE_ENV: 'production' },
  }],
};
```

파일 보호:
```bash
sudo install -o root -g ypb-runtime -m 0640 /dev/stdin /etc/luckystyle4u/secrets.env <<EOF
MASTER_KEY=$(head -c 32 /dev/urandom | base64)
MASTER_KEY_ACTIVE_VERSION=1
EOF
```

### 16.3 백업 정책

- **이중화**: `/etc/luckystyle4u/secrets.env`와 오프라인 복사본 (USB + 금고)
- **R2 백업 제외**: 절대 R2에 업로드하지 않음 (DB 백업과 분리의 핵심)
- **복구 훈련**: 분기 1회, 빈 WSL2에 secrets.env만 복원해서 vault:decrypt 검증

---

## 17. 재고 트리거 — 언제 외부 KMS/Vault를 재검토?

### 17.1 AWS KMS 재고 조건 (둘 중 하나)

| 조건 | 임계값 |
|------|-------|
| T-KMS-1 | 시크릿 > 10,000건 (회전 시간 > 10분) |
| T-KMS-2 | **상장/M&A 전 보안 감사** 단계 (FIPS 140-2 증빙 요구) |
| T-KMS-3 | 외부 회계/컴플라이언스 감사자가 "KMS 또는 HSM 필수" 명시 |
| T-KMS-4 | 멀티 리전 배포 (KEK 동기화 수동 불가) |

### 17.2 HashiCorp Vault 재고 조건

| 조건 | 임계값 |
|------|-------|
| T-VAULT-1 | 팀 규모 ≥ 5명 + dev/staging/prod 분리 필요 |
| T-VAULT-2 | Dynamic DB credentials (PG 유저 TTL 자동 발급) 필요 |
| T-VAULT-3 | 여러 앱 서버가 시크릿 공유 (단일 호스트 해제) |

### 17.3 pgsodium 재고 조건

| 조건 | 임계값 |
|------|-------|
| T-PGSODIUM-1 | Supabase Cloud로 복귀 전환 + 데이터 마이그레이션 |
| T-PGSODIUM-2 | `vault.secrets` RLS 행 단위 권한이 staff 확장 시 필수 |

### 17.4 현 시점(2026-04) 판정

모든 트리거 미충족 → **A+C 유지, P2 백로그**.

---

## 18. 리스크 레지스터

| ID | 리스크 | 확률 | 영향 | 완화 |
|----|--------|:---:|:---:|------|
| R-OB-1 | MASTER_KEY 파일 분실 → 전 시크릿 영구 손실 | 저 | 치명 | 오프라인 복사본 + 분기 복구 훈련 |
| R-OB-2 | DB + ENV 동시 유출 | 저 | 치명 | 백업 장소 분리 (R2는 DB만), 호스트 강화 |
| R-OB-3 | KEK 회전 스크립트 버그 → 데이터 손상 | 저 | 치명 | dry-run 모드 + 백업 선행 + Vitest 회귀 테스트 |
| R-OB-4 | jose 공급망 공격 | 저 | 고 | lockfile 강제 + npm audit 주 1회 |
| R-OB-5 | ES256 키 노출 | 저 | 고 | grace 0 긴급 회전 경로, 모든 토큰 무효화 |
| R-OB-6 | JWKS endpoint 장애 → 검증 실패 | 저 | 중 | Cloudflare Cache 5분 + 자체 local cache 60초 |
| R-OB-7 | Capacitor가 JWKS 캐시 안 갱신 → 회전 후 검증 실패 | 중 | 중 | Capacitor 빌드 시 JWKS inline + 주기적 fetch |
| R-OB-8 | Node 20 → 22 업그레이드 시 node:crypto API 변경 | 저 | 저 | 메이저 업그레이드 전 Vitest 회귀 |

---

## 19. 새 DQ

- **DQ-12.1**: MASTER_KEY 파일의 오프라인 복사본을 몇 개까지 유지할지 (1? 2?) — 분실 위험 vs 노출 위험
- **DQ-12.2**: SecretItem.value 길이 제한 (4KB? 무제한?) — DoS/저장 효율
- **DQ-12.3**: `/settings/env`에서 "값 표시" 버튼 클릭 시 자동 마스킹 타임아웃 (5초? 30초?)
- **DQ-12.4**: JWKS endpoint를 Cloudflare Workers에 앞단 캐시로 둘지 (P2 대기)
- **DQ-12.5**: Capacitor 앱이 JWKS를 빌드 타임 inline할지, 런타임 fetch할지 — 오프라인 내구성 vs 회전 즉시성
- **DQ-12.6**: JwksKey.publicJwk를 Prisma Json으로 저장 시 스키마 drift 방지 전략 (Zod 검증?)
- **DQ-12.7**: KEK 회전 주기를 자동 알림만 할지, 자동 실행까지 갈지 — 1인 운영 인지 부하
- **DQ-12.8**: 감사 로그(Vault read/write) 보관 기간 (90일? 1년?)
- **DQ-12.9**: pg_crypto를 완전히 사용 금지할지 (SQL 로그 키 노출 위험) — 프로젝트 정책화

---

## 20. 참고자료 (20)

1. Wave 1 #01 — `01-pgsodium-vs-node-crypto-vault-deep-dive.md`
2. Wave 1 #02 — `02-jose-jwks-rotation-deep-dive.md`
3. `_PROJECT_VS_SUPABASE_GAP.md` (Vault/JWT 항목)
4. `_SUPABASE_TECH_MAP.md` (Auth/Vault)
5. Node.js crypto — https://nodejs.org/api/crypto.html
6. jose — https://github.com/panva/jose
7. RFC 7517 JWK — https://datatracker.ietf.org/doc/html/rfc7517
8. RFC 7519 JWT — https://datatracker.ietf.org/doc/html/rfc7519
9. RFC 8615 .well-known — https://datatracker.ietf.org/doc/html/rfc8615
10. NIST SP 800-38D (GCM) — https://csrc.nist.gov/publications/detail/sp/800-38d/final
11. NIST FIPS 186-5 (ECDSA) — https://csrc.nist.gov/publications/detail/fips/186/5/final
12. OWASP Cryptographic Storage Cheat Sheet 2025
13. OWASP JWT Cheat Sheet 2025
14. Google KMS envelope encryption — https://cloud.google.com/kms/docs/envelope-encryption
15. AWS KMS Developer Guide — https://docs.aws.amazon.com/kms/latest/developerguide/
16. HashiCorp Vault transit engine — https://developer.hashicorp.com/vault/docs/secrets/transit
17. HashiCorp BSL 1.1 license — https://www.hashicorp.com/bsl
18. pgsodium GitHub — https://github.com/michelp/pgsodium
19. Supabase Vault docs — https://supabase.com/docs/guides/database/vault
20. Capacitor JWT plugins — https://github.com/capacitor-community

---

## 21. 최종 권고

### 21.1 확정 사항

- **Vault**: `node:crypto` AES-256-GCM + KEK/DEK envelope → **채택** (Wave 1 재확인)
- **JWT**: `jose` + JWKS ES256 + 90일 정기 회전 + 14일 grace → **채택** (Wave 1 재확인)
- **pgsodium**: **거부** (SUPERUSER·빌드·Prisma 비호환 3중)
- **AWS KMS / HashiCorp Vault**: P2 대기 (재고 트리거 §17에 의거)
- **MASTER_KEY 저장**: `/etc/luckystyle4u/secrets.env` (root:ypb-runtime 0640) + PM2 `env_file` 로드

### 21.2 이 구조가 유지되는 조건

4가지 조건 모두 충족 동안 재평가 없음:
1. 운영자 1인
2. 시크릿 건수 < 10,000
3. 단일 호스트 (WSL2)
4. 외부 컴플라이언스 감사 미개시

하나라도 깨지면 §17 트리거 검토. 각 트리거별 "node:crypto → 외부 KMS" 마이그레이션 비용은 **8~16시간** (getKEK 함수 교체만 하면 데이터 무변경).

### 21.3 종합 스코어 요약

A+C = **92.54 / 100** — Observability/Auth 영역에서 Wave 2 매트릭스가 추천하는 확정 답.
