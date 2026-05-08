"use client";

/**
 * MessageComposer — F2-1 (M4 Phase 2 첫 단계).
 *
 * 책임:
 *   - textarea autosize (1줄 → 최대 6줄, scrollable beyond)
 *   - Enter 송신 / Shift+Enter 줄바꿈 / IME composing 중 송신 무시
 *   - canSend 비활성 시 전송 버튼 disabled
 *   - onSend 호출 후 textarea clear (낙관적 UX)
 *
 * 의도적 보류 (F2-2~F2-5):
 *   - 첨부 / 이모지 / 멘션 / 답장 인용 카드 → 버튼만 disabled placeholder
 *   - 실제 fetch 호출은 부모(page) 가 처리 — 본 컴포넌트는 onSend callback 만 호출
 *
 * Pure logic 은 src/lib/messenger/composer-logic.ts + uuidv7.ts 로 분리.
 * 컴포넌트 자체는 jsdom 미도입 (S87-INFRA-1) 으로 테스트 불가 — 수동 검증 영역.
 */
import { useRef, useState, type KeyboardEvent, type ChangeEvent } from "react";
import { Paperclip, Smile, AtSign, Send } from "lucide-react";
import {
  canSendText,
  prepareSendPayload,
  shouldSubmitOnEnter,
  type SendPayload,
} from "@/lib/messenger/composer-logic";

interface Props {
  onSend: (payload: SendPayload) => void | Promise<void>;
  disabled?: boolean;
}

const MIN_ROWS = 1;
const MAX_ROWS = 6;
const ROW_PX = 20; // line-height 기반, Tailwind text-sm + leading-5 와 정합

export function MessageComposer({ onSend, disabled = false }: Props) {
  const [value, setValue] = useState("");
  const [composing, setComposing] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const sendable = !disabled && canSendText(value);

  const autosize = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    const min = MIN_ROWS * ROW_PX;
    const max = MAX_ROWS * ROW_PX;
    const next = Math.min(max, Math.max(min, el.scrollHeight));
    el.style.height = `${next}px`;
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    autosize();
  };

  const submit = () => {
    if (!sendable) return;
    const payload = prepareSendPayload(value);
    setValue("");
    // 다음 tick 에 textarea height 도 reset
    requestAnimationFrame(() => autosize());
    void onSend(payload);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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

  return (
    <div className="border-t border-border bg-surface-200 px-3 py-2.5">
      <div className="flex items-end gap-2">
        <button
          type="button"
          disabled
          className="p-2 rounded-md text-gray-400 cursor-not-allowed"
          aria-label="첨부 (F2-3+)"
          title="첨부 (F2-3+)"
        >
          <Paperclip size={18} />
        </button>
        <button
          type="button"
          disabled
          className="p-2 rounded-md text-gray-400 cursor-not-allowed"
          aria-label="이모지 (F2-3+)"
          title="이모지 (F2-3+)"
        >
          <Smile size={18} />
        </button>
        <button
          type="button"
          disabled
          className="p-2 rounded-md text-gray-400 cursor-not-allowed"
          aria-label="멘션 (F2-3+)"
          title="멘션 (F2-3+)"
        >
          <AtSign size={18} />
        </button>
        <textarea
          ref={taRef}
          rows={MIN_ROWS}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          disabled={disabled}
          placeholder="메시지 입력 (Enter 송신, Shift+Enter 줄바꿈)"
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
  );
}
