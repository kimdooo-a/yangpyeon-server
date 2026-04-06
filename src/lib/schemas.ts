import { z } from "zod";

// PM2 프로세스 이름: 영문, 숫자, 하이픈, 언더스코어만 허용
const pm2Name = z.string().min(1).max(64).regex(/^[\w-]+$/, "잘못된 프로세스 이름");

// /api/auth/login
export const loginSchema = z.object({
  password: z.string().min(1, "비밀번호를 입력하세요").max(128),
});

// /api/pm2/[action] — body
export const pm2ActionBodySchema = z.object({
  name: pm2Name,
});

// /api/pm2/[action] — params
export const pm2ActionParamSchema = z.object({
  action: z.enum(["restart", "stop", "start"]),
});

// /api/pm2/logs — query
export const pm2LogsQuerySchema = z.object({
  process: z.string().max(64).regex(/^[\w-]*$/).default("all"),
  lines: z.coerce.number().int().min(1).max(500).default(100),
});

// /api/pm2/detail — query
export const pm2DetailQuerySchema = z.object({
  name: pm2Name,
});

// /api/audit — query (페이지네이션 + 필터)
export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  action: z.string().max(50).optional(),
  ip: z.string().max(45).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

// IP 화이트리스트 — 추가
export const ipWhitelistAddSchema = z.object({
  ip: z.string().min(1).max(45).regex(/^[\d.:a-fA-F]+$/, "유효하지 않은 IP"),
  description: z.string().max(200).optional(),
});

// IP 화이트리스트 — 삭제
export const ipWhitelistDeleteSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// /api/metrics/history — query
export const metricsHistoryQuerySchema = z.object({
  range: z.enum(["1h", "24h", "7d", "30d"]).default("1h"),
});

// 환경변수 — 추가/수정
export const envAddSchema = z.object({
  key: z.string().min(1).max(100).regex(/^[A-Z][A-Z0-9_]*$/, "대문자+언더스코어만 허용"),
  value: z.string().max(2000),
});

// 환경변수 — 삭제
export const envDeleteSchema = z.object({
  key: z.string().min(1).max(100),
});

// 파일박스 스키마 → src/lib/schemas/filebox.ts로 이동됨
