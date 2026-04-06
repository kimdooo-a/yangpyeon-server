import { Role } from "@/generated/prisma/client";
import { z } from "zod";

export const memberListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  role: z.nativeEnum(Role).optional(),
  isActive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

export const updateMemberSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  phone: z
    .string()
    .regex(/^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/, "유효한 전화번호를 입력하세요")
    .optional(),
  isActive: z.boolean().optional(),
});

export const changeRoleSchema = z.object({
  role: z.nativeEnum(Role),
});
