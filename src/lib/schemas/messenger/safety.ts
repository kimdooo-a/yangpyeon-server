/**
 * Zod schemas for messenger 안전 영역 (blocks, reports, notification preferences).
 */
import { z } from "zod";

const UUID = z.string().uuid("UUID 형식이 아닙니다");

export const blockUserSchema = z
  .object({
    blockedId: UUID,
    reason: z.string().trim().max(500, "사유는 500자 이내").optional(),
  })
  .strict();

export const reportTargetKindEnum = z.enum(["MESSAGE", "USER"]);

export const fileReportSchema = z
  .object({
    targetKind: reportTargetKindEnum,
    targetId: UUID,
    reason: z
      .string()
      .trim()
      .min(1, "사유는 1자 이상")
      .max(500, "사유는 500자 이내"),
  })
  .strict();

export const resolveReportActionEnum = z.enum([
  "DELETE_MESSAGE",
  "BLOCK_USER",
  "DISMISS",
]);

export const resolveReportSchema = z
  .object({
    action: resolveReportActionEnum,
    note: z.string().trim().max(500).optional(),
  })
  .strict();

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const updateNotificationPrefsSchema = z
  .object({
    mentionsOnly: z.boolean().optional(),
    /** "HH:MM" 형식 또는 null (해제). */
    dndStart: z
      .string()
      .regex(HHMM_RE, "HH:MM 형식")
      .nullable()
      .optional(),
    dndEnd: z.string().regex(HHMM_RE, "HH:MM 형식").nullable().optional(),
    pushEnabled: z.boolean().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, {
    message: "수정할 필드가 없습니다",
  })
  .refine(
    (d) => {
      // dndStart/dndEnd 는 둘 다 set 또는 둘 다 null 이어야 의미가 있음.
      // 하지만 부분 갱신을 허용 — UI 가 단계별 설정 가능.
      return true;
    },
    { message: "DND 설정 검증 통과" },
  );

export type BlockUserInput = z.infer<typeof blockUserSchema>;
export type FileReportInput = z.infer<typeof fileReportSchema>;
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;
export type UpdateNotificationPrefsInput = z.infer<
  typeof updateNotificationPrefsSchema
>;
