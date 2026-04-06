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

// /api/audit — query
export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

// 파일박스 스키마 → src/lib/schemas/filebox.ts로 이동됨
