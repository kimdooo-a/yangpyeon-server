import { z } from "zod";

export const mfaConfirmSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "6자리 숫자를 입력하세요"),
});

export const mfaChallengeSchema = z
  .object({
    challenge: z.string().min(1, "챌린지 토큰이 필요합니다"),
    code: z.string().regex(/^\d{6}$/).optional(),
    recoveryCode: z.string().min(6).optional(),
  })
  .refine((v) => Boolean(v.code) !== Boolean(v.recoveryCode), {
    message: "code 또는 recoveryCode 중 하나만 제공하세요",
  });

export const mfaDisableSchema = z.object({
  password: z.string().min(1, "비밀번호를 입력하세요"),
  code: z.string().regex(/^\d{6}$/, "6자리 숫자를 입력하세요"),
});
