import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("유효한 이메일을 입력하세요"),
  password: z
    .string()
    .min(8, "비밀번호는 최소 8자입니다")
    .max(100, "비밀번호는 최대 100자입니다"),
  name: z.string().min(1).max(50).optional(),
  phone: z
    .string()
    .regex(/^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/, "유효한 전화번호를 입력하세요")
    .optional(),
});

export const loginSchema = z.object({
  email: z.string().email("유효한 이메일을 입력하세요"),
  password: z.string().min(1, "비밀번호를 입력하세요"),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  phone: z
    .string()
    .regex(/^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/, "유효한 전화번호를 입력하세요")
    .optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "현재 비밀번호를 입력하세요"),
  newPassword: z
    .string()
    .min(8, "새 비밀번호는 최소 8자입니다")
    .max(100, "새 비밀번호는 최대 100자입니다"),
});
