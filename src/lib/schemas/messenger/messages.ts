/**
 * Zod schemas for messenger/messages 라우트.
 */
import { z } from "zod";

const UUID = z.string().uuid("UUID 형식이 아닙니다");

export const messageKindEnum = z.enum(["TEXT", "IMAGE", "FILE"]);
export const attachmentKindEnum = z.enum(["IMAGE", "FILE", "VOICE"]);

export const sendMessageSchema = z
  .object({
    kind: messageKindEnum.default("TEXT"),
    /** TEXT: 1~5000자. IMAGE/FILE: 캡션 ≤500자, 0자 허용. */
    body: z.string().max(5000, "본문은 5000자 이내").nullable().optional(),
    /** UUIDv7 권장 — 라인식 LocalMessageId. */
    clientGeneratedId: UUID,
    replyToId: UUID.optional(),
    attachments: z
      .array(
        z
          .object({
            fileId: UUID,
            kind: attachmentKindEnum,
            displayOrder: z.number().int().min(0).max(20).default(0),
          })
          .strict(),
      )
      .max(5, "첨부는 최대 5개")
      .optional(),
    mentions: z.array(UUID).max(20, "멘션은 최대 20명").optional(),
  })
  .strict()
  .refine(
    (d) => {
      // TEXT 는 body 1~5000 필수. IMAGE/FILE 은 attachments 1+ 필수.
      if (d.kind === "TEXT") {
        return typeof d.body === "string" && d.body.trim().length >= 1;
      }
      return Array.isArray(d.attachments) && d.attachments.length >= 1;
    },
    {
      message:
        "TEXT 는 body(1자 이상) 필수, IMAGE/FILE 은 attachments(1개 이상) 필수",
    },
  );

export const editMessageSchema = z
  .object({
    body: z
      .string()
      .trim()
      .min(1, "본문은 1자 이상")
      .max(5000, "본문은 5000자 이내"),
  })
  .strict();

export const searchMessagesSchema = z
  .object({
    q: z.string().trim().min(1).max(100),
    convId: UUID.optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .strict();

export const listMessagesSchema = z
  .object({
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    /** ISO 8601 timestamp 또는 messageId. helper 가 둘 다 처리. */
    before: z.string().min(1).optional(),
    after: z.string().min(1).optional(),
  })
  .strict();

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;
export type SearchMessagesInput = z.infer<typeof searchMessagesSchema>;
export type ListMessagesInput = z.infer<typeof listMessagesSchema>;
