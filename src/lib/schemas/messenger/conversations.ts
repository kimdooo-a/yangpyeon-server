/**
 * Zod schemas for messenger/conversations 라우트.
 *
 * 모든 스키마는 .strict() — 정의되지 않은 필드 차단 (Phase 1 폐쇄형).
 */
import { z } from "zod";

const UUID = z.string().uuid("UUID 형식이 아닙니다");

export const conversationKindEnum = z.enum(["DIRECT", "GROUP"]);

export const createConversationSchema = z
  .object({
    kind: conversationKindEnum,
    /** DIRECT: peerId 필수. GROUP: memberIds 필수. discriminated union 대신 sentinel + refine. */
    peerId: UUID.optional(),
    memberIds: z.array(UUID).optional(),
    title: z
      .string()
      .trim()
      .min(1, "제목은 1자 이상")
      .max(80, "제목은 80자 이내")
      .optional(),
  })
  .strict()
  .refine(
    (d) => {
      if (d.kind === "DIRECT") {
        return !!d.peerId && !d.memberIds;
      }
      // GROUP
      return Array.isArray(d.memberIds) && d.memberIds.length >= 1;
    },
    { message: "DIRECT 는 peerId, GROUP 은 memberIds(≥1) 필수" },
  )
  .refine(
    (d) => {
      if (d.kind !== "GROUP") return true;
      // GROUP 한도: memberIds + creator 합 ≤ 100. helper 가 정확 검증하므로 여기서는 105 기준 사전 차단만.
      return (d.memberIds?.length ?? 0) <= 99;
    },
    { message: "GROUP 멤버는 99명 이하 (creator 포함 100명)" },
  );

export const updateConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(80).optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, {
    message: "수정할 필드가 없습니다",
  });

export const updateMemberSelfSchema = z
  .object({
    pinned: z.boolean().optional(),
    /**
     * mutedUntil — ISO 8601 string 또는 null (해제).
     * null 명시 시 설정 해제, undefined 면 변경 없음.
     */
    mutedUntil: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, {
    message: "수정할 필드가 없습니다",
  });

export const addMembersSchema = z
  .object({
    userIds: z
      .array(UUID)
      .min(1, "최소 1명")
      .max(50, "한 번에 최대 50명까지 추가"),
  })
  .strict();

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
export type UpdateMemberSelfInput = z.infer<typeof updateMemberSelfSchema>;
export type AddMembersInput = z.infer<typeof addMembersSchema>;
