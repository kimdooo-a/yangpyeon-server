"use client";

/**
 * MessageComposer — F2-1 / F2-2 / F2-3 (M4 Phase 2).
 *
 * 책임:
 *   - textarea autosize (1줄 → 최대 6줄, scrollable beyond)
 *   - Enter 송신 / Shift+Enter 줄바꿈 / IME composing 중 송신 무시
 *   - canSend 비활성 시 전송 버튼 disabled
 *   - F2-3 — 답장 인용 banner (replyTo) + ✕ 버튼 dismiss
 *   - F2-3 — @ 입력 시 멘션 popover (cmdk Command) — members prop 기반 후보 표시
 *
 * 의도적 보류 (F2-4+):
 *   - 첨부 / 이모지 → 버튼만 disabled placeholder
 *   - SSE/낙관적 송신 통합은 부모(page) 가 처리
 *
 * Pure logic 은 src/lib/messenger/{composer-logic,uuidv7,mention-search,reply-quote}.ts 로 분리.
 * 컴포넌트 자체는 jsdom 미도입 (S87-INFRA-1) 으로 테스트 불가 — 수동 검증 영역.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { Paperclip, Smile, AtSign, Send, X } from "lucide-react";
import { Command } from "cmdk";
import {
  canSendText,
  prepareSendPayload,
  shouldSubmitOnEnter,
  type SendPayload,
} from "@/lib/messenger/composer-logic";
import {
  detectMentionTrigger,
  filterMentionCandidates,
  applyMentionSelection,
  type MentionCandidate,
} from "@/lib/messenger/mention-search";
import { formatReplyPreview } from "@/lib/messenger/reply-quote";

export interface ReplyTarget {
  id: string;
  body: string | null;
  kind: "TEXT" | "IMAGE" | "FILE" | "SYSTEM";
  deletedAt?: string | Date | null;
  senderName?: string | null;
}

interface Props {
  onSend: (payload: SendPayload) => void | Promise<void>;
  disabled?: boolean;
  /** F2-3 — 멘션 후보 (대화 멤버 목록, 자기 자신 제외 필터는 본 컴포넌트가 처리) */
  members?: MentionCandidate[];
  /** F2-3 — 자기 자신 멘션 회피용 */
  currentUserId?: string;
  /** F2-3 — 답장 대상 (page 에서 제어) */
  replyTo?: ReplyTarget | null;
  /** F2-3 — 답장 banner ✕ 클릭 시 page 측 상태 초기화 */
  onClearReply?: () => void;
}

const MIN_ROWS = 1;
const MAX_ROWS = 6;
const ROW_PX = 20; // line-height 기반, Tailwind text-sm + leading-5 와 정합
const MAX_POPOVER_ITEMS = 8;

export function MessageComposer({
  onSend,
  disabled = false,
  members = [],
  currentUserId,
  replyTo = null,
  onClearReply,
}: Props) {
  const [value, setValue] = useState("");
  const [composing, setComposing] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const [mentionUserIds, setMentionUserIds] = useState<string[]>([]);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const sendable = !disabled && canSendText(value);

  const trigger = useMemo(
    () => detectMentionTrigger(value, cursorPos),
    [value, cursorPos],
  );

  const popoverItems = useMemo(() => {
    if (!trigger.active) return [];
    return filterMentionCandidates(trigger.query, members, currentUserId).slice(
      0,
      MAX_POPOVER_ITEMS,
    );
  }, [trigger, members, currentUserId]);

  const popoverOpen = trigger.active && popoverItems.length > 0;

  const replyPreview = useMemo(() => {
    if (!replyTo) return null;
    return formatReplyPreview({
      body: replyTo.body,
      kind: replyTo.kind,
      deletedAt: replyTo.deletedAt,
      senderName: replyTo.senderName,
    });
  }, [replyTo]);

  const autosize = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    const min = MIN_ROWS * ROW_PX;
    const max = MAX_ROWS * ROW_PX;
    const next = Math.min(max, Math.max(min, el.scrollHeight));
    el.style.height = `${next}px`;
  };

  useEffect(() => {
    autosize();
  }, [value]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    setCursorPos(e.target.selectionStart ?? e.target.value.length);
  };

  const submit = () => {
    if (!sendable) return;
    const payload = prepareSendPayload(value, {
      replyToId: replyTo?.id ?? null,
      mentions: mentionUserIds,
    });
    setValue("");
    setMentionUserIds([]);
    setCursorPos(0);
    onClearReply?.();
    void onSend(payload);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 멘션 popover 가 열린 상태 + Enter → popover 가 선택 처리하도록 텍스트 송신 차단
    // (실제 선택은 popover 의 onSelect 가 처리)
    if (
      popoverOpen &&
      (e.key === "Enter" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "Escape")
    ) {
      // cmdk 에 키 위임 — preventDefault 는 cmdk 가 알아서 처리
      return;
    }
    if (
      shouldSubmitOnEnter({
        key: e.key,
        shiftKey: e.shiftKey,
        isComposing: composing || e.nativeEvent.isComposing === true,
      })
    ) {
      e.preventDefault();
      submit();
    }
  };

  const handleSelect = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setCursorPos(e.target.selectionStart ?? e.target.value.length);
  };

  const handleSelectCandidate = (c: MentionCandidate) => {
    const r = applyMentionSelection(value, trigger, c);
    setValue(r.text);
    setCursorPos(r.cursorPos);
    setMentionUserIds((prev) =>
      prev.includes(c.userId) ? prev : [...prev, c.userId],
    );
    // textarea cursor 위치 복원
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(r.cursorPos, r.cursorPos);
    });
  };

  return (
    <div className="border-t border-border bg-surface-200">
      {replyPreview && replyTo && (
        <div className="px-3 pt-2 pb-1.5 border-b border-border bg-surface-100/60">
          <div className="flex items-start gap-2">
            <div className="w-1 self-stretch rounded-sm bg-primary/70" aria-hidden />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-primary">
                {replyPreview.senderLabel} 에게 답장
              </div>
              <div className="text-[12px] text-gray-600 truncate">
                {replyPreview.snippet || "(빈 본문)"}
              </div>
            </div>
            <button
              type="button"
              onClick={onClearReply}
              aria-label="답장 취소"
              className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-surface-300"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
      <div className="relative">
        {popoverOpen && (
          <div
            role="listbox"
            aria-label="멘션 후보"
            className="absolute bottom-full left-12 mb-1 w-72 max-h-64 overflow-y-auto bg-surface-100 border border-border rounded-md shadow-lg z-30"
          >
            <Command label="멘션 후보">
              <Command.List>
                {popoverItems.map((c) => (
                  <Command.Item
                    key={c.userId}
                    value={c.email}
                    onSelect={() => handleSelectCandidate(c)}
                    className="px-3 py-2 text-sm cursor-pointer flex items-center justify-between aria-selected:bg-primary/10 hover:bg-surface-200"
                  >
                    <span className="text-gray-800 truncate">{c.email}</span>
                    {c.role && (
                      <span className="text-[10px] text-gray-500 ml-2 flex-shrink-0">
                        {c.role}
                      </span>
                    )}
                  </Command.Item>
                ))}
              </Command.List>
            </Command>
          </div>
        )}
        <div className="flex items-end gap-2 px-3 py-2.5">
          <button
            type="button"
            disabled
            className="p-2 rounded-md text-gray-400 cursor-not-allowed"
            aria-label="첨부 (F2-4+)"
            title="첨부 (F2-4+)"
          >
            <Paperclip size={18} />
          </button>
          <button
            type="button"
            disabled
            className="p-2 rounded-md text-gray-400 cursor-not-allowed"
            aria-label="이모지 (F2-4+)"
            title="이모지 (F2-4+)"
          >
            <Smile size={18} />
          </button>
          <button
            type="button"
            onClick={() => {
              const el = taRef.current;
              if (!el) return;
              const cur = el.selectionStart ?? value.length;
              const before = value.slice(0, cur);
              const after = value.slice(cur);
              const insert =
                before.length === 0 || /\s$/.test(before) ? "@" : " @";
              const next = `${before}${insert}${after}`;
              setValue(next);
              const newCursor = before.length + insert.length;
              setCursorPos(newCursor);
              requestAnimationFrame(() => {
                el.focus();
                el.setSelectionRange(newCursor, newCursor);
              });
            }}
            disabled={disabled || members.length === 0}
            className="p-2 rounded-md text-gray-500 hover:bg-surface-300 disabled:text-gray-400 disabled:cursor-not-allowed"
            aria-label="멘션 (@)"
            title={
              members.length === 0
                ? "멤버 정보 로드 중"
                : "@ 입력 후 후보 선택"
            }
          >
            <AtSign size={18} />
          </button>
          <textarea
            ref={taRef}
            rows={MIN_ROWS}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onSelect={handleSelect}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            disabled={disabled}
            placeholder="메시지 입력 (Enter 송신, Shift+Enter 줄바꿈, @ 멘션)"
            aria-label="메시지 입력"
            className="flex-1 resize-none bg-surface-100 border border-border rounded-md px-3 py-2 text-sm leading-5 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:text-gray-400"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!sendable}
            aria-label="전송"
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:bg-surface-300 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <Send size={14} />
            전송
          </button>
        </div>
      </div>
    </div>
  );
}
