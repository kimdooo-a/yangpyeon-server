# Deep-Dive 12/01 — pgsodium vs node:crypto + master key (Vault, DQ-1.8)

> **메타** · 작성일 2026-04-18 · 영역 Observability/보안 · 레퍼런스 갯수 12 · 길이 530+ 줄 · 결정 권고도 0.86 · 단일 진실 소스 본 문서
>
> **연관 산출물**: `_PROJECT_VS_SUPABASE_GAP.md` Vault 갭 항목, `references/_SUPABASE_TECH_MAP.md` Vault 모듈, 본 Wave 1 R&D 청사진의 DQ-1.8 (`Vault 보관소 — pgsodium 의존을 받아들일 것인가, node:crypto + master key로 자체 구현할 것인가?`)

---

## 0. TL;DR (3문장 + 결정)

1. Supabase Vault는 PostgreSQL 확장 `pgsodium` (libsodium 기반 XChaCha20-Poly1305 + Server-Managed Key) + `vault.secrets` 뷰로 구성되며, **마스터 키를 OS 파일/HSM에 두고 DB는 그 핸들만 사용**한다 — 즉 "DB 안에 키 자체를 두지 않는다".
2. 우리 스택(Next.js 16 + Prisma 7 + WSL2 + 단일 운영자, 데이터셋은 시크릿 ≤ 200건 추정)에서 pgsodium은 **확장 빌드/유지보수 비용이 운영 효용을 초과**한다 — `apt install postgresql-16-pgsodium`이 아직 없는 배포판이 다수, 마이그레이션마다 SUPERUSER 필요, Prisma DMMF가 `vault` 스키마를 인식 못 함.
3. 대안인 **`node:crypto` AES-256-GCM + 마스터 키(`MASTER_KEY` 환경변수, 32바이트 base64) + KEK/DEK 분리** 패턴은 코드 200줄 미만, Prisma 모델 1개(`SecretItem`), `/settings/env` 페이지와 자연스러운 통합이 가능하며, 장차 KMS(Cloudflare/HashiCorp Vault) 도입 시 `MASTER_KEY` 주입 경로만 바꾸면 된다.
4. **결정 권고 (DQ-1.8 잠정 답)**: **`node:crypto` AES-256-GCM + envelope encryption(KEK→DEK)** 채택. pgsodium은 P2 백로그(데이터셋 1만 건 초과 또는 멀티 테넌트 전환 시점)로 보류.

---

## 1. 우리 컨텍스트 앵커링 (10차원 #1: Context Fit)

본 R&D는 양평 부엌 서버 대시보드(stylelucky4u.com) Vault 모듈 설계를 위한 것이다. 이전 세션·인수인계 결정과 정합해야 한다.

### 1.1 스택·운영 제약
- **DB**: PostgreSQL 16 (Supabase Local Dev에서 분리해 단일 PG 인스턴스로 마이그레이션 완료, 세션 14)
- **ORM**: Prisma 7 (DMMF 기반 Schema Visualizer, Data API auto-gen에 사용 — `references/spike-005-data-api.md`)
- **런타임**: Next.js 16 App Router + Node.js 20 LTS (Edge Runtime 사용 안 함 — `node:crypto` 가용)
- **배포**: WSL2 Ubuntu 22.04 + PM2 + Cloudflare Tunnel (단일 호스트, 운영자 1인 = 김도영)
- **시크릿 규모 추정**: 환경변수 ~40개, 외부 API 키 ~15개, 웹훅 시크릿 ~10개, 사용자 노출 키 (publishable/secret) ~10개 → 총 200건 미만
- **백업**: Cloudflare R2 (B2 백필 — Phase 14c 마이그레이션) + 로컬 pg_dump

### 1.2 이전 세션 잠금 (변경 금지)
- **세션 14 결정**: "Phase 13까지 Supabase 의존 0%". 따라서 pgsodium 도입은 이 결정과 충돌하지 않으나, Supabase 생태계 코드를 그대로 흡수하는 비용은 정당화 필요.
- **세션 14a 결정**: `_PROJECT_VS_SUPABASE_GAP.md` Vault 항목 — "P1: 마스터 키 + AES-GCM로 시작, P2: pgsodium 평가". 본 문서는 이 P1 결정을 검증·확정한다.
- **글로벌 정책**: ".env, .env.local, nul 파일 커밋 금지", "시크릿 키 클라이언트 노출 금지" — 둘 다 본 설계의 강제 조건.

### 1.3 비기능 요구사항 (NFR)
- **R-1 무결성**: 인증된 암호화(AEAD) 필수 — GCM/Poly1305
- **R-2 회전**: KEK 회전 ≤ 30분 다운타임으로 가능
- **R-3 감사**: 모든 secret access는 `AuditLog`에 기록 (`/logs` 페이지에 SSE로 노출)
- **R-4 백업 안전**: 백업본 단독 유출 시 평문 노출 0% (마스터 키 분리 보관)
- **R-5 RLS**: secret 행 단위 권한 (현재는 운영자 1인이라 단순화 가능, 향후 staff 추가 대비)

---

## 2. pgsodium 심층 분석 (10차원 #2: 후보 A 분석)

### 2.1 아키텍처 개요

pgsodium은 libsodium을 PostgreSQL 함수로 래핑한 확장이다. Vault는 그 위에 얹은 SQL 뷰/트리거 레이어.

```
┌─────────────────────────────────────────────────┐
│  PostgreSQL Server                              │
│                                                 │
│  ┌──────────────┐      ┌─────────────────────┐ │
│  │ pgsodium ext │ ───→ │ vault.secrets 뷰    │ │
│  │ (libsodium)  │      │  ↑ encrypt_iv 트리거│ │
│  └──────┬───────┘      │  ↓ decrypted 뷰    │ │
│         │              └─────────────────────┘ │
│         │                                       │
│  ┌──────▼──────────┐                           │
│  │ key_id (UUID)   │ ← Server-Managed Key     │
│  │ → derive sub-key│                           │
│  └─────────────────┘                           │
└──────────┬──────────────────────────────────────┘
           │ getkey() 호출 (custom SQL fn)
           ▼
┌─────────────────────────────┐
│ /etc/postgresql/getkey      │ ← Master Key 파일
│ (chmod 0400, postgres:none) │   (32바이트, OS-level 격리)
└─────────────────────────────┘
```

### 2.2 설치 절차 (Ubuntu 22.04 / PG 16)

```bash
# 1. libsodium 빌드 의존성
sudo apt-get install -y libsodium-dev postgresql-server-dev-16 build-essential git

# 2. pgsodium 소스 빌드 (apt 패키지 부재)
git clone https://github.com/michelp/pgsodium.git
cd pgsodium
sudo make install   # ~/.pgxs 경로에 설치

# 3. shared_preload_libraries 등록 (postgresql.conf)
echo "shared_preload_libraries = 'pgsodium'" | sudo tee -a /etc/postgresql/16/main/postgresql.conf

# 4. getkey 스크립트 (master key 출력)
sudo install -o postgres -g postgres -m 0400 /dev/stdin /etc/postgresql/16/main/pgsodium_getkey <<'EOF'
#!/bin/sh
cat /etc/postgresql/16/main/pgsodium_root.key
EOF

# 5. master key 생성 (한 번만)
head -c 32 /dev/urandom | base64 | sudo tee /etc/postgresql/16/main/pgsodium_root.key
sudo chmod 0400 /etc/postgresql/16/main/pgsodium_root.key
sudo chown postgres:postgres /etc/postgresql/16/main/pgsodium_root.key

# 6. PostgreSQL 재시작
sudo systemctl restart postgresql

# 7. DB에서 활성화 (SUPERUSER 필요)
psql -U postgres -d luckystyle4u -c "CREATE EXTENSION pgsodium;"
psql -U postgres -d luckystyle4u -c "CREATE EXTENSION supabase_vault;"   # 별도 확장
```

### 2.3 사용 예시 (Vault API)

```sql
-- 시크릿 저장
SELECT vault.create_secret(
  'sk_live_abc123...',          -- secret value
  'stripe_secret_key',          -- name
  'Stripe production secret'    -- description
);
-- → returns UUID

-- 조회 (자동 복호화 뷰)
SELECT id, name, decrypted_secret
FROM vault.decrypted_secrets
WHERE name = 'stripe_secret_key';

-- 갱신
SELECT vault.update_secret(
  '<uuid>',
  'sk_live_xyz789...',
  'stripe_secret_key',
  'Rotated 2026-04-18'
);

-- 키 회전 (master key 자체)
-- pgsodium_root.key 교체 → reencrypt_all() 함수 호출 (CPU 부하 큼, MAINTENANCE 윈도)
SELECT pgsodium.reencrypt_all();
```

### 2.4 장점

| # | 항목 | 설명 |
|---|---|---|
| A1 | 강력한 암호 | XChaCha20-Poly1305 (NaCl 표준) — AES-GCM보다 nonce-misuse 내성 강함 |
| A2 | 행 단위 RLS 통합 | `vault.secrets`에 RLS 정책 적용 가능 — DB 단일 진실 소스 |
| A3 | Supabase 호환 | 데이터셋 마이그레이션 시 그대로 흡수 가능 |
| A4 | 키 파생 (KDF) 내장 | `derive_key(key_id, context)`로 도메인별 sub-key 생성 |
| A5 | 백업 안전 | pg_dump에 평문 미포함 (master key 분리 보관 시) |

### 2.5 단점 / 비용

| # | 항목 | 비용 | 우리 영향도 |
|---|---|---|---|
| B1 | apt 패키지 부재 | 소스 빌드 + 매 PG 마이너 업데이트마다 재빌드 | **고** (운영자 1인) |
| B2 | SUPERUSER 강제 | `CREATE EXTENSION` 마이그레이션마다 SUPERUSER 자격 필요 → `migrate deploy` 자동화 어려움 | **고** |
| B3 | Prisma 7 DMMF 미지원 | `vault.decrypted_secrets`가 view라 모델 매핑 불가 → raw SQL 또는 별도 client | **중** |
| B4 | shared_preload_libraries | 변경 시 PG 재시작 (다운타임 ~10초) | **중** |
| B5 | `/etc/postgresql/getkey` 권한 | postgres OS 사용자 격리 — WSL2에서 systemd 모드 필요 | **중** |
| B6 | 디스크 백업 종속 | master key 파일 분실 = 모든 시크릿 영구 손실 | **고** |
| B7 | 학습 곡선 | libsodium + pgsodium 양쪽 문서 필요 | **중** |
| B8 | reencrypt_all 락 | 회전 시 vault.secrets 전체 잠금 (200건이면 OK, 10만건이면 분 단위) | **저** (현 규모) |

### 2.6 운영 시나리오 — 실패 모드

- **Case 1**: WSL2 호스트 SSD 교체 → master key 파일 백업 누락 → 모든 secret 영구 손실
- **Case 2**: PG 16 → 17 마이너 업그레이드 → pgsodium 재빌드 누락 → DB 시작 실패 (shared_preload_libraries 오류)
- **Case 3**: Prisma 마이그레이션 실행자가 SUPERUSER 아님 → `CREATE EXTENSION` 실패, 마이그레이션 부분 적용

→ **운영자 1인 환경에서 B1, B2, B6는 치명적**. 자동화로 흡수 어렵고, 단일 실패점 다수.

---

## 3. node:crypto AES-256-GCM 심층 분석 (10차원 #3: 후보 B 분석)

### 3.1 아키텍처 (envelope encryption)

```
┌──────────────────────────────────────────────────────┐
│  Next.js 16 (Node.js 20)                             │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │ lib/vault/master.ts                         │    │
│  │   └─ MASTER_KEY (env, 32B base64) = KEK     │    │
│  │   └─ getKEK(): KeyObject                    │    │
│  └────────────────┬────────────────────────────┘    │
│                   │                                  │
│  ┌────────────────▼────────────────────────────┐    │
│  │ lib/vault/encrypt.ts                        │    │
│  │   1. DEK 랜덤 생성 (32B)                    │    │
│  │   2. AES-256-GCM(DEK, plaintext)            │    │
│  │      → ciphertext + iv + authTag            │    │
│  │   3. AES-256-GCM(KEK, DEK)                  │    │
│  │      → wrappedDEK + dekIv + dekAuthTag      │    │
│  │   4. SecretItem row 저장                    │    │
│  └─────────────────────────────────────────────┘    │
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│  PostgreSQL  table: secret_item                      │
│   id, name, description,                             │
│   ciphertext (bytea), iv (bytea), auth_tag (bytea), │
│   wrapped_dek (bytea), dek_iv (bytea),              │
│   dek_auth_tag (bytea),                              │
│   kek_version int,  ← 회전 추적                      │
│   created_at, updated_at                             │
└──────────────────────────────────────────────────────┘
```

### 3.2 Prisma 모델

```prisma
// schema.prisma
model SecretItem {
  id           String   @id @default(cuid())
  name         String   @unique
  description  String?
  ciphertext   Bytes
  iv           Bytes
  authTag      Bytes    @map("auth_tag")
  wrappedDek   Bytes    @map("wrapped_dek")
  dekIv        Bytes    @map("dek_iv")
  dekAuthTag   Bytes    @map("dek_auth_tag")
  kekVersion   Int      @default(1) @map("kek_version")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@index([kekVersion])
  @@map("secret_item")
}

model KekRing {
  version    Int      @id
  // wrappedKek = HKDF(rootSeed, salt=version) — 실제로는 외부 주입
  createdAt  DateTime @default(now()) @map("created_at")
  rotatedAt  DateTime? @map("rotated_at")
  active     Boolean  @default(true)

  @@map("kek_ring")
}
```

### 3.3 코어 구현 (200줄 미만)

```ts
// lib/vault/master.ts
import { createHash } from 'node:crypto';

let cachedKEKs: Map<number, Buffer> | null = null;

export function getKEK(version: number = 1): Buffer {
  if (!cachedKEKs) loadKEKs();
  const kek = cachedKEKs!.get(version);
  if (!kek) throw new Error(`KEK version ${version} not found`);
  return kek;
}

function loadKEKs() {
  cachedKEKs = new Map();
  // 1차: 단일 MASTER_KEY (env)
  const root = process.env.MASTER_KEY;
  if (!root) throw new Error('MASTER_KEY env required');
  const buf = Buffer.from(root, 'base64');
  if (buf.length !== 32) throw new Error('MASTER_KEY must be 32 bytes (base64)');
  cachedKEKs.set(1, buf);

  // 2차: 회전 후 추가 키들 (MASTER_KEY_V2, V3, ...)
  for (let v = 2; v <= 10; v++) {
    const k = process.env[`MASTER_KEY_V${v}`];
    if (k) cachedKEKs.set(v, Buffer.from(k, 'base64'));
  }
}

export function getActiveKEKVersion(): number {
  const v = parseInt(process.env.MASTER_KEY_ACTIVE_VERSION ?? '1', 10);
  return v;
}
```

```ts
// lib/vault/encrypt.ts
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { getKEK, getActiveKEKVersion } from './master';

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;          // 12B for GCM
  authTag: Buffer;     // 16B
  wrappedDek: Buffer;
  dekIv: Buffer;
  dekAuthTag: Buffer;
  kekVersion: number;
}

export function encryptSecret(plaintext: string): EncryptedPayload {
  const dek = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dek, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // wrap DEK with KEK
  const kekVersion = getActiveKEKVersion();
  const kek = getKEK(kekVersion);
  const dekIv = randomBytes(12);
  const wrapCipher = createCipheriv('aes-256-gcm', kek, dekIv);
  const wrappedDek = Buffer.concat([wrapCipher.update(dek), wrapCipher.final()]);
  const dekAuthTag = wrapCipher.getAuthTag();

  return { ciphertext: ct, iv, authTag, wrappedDek, dekIv, dekAuthTag, kekVersion };
}

export function decryptSecret(p: EncryptedPayload): string {
  // unwrap DEK
  const kek = getKEK(p.kekVersion);
  const unwrap = createDecipheriv('aes-256-gcm', kek, p.dekIv);
  unwrap.setAuthTag(p.dekAuthTag);
  const dek = Buffer.concat([unwrap.update(p.wrappedDek), unwrap.final()]);

  // decrypt payload
  const dec = createDecipheriv('aes-256-gcm', dek, p.iv);
  dec.setAuthTag(p.authTag);
  const pt = Buffer.concat([dec.update(p.ciphertext), dec.final()]);
  return pt.toString('utf8');
}
```

```ts
// lib/vault/repository.ts
import { prisma } from '@/lib/prisma';
import { encryptSecret, decryptSecret } from './encrypt';
import { auditLog } from '@/lib/audit';

export async function createSecret(
  name: string,
  value: string,
  actorId: string,
  description?: string
) {
  const enc = encryptSecret(value);
  const row = await prisma.secretItem.create({
    data: {
      name,
      description,
      ciphertext: enc.ciphertext,
      iv: enc.iv,
      authTag: enc.authTag,
      wrappedDek: enc.wrappedDek,
      dekIv: enc.dekIv,
      dekAuthTag: enc.dekAuthTag,
      kekVersion: enc.kekVersion,
    },
  });
  await auditLog({ actorId, action: 'vault.create', resource: `secret:${row.id}` });
  return { id: row.id, name: row.name };
}

export async function readSecret(id: string, actorId: string) {
  const row = await prisma.secretItem.findUniqueOrThrow({ where: { id } });
  const value = decryptSecret({
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.authTag,
    wrappedDek: row.wrappedDek,
    dekIv: row.dekIv,
    dekAuthTag: row.dekAuthTag,
    kekVersion: row.kekVersion,
  });
  await auditLog({ actorId, action: 'vault.read', resource: `secret:${row.id}` });
  return { name: row.name, value };
}
```

### 3.4 KEK 회전 절차

```ts
// scripts/rotate-kek.ts — npm run vault:rotate
import { prisma } from '@/lib/prisma';
import { decryptSecret, encryptSecret } from '@/lib/vault/encrypt';
import { getKEK } from '@/lib/vault/master';

async function rotate(targetVersion: number) {
  const olds = await prisma.secretItem.findMany({
    where: { kekVersion: { not: targetVersion } },
  });
  console.log(`회전 대상: ${olds.length}건`);

  for (const r of olds) {
    const plain = decryptSecret({ ...r });
    process.env.MASTER_KEY_ACTIVE_VERSION = String(targetVersion);
    const enc = encryptSecret(plain);
    await prisma.secretItem.update({
      where: { id: r.id },
      data: {
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        authTag: enc.authTag,
        wrappedDek: enc.wrappedDek,
        dekIv: enc.dekIv,
        dekAuthTag: enc.dekAuthTag,
        kekVersion: targetVersion,
      },
    });
  }
  console.log('회전 완료');
}

rotate(parseInt(process.argv[2], 10));
```

운영 절차:
1. 새 MASTER_KEY_V2 생성 → `.env.production`에 추가, PM2 reload
2. `npm run vault:rotate -- 2` 실행
3. 모든 행 V2로 회전 확인 → MASTER_KEY_V1 제거 (백업 보관)

### 3.5 장점 / 단점

| 장점 | 단점 |
|---|---|
| Node 20 표준 — 추가 의존성 0 | 마스터 키 PM2 ENV에 평문 노출 (단, 호스트 격리됨) |
| Prisma 7 DMMF 100% 호환 | DB 백업 단독 유출 시 안전하나, ENV 동시 유출 시 위험 |
| 회전 스크립트 200줄 | KMS 미사용 시 키 액세스 감사 로그 약함 |
| `/settings/env` 페이지에 즉시 통합 | 코드 버그 = 데이터 손실 (vs pgsodium은 검증된 SQL) |
| 마이그레이션 단순 (`prisma migrate dev`) | XChaCha20 미사용 (단, AES-GCM도 NIST 표준) |

---

## 4. 보안 비교 매트릭스 (10차원 #4: Threat Model)

### 4.1 위협 시나리오

| # | 위협 | pgsodium | node:crypto + KEK |
|---|---|---|---|
| T1 | DB 백업 단독 유출 | 안전 (master key 별도) | 안전 (KEK 별도) |
| T2 | DB + ENV 동시 유출 | 안전 (getkey 파일 별도) | **위험** (KEK 노출) |
| T3 | DB + getkey 파일 동시 유출 | **위험** | N/A |
| T4 | 메모리 덤프 | 위험 (libsodium 메모리 락) | 위험 (Node heap) |
| T5 | 사이드 채널 (timing) | 안전 (libsodium 상수시간) | 안전 (Node crypto 상수시간) |
| T6 | 코드 인젝션으로 KEK 유출 | 위험 | 위험 |
| T7 | 무결성 위변조 | XChaCha20-Poly1305 ✓ | AES-GCM ✓ |
| T8 | nonce 재사용 | XChaCha20 240bit nonce 안전 | 12B nonce randomBytes 안전 (한 KEK당 < 2^32 호출) |

### 4.2 우리 환경 위협 우선순위

- **단일 호스트 + 운영자 1인** → T2 (DB + ENV 동시 유출) 시나리오는 호스트 침해 = 게임 오버이므로 동일 위협 등급
- **백업 외부 저장 (R2)** → T1이 가장 현실적, 둘 다 안전
- **공급망 공격** → 둘 다 위험 (libsodium 또는 node:crypto OpenSSL 공급망)

→ **위협 모델상 본질적 차이 없음**. 결정은 운영 비용에서 갈린다.

---

## 5. 운영 비용 비교 (10차원 #5: Operational Cost)

### 5.1 시간 비용 (운영자 1인 가정)

| 항목 | pgsodium | node:crypto |
|---|---|---|
| 초기 설치 | 4시간 (소스 빌드 + 검증) | 30분 (코드 작성 + 테스트) |
| 월간 유지 | 1시간 (PG 마이너 업데이트 추적) | 5분 |
| 키 회전 1회 | 30분 (master key 교체 + reencrypt) | 15분 (`npm run vault:rotate`) |
| 신규 시크릿 등록 | psql 또는 Prisma raw SQL | `/settings/env` UI 클릭 |
| 백업 복구 검증 | 분기별 1회 필수 (파일 분리 위험) | 분기별 1회 권장 |
| 1년 총합 | ~20시간 | ~3시간 |

### 5.2 인지 부하

- pgsodium: SQL + libsodium + Prisma 우회 = **3개 모델 동시 보유**
- node:crypto: TS 함수 5개 = **단일 모델**

### 5.3 미래 KMS 전환 비용

- pgsodium → AWS KMS / HashiCorp Vault: getkey 스크립트 교체로 부분 가능, 하지만 reencrypt 필요
- node:crypto → KMS: `getKEK()` 함수만 수정, 데이터 무수정 (DEK는 그대로, KEK만 KMS에서 fetch)

→ **node:crypto가 KMS 전환 비용 압도적으로 낮음** (캡슐화 덕분).

---

## 6. /settings/env 통합 설계 (10차원 #6: UX Integration)

### 6.1 페이지 구조

```
/settings/env
├── 환경변수 (process.env 기반, 읽기 전용 표시)
├── 시크릿 보관소 (Vault — 암호화 저장)
│   ├── [+ 새 시크릿] 버튼
│   ├── 테이블: 이름 | 설명 | 회전일 | KEK 버전 | 액션
│   ├── 액션: [복사] [회전] [삭제]
│   └── 마스터 키 회전 카드 (위험 영역)
└── 감사 로그 (최근 100건, /logs로 링크)
```

### 6.2 컴포넌트 (shadcn/ui)

```tsx
// app/(dashboard)/settings/env/_components/secret-create-dialog.tsx
'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { createSecretAction } from '../actions';

export function SecretCreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [desc, setDesc] = useState('');
  const [pending, setPending] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 시크릿 추가</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="이름 (예: stripe_secret_key)" value={name} onChange={e => setName(e.target.value)} />
          <Textarea placeholder="값" value={value} onChange={e => setValue(e.target.value)} rows={4} className="font-mono" />
          <Input placeholder="설명 (선택)" value={desc} onChange={e => setDesc(e.target.value)} />
          <Button
            disabled={pending || !name || !value}
            onClick={async () => {
              setPending(true);
              await createSecretAction({ name, value, description: desc });
              onOpenChange(false);
            }}
          >저장</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

```ts
// app/(dashboard)/settings/env/actions.ts
'use server';
import { createSecret } from '@/lib/vault/repository';
import { requireSession } from '@/lib/auth/session';

export async function createSecretAction(input: { name: string; value: string; description?: string }) {
  const session = await requireSession();
  return createSecret(input.name, input.value, session.userId, input.description);
}
```

### 6.3 보안 가드

- 페이지 자체에 RBAC: `role === 'admin'` 만 접근
- 값 표시는 항상 마스킹 (`••••`), `[보기] 버튼 → 1회 복호화 → 5초 후 자동 마스킹`
- `[복사]` 클릭 시 `navigator.clipboard` + `auditLog`

---

## 7. JWT/JWKS 시크릿과의 관계 (10차원 #7: Cross-cutting)

세션 12/02 (jose JWKS 로테이션 deep-dive)와 본 Vault 설계는 **상호 보완**한다.

- JWT 서명 키 (RS256 private key) → Vault의 SecretItem으로 저장
- JWKS endpoint (`/api/.well-known/jwks.json`) → 공개 키만 노출 (Vault 미경유)
- 회전 시:
  1. 새 RSA 키 쌍 생성 → public + private
  2. private key를 Vault에 `jwt_signing_key_v2`로 저장
  3. public key를 JWKS endpoint에 추가 (KID 포함)
  4. 기존 토큰 만료까지 grace period 유지 → V1 제거

→ Vault 인터페이스가 단순할수록 JWKS 회전 자동화가 쉬움. **node:crypto 채택의 또 다른 근거**.

---

## 8. 마이그레이션 경로 (10차원 #8: Migration Plan)

### 8.1 현재 상태
- 시크릿은 `.env.production` 평문 + Cloudflare Tunnel 설정
- DB에 시크릿 테이블 없음
- AuditLog 모듈은 Phase 14b에서 완성 (`audit_log` 테이블)

### 8.2 Phase A — Vault 코어 (1세션, 4시간)
1. Prisma 모델 추가 (`SecretItem`, `KekRing`)
2. `lib/vault/{master,encrypt,repository}.ts` 작성
3. 단위 테스트 (encrypt/decrypt round-trip, KEK 버전 다중 동시 활성)
4. `MASTER_KEY` 생성 + `.env.example` 갱신
5. Prisma migrate

### 8.3 Phase B — UI (1세션, 3시간)
1. `/settings/env` 페이지 작성
2. SSR + Server Action으로 CRUD
3. shadcn/ui Dialog + Table

### 8.4 Phase C — 기존 시크릿 임포트 (0.5세션, 2시간)
1. `.env.production`의 민감 항목 식별 (~25건)
2. 임포트 스크립트 → SecretItem 행 생성
3. 코드에서 `process.env.X` → `await readSecret('x')` 점진 교체

### 8.5 Phase D — 회전 자동화 (선택, P1)
1. `scripts/rotate-kek.ts` 완성
2. cron (월 1회 알림 — 자동 회전 X, 운영자 검토 후 수동)

### 8.6 Phase E — KMS 연동 (P2)
1. Cloudflare Workers KV 또는 HashiCorp Vault 채택
2. `getKEK()` 만 수정 — 데이터 손대지 않음

---

## 9. 대안 검토 (10차원 #9: Alternatives Considered)

### 9.1 PostgreSQL `pgcrypto` (확장이지만 표준)
- 장점: apt 패키지 (`postgresql-contrib`)에 포함, 즉시 사용
- 단점: AES-CBC 또는 GCM이지만 키 관리 SQL에 노출 (`encrypt(data, 'key', 'aes')`) → SQL 로그에 키 유출 위험
- 결론: 키를 코드에서 SQL로 전달해야 하므로 KMS 통합 어려움 — 탈락

### 9.2 SOPS (Mozilla, file-based)
- 장점: yaml/json 파일을 KMS로 암호화, GitOps 친화
- 단점: DB 통합 어려움, 런타임 회전 불가, `/settings/env` UI 부재
- 결론: 정적 설정 파일에 적합하나 동적 시크릿 부적합 — 탈락

### 9.3 HashiCorp Vault (외부 서비스)
- 장점: 업계 표준, dynamic secrets, audit 강력
- 단점: WSL2 단일 호스트에 추가 서비스 운용 = 복잡도 폭증
- 결론: P2 백로그 (트래픽/팀 규모 성장 시 채택) — 보류

### 9.4 Cloudflare Workers Secrets
- 장점: 우리는 이미 Cloudflare Tunnel 사용
- 단점: Next.js 서버는 WSL2 Node, Workers와 별도 — runtime 시 fetch 비용
- 결론: KMS 백엔드로는 유망 (Phase E에서 평가)

### 9.5 AWS KMS / GCP KMS
- 장점: 산업 표준, HSM 백킹
- 단점: 우리 호스팅(개인 WSL2 + 가비아 도메인)과 클라우드 의존성 추가
- 결론: 비용 대비 과한 솔루션 — 보류

---

## 10. 결론 + DQ-1.8 잠정 답 (10차원 #10: Decision)

### 10.1 결정 권고

> **DQ-1.8 잠정 답**: **`node:crypto` AES-256-GCM + envelope encryption(KEK→DEK) 채택**
>
> - 마스터 키는 환경변수 `MASTER_KEY` (32B base64) — PM2 ENV로 격리
> - DEK 행 단위 wrap → KEK 회전 시 DEK 재암호화만 필요 (실제 ciphertext 유지)
> - `/settings/env` 페이지에서 CRUD + 회전 UI 제공
> - pgsodium은 P2 백로그로 보류

### 10.2 권고도 산정 (0.86)

| 차원 | 가중치 | node:crypto 점수 | pgsodium 점수 |
|---|---|---|---|
| 운영 비용 (1인 운영) | 0.25 | 0.95 | 0.40 |
| 보안 강도 | 0.20 | 0.85 | 0.95 |
| 우리 스택 적합성 | 0.20 | 0.95 | 0.50 |
| 미래 KMS 전환 | 0.15 | 0.90 | 0.60 |
| Prisma 7 호환 | 0.10 | 1.00 | 0.30 |
| 학습/온보딩 | 0.10 | 0.90 | 0.40 |
| **가중 평균** | | **0.92** | **0.55** |

→ 권고도 0.86 (운영 환경 불확실성 0.06 차감).

### 10.3 청사진 요약

```
 [/settings/env UI]
        │
        ▼ (Server Action)
 [lib/vault/repository]
        │
        ├─→ encrypt: DEK 생성 → AES-GCM ciphertext + KEK으로 DEK wrap
        ├─→ decrypt: KEK으로 DEK unwrap → AES-GCM 복호화
        └─→ audit log (vault.create / vault.read / vault.rotate)
        │
        ▼
 [Prisma SecretItem 모델]
   (PostgreSQL bytea 컬럼들)
        │
        ▼
 [Cloudflare R2 백업] (KEK 분리 보관)
```

### 10.4 후속 의사결정 큐

- **DQ-1.8a (신규)**: MASTER_KEY를 PM2 ecosystem.config.js에 둘 것인가, 별도 `/etc/luckystyle4u/secrets.env`에 둘 것인가? → 후자 권고 (호스트 권한 격리)
- **DQ-1.8b (신규)**: KEK 회전 주기 — 90일? 180일? → 단일 운영자 기준 180일 + 사고 발생 시 즉시 회전
- **DQ-1.8c (신규)**: SecretItem.value의 평문 길이 한계는? → 본 설계는 무제한 (bytea), 실용상 4KB 권고

---

## 11. 참고문헌 (12개)

1. **pgsodium 공식**: https://github.com/michelp/pgsodium — README 및 Server-Managed Keys 섹션
2. **Supabase Vault 문서**: https://supabase.com/docs/guides/database/vault — pgsodium 통합 패턴
3. **libsodium docs**: https://doc.libsodium.org/secret-key_cryptography/aead/xchacha20-poly1305 — XChaCha20 AEAD 명세
4. **Node.js crypto**: https://nodejs.org/api/crypto.html#class-cipher — `createCipheriv` / `getAuthTag` API
5. **NIST SP 800-38D**: GCM mode of operation — IV 길이 12B 권고 근거
6. **Envelope encryption (Google KMS docs)**: https://cloud.google.com/kms/docs/envelope-encryption — KEK/DEK 패턴 표준
7. **Prisma Bytes type**: https://www.prisma.io/docs/orm/reference/prisma-schema-reference#bytes — bytea 매핑
8. **Cloudflare Workers Secrets**: https://developers.cloudflare.com/workers/configuration/secrets/ — KMS 후보 평가
9. **OWASP Cryptographic Storage Cheat Sheet 2025**: AEAD 권고 + 키 회전 주기
10. **PostgreSQL `shared_preload_libraries`**: https://www.postgresql.org/docs/16/runtime-config-client.html — 재시작 요구사항
11. **HashiCorp Vault transit secrets engine**: https://developer.hashicorp.com/vault/docs/secrets/transit — Phase E 후보
12. **Auth.js / NextAuth secret rotation**: https://authjs.dev/getting-started/deployment#secret-rotation — JWT 회전 패턴 (12/02 deep-dive와 연결)

---

**작성**: kdywave Wave 1 Round 2 · 2026-04-18 · DQ-1.8 권고 0.86
