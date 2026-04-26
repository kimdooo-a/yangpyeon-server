import { z } from "zod";

// HEX 색상 (#RRGGBB 또는 #RGB) — 클라이언트 색상 팔레트 검증.
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const stickyNoteVisibilityEnum = z.enum(["PRIVATE", "SHARED"]);

export const createStickyNoteSchema = z.object({
  content: z.string().max(4000, "메모는 4000자 이내").default(""),
  color: z.string().regex(HEX_COLOR_RE, "색상은 HEX 형식(#RRGGBB)").default("#fde68a"),
  posX: z.number().int().min(0).max(10000).default(40),
  posY: z.number().int().min(0).max(10000).default(40),
  width: z.number().int().min(140).max(640).default(220),
  height: z.number().int().min(120).max(640).default(220),
  visibility: stickyNoteVisibilityEnum.default("PRIVATE"),
  pinned: z.boolean().default(false),
});

export const updateStickyNoteSchema = z
  .object({
    content: z.string().max(4000).optional(),
    color: z.string().regex(HEX_COLOR_RE).optional(),
    posX: z.number().int().min(0).max(10000).optional(),
    posY: z.number().int().min(0).max(10000).optional(),
    width: z.number().int().min(140).max(640).optional(),
    height: z.number().int().min(120).max(640).optional(),
    visibility: stickyNoteVisibilityEnum.optional(),
    pinned: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "수정할 필드가 없습니다" });

export type CreateStickyNoteInput = z.infer<typeof createStickyNoteSchema>;
export type UpdateStickyNoteInput = z.infer<typeof updateStickyNoteSchema>;
export type StickyNoteVisibility = z.infer<typeof stickyNoteVisibilityEnum>;
