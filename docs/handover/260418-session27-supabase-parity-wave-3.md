# 인수인계서 — 세션 27 (kdywave Wave 3 완료: 비전 + FR/NFR + DQ 재분배 11 문서)

> 작성일: 2026-04-18
> 이전 세션: [session26](./260418-session26-supabase-parity-wave-2.md)
> 저널: [journal-2026-04-18.md](../logs/journal-2026-04-18.md)

---

## 작업 요약

`/kdywave --resume` → Phase 2 Wave 3 진입 → 7 Agent 병렬(V1/V2/R1/R2 opus, M1/M2/M3 sonnet) → **11 문서 / 8,350줄** 생성. Wave 1+2+3 누적 **72 문서 / 53,542줄** (전체 예상 91의 79%). 비전·요구사항·DQ 재분배·ADR 전부 완료. 후속: Wave 4(아키텍처 청사진 20~30 문서) 다음 세션.

## 현재 상태 핵심 수치

| 항목 | 값 |
|------|-----|
| Wave 1+2+3 누적 문서 | **72** |
| 누적 줄 수 | **53,542** |
| 100점 도달 총 추정 공수 | **1,008h (~50주)** |
| 3년 TCO 절감 | **$950 ~ 2,150** (Supabase Cloud 대비) |
| MVP 범위 | **Phase 15~17** (Auth Advanced + Observability/Ops + Auth Core/Storage) |
| DQ 전수 | 64 + 폐기 4 → Wave 3에서 **20건 답변**, Wave 4=28, Wave 5=16 |
| ADR 확정 | **ADR-001 (Multi-tenancy 의도적 제외)** + 재검토 트리거 4개 정량화 |

## 생성 문서 (11개, 00-vision/)

| # | 파일 | 모델 | 줄수 | 내용 |
|---|------|------|------|------|
| V1 | 00-product-vision.md | opus | 620 | A1~A7 전체, 페르소나 3인(김도영/박민수/이수진), 핵심 가치 5종, 원칙 7 |
| V2 | 01-user-stories.md | opus | 830 | 7 Epic × 36 스토리 (Must 69%), Gherkin 완비, Won't 10건 |
| R1 | 02-functional-requirements.md | opus | 1,477 | 14 FR 카테고리 × 55 FR (P0 49.1%, P1 40%, P2 10.9%) |
| R2a | 03-non-functional-requirements.md | opus | 500 | 38 NFR (PERF/SEC/UX/REL/MNT/CMP/COST) |
| R2b | 04-constraints-assumptions.md | opus | 420 | CON 12 / ASM 12 |
| M1a | 05-100점-definition.md | sonnet | 435 | 14 카 × 4단계(60/80/95/100) 정의 |
| M1b | 06-operational-persona.md | sonnet | 449 | 페르소나 3 + 비페르소나 4 (Won't serve) |
| M2a | 07-dq-matrix.md | sonnet | 1,648 | 64 DQ 전수 + 폐기 4건, Wave 3=20 / 4=28 / 5=16 재분배 |
| M2b | 08-security-threat-model.md | sonnet | 782 | STRIDE 29 위협 + 자체호스팅 특화 5 |
| M3a | 09-multi-tenancy-decision.md | sonnet | 621 | ADR-001 + 재검토 트리거 4개 |
| M3b | 10-14-categories-priority.md | sonnet | 568 | Phase 15-22 매핑 preview |

## 대화 다이제스트

### 토픽 1: Wave 3 진입 — 7 Agent 병렬 발사 설계
- V1/V2/R1/R2 = opus (창의·구조 서사, 비전·스토리·FR/NFR)
- M1/M2/M3 = sonnet (매트릭스·정량 분류, 100점 정의·DQ·ADR)
- 에이전트당 1~2 문서, L1(공통 프로젝트) + L2(Wave 3 계약) + L3(개별 미션) + L4(산출 계약) 4계층 프롬프트

### 토픽 2: 7 Agent 완료 후 종합 판단
- **1,008h 총 공수** — MVP(Phase 15~17) 추정 ~300h 수준, 나머지 ~700h는 장기
- **TCO $950~2,150 절감** — 3년 운영 기준. 자체호스팅 이득이 Supabase Cloud 대비 경제적으로도 명확
- **Multi-tenancy 제외 확정** — ADR-001에 재검토 트리거 4건(외부 파트너 요청 / 법인 분리 / SaaS 전환 / 동시 접속 10+) 정량화하여 "폐기"가 아닌 "조건부 잠정 배제"로 기록

### 토픽 3: DQ 재분배 (64건 → Wave별 할당)
- Wave 1+2에서 잠정 답변 9건 + DQ-12.3 확정 = 10건
- Wave 3에서 FR/NFR 반영으로 추가 20건 답변
- Wave 4(청사진)에서 28건, Wave 5(로드맵·스파이크)에서 16건 예정
- 폐기 4건: 초기 가설 변경 또는 다른 DQ에 흡수

### 토픽 4: 1:1 비교 Compound Knowledge 재활용
세션 26의 "1:1 비교는 계층 분리를 드러낸다"를 Wave 3에 직접 반영:
- FR 구조에서 CDC 레이어와 Channel 레이어 분리 명시 (FR-09-a vs FR-09-b)
- Edge runtime v2를 in-process vs subprocess 2개 FR로 분리
- Advisors를 DDL 시점 vs 런타임 시점 2개 FR로 분리

### 토픽 5: README + CHECKPOINT 갱신
- README: Wave 3 = 11/11 완료 표시, 누적 72/53,542 반영
- CHECKPOINT: `last_completed_wave: 3`, Wave 3 상세 append

### 토픽 6: 커밋 정리
세션 26 커밋(078dfe2) 이후 Wave 3 11 문서 + CHECKPOINT·README 변경이 미커밋 상태였음. 세션 27에서 단일 커밋으로 통합 + `.gitignore`에 `test-results/` + `playwright-report/` 추가(Playwright 산출물 추적 방지).

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | 에이전트 모델 분담 | 전부 opus vs 혼합 | opus = 창의·서사(V/R), sonnet = 매트릭스·정량(M). 비용/속도 효율 |
| 2 | 문서 수 | 11 vs 15-20 | Wave 3 범위 상한(=FR/NFR 완결 + DQ 재분배)에서 11 충분. 잉여 문서 배제 |
| 3 | ADR-001 Multi-tenancy | 폐기 vs 잠정 배제+트리거 | 환경 변화 대비 재검토 트리거 4개 정량화한 "조건부 배제" 선호 |
| 4 | DQ 폐기 vs 흡수 | 남김 vs 제거 | 4건 폐기 + 흡수 기록(07-dq-matrix.md) — 이력 영속 |
| 5 | 세션 27 커밋 단위 | Wave 3 단독 vs 핸드오버 포함 | 단일 커밋에 11 문서 + 메타(CHECKPOINT/README) + gitignore + handover + current.md + next-dev-prompt 포함 |

## 인프라·코드 변경

- **.gitignore**: `/test-results/`, `/playwright-report/` 추가 (Playwright 산출물)
- **코드 변경**: 없음. 순수 문서·설계 세션

## 다음 세션 권장 작업

### 우선순위 1: Wave 4 진입 (아키텍처 청사진) ⭐
```
/kdywave --resume
```
- Phase 2 Wave 4 — 카테고리별 아키텍처 청사진 20~30 문서
- Wave 3의 FR/NFR/ADR-001/DQ를 입력으로 각 카테고리의 모듈 구조·데이터 흐름·계층 분리 설계
- 중심축: Wave 1+2 Compound Knowledge 2건(하이브리드 9:5 / 1:1 계층 분리) + Wave 3 `14-categories-priority.md`의 Phase 15-22 매핑

### 우선순위 2: MVP 즉시 착수 가능 영역 (Wave 4 대기 없이도 가능)
- **DQ-1.3 SeaweedFS 1주 PoC**: Storage 40→90 (단일 솔루션형, 빠른 ROI)
- **DQ-1.1 Phase 15 otplib TOTP**: Auth Advanced 15→27 (30h 단일 Phase)
- **DQ-1.7 pgmq 도입 spec 작성**: Data API Queue 0→90 (확장 1줄)

### 우선순위 3: Cloudflare Tunnel 후속 5건 (인프라 개선)
세션 25-B에서 위임된 항목:
1. WSL2 `sysctl` `tcp_keepalive` + `rmem`/`wmem`
2. WSL systemd 활성화 (idle shutdown 방지)
3. `cloudflared` 다중 인스턴스
4. Cloudflare WARP
5. auto-restart cron

## 알려진 이슈 (변경 없음)

- **Cloudflare Tunnel 간헐 530**: ~50% 안정성. 근본 원인은 Cloudflare edge↔connector KT 회선 패킷 drop (cloudflared/origin 무관). 세션 25-B `67b414d`에서 QUIC→HTTP/2 폴백으로 부분 개선
- **컨텍스트 부담**: 누적 53,542줄. Wave 4 진입 시 에이전트 프롬프트에 읽을 파일 경로 **명시 필수**, selective read 권장
- **Windows `next build` 불가**: WSL2 빌드가 진실 소스 (`/ypserver --skip-win-build`)

## 참조 문서

- [CHECKPOINT](../research/2026-04-supabase-parity/_CHECKPOINT_KDYWAVE.md) — Wave 3 상세
- [README](../research/2026-04-supabase-parity/README.md) — Wave 1+2+3 마스터 인덱스
- [00-product-vision.md](../research/2026-04-supabase-parity/00-vision/00-product-vision.md) — 비전 진입점
- [07-dq-matrix.md](../research/2026-04-supabase-parity/00-vision/07-dq-matrix.md) — DQ 64건 전수
- [09-multi-tenancy-decision.md](../research/2026-04-supabase-parity/00-vision/09-multi-tenancy-decision.md) — ADR-001

---
[← _index.md](./_index.md)
