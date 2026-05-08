/**
 * Mention search pure logic — F2-3 (M4 Phase 2).
 *
 * UI (`MessageComposer.tsx`) 와 분리된 트리거 감지 / 후보 필터링 / 선택 적용.
 *
 * 정책:
 *   - text body 에는 사람-읽기-가능 토큰 ("@email ") inject
 *   - mentions[] 배열에는 userId 만 별도 송신 (backend 가 mention row 저장 + 알림 발신)
 *   - 사용자가 텍스트에서 토큰 지워도 mentions[] 는 유지 — backend 가 알림 발신만 담당
 */

export interface MentionTrigger {
  active: boolean;
  query: string;
  /** @ 위치 (0-indexed) — applyMentionSelection 의 splice 시작점 */
  startPos: number;
}

export interface MentionCandidate {
  userId: string;
  email: string;
  role?: string;
}

export interface MentionSelectionResult {
  text: string;
  cursorPos: number;
  /** body 에 inject 된 토큰 (audit / 디버깅용) */
  mentionToken: string;
}

/**
 * 커서 직전 가장 가까운 @ 토큰을 감지 — active 여부 + query + startPos.
 *
 * 활성 조건:
 *   1. 커서 앞으로 거슬러 올라가며 @ 를 발견 (공백 만나기 전까지)
 *   2. @ 직전이 공백 또는 문자열 시작
 *   3. @ 와 커서 사이에 공백/개행 없음
 *
 * 비활성: 이메일 안의 @ ("user@host"), 토큰 종료 후 공백, 다른 토큰
 */
export function detectMentionTrigger(
  text: string,
  cursorPos: number,
): MentionTrigger {
  if (cursorPos < 0 || cursorPos > text.length) {
    return { active: false, query: "", startPos: -1 };
  }
  // 커서에서 뒤로 스캔 — @ 또는 공백/개행 만날 때까지
  for (let i = cursorPos - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === "@") {
      // @ 직전이 공백 또는 문자열 시작이어야 함 (이메일 회피)
      const prev = i === 0 ? null : text[i - 1];
      if (prev !== null && !/\s/.test(prev)) {
        return { active: false, query: "", startPos: -1 };
      }
      return {
        active: true,
        query: text.slice(i + 1, cursorPos),
        startPos: i,
      };
    }
    if (/\s/.test(ch)) {
      return { active: false, query: "", startPos: -1 };
    }
  }
  return { active: false, query: "", startPos: -1 };
}

/**
 * 후보 목록 필터링 — query 부분 매칭 (대소문자 구분 X) + 정렬.
 *
 * 정렬:
 *   1. email startsWith query (앞부분 매칭) 우선
 *   2. email includes query 후순
 *   3. 같은 그룹 안에서는 email 알파벳 순
 *
 * @param excludeUserId — 자기 자신 멘션 제외 (서버측 filter 와 정합)
 */
export function filterMentionCandidates(
  query: string,
  candidates: MentionCandidate[],
  excludeUserId?: string,
): MentionCandidate[] {
  const q = query.toLowerCase();
  const pool = excludeUserId
    ? candidates.filter((c) => c.userId !== excludeUserId)
    : candidates;
  if (q === "") {
    return [...pool].sort((a, b) => a.email.localeCompare(b.email));
  }
  const matched = pool.filter((c) => c.email.toLowerCase().includes(q));
  return matched.sort((a, b) => {
    const aStarts = a.email.toLowerCase().startsWith(q);
    const bStarts = b.email.toLowerCase().startsWith(q);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return a.email.localeCompare(b.email);
  });
}

/**
 * 선택된 후보를 text 에 inject — "@email " 토큰 + 공백 1개 + cursor 이동.
 *
 * 결과:
 *   text = text[0..startPos] + "@" + email + " " + text[cursorPos..]
 *   cursorPos = startPos + token.length + 1 (공백 포함)
 */
export function applyMentionSelection(
  text: string,
  trigger: MentionTrigger,
  candidate: MentionCandidate,
): MentionSelectionResult {
  if (!trigger.active || trigger.startPos < 0) {
    return { text, cursorPos: text.length, mentionToken: "" };
  }
  const before = text.slice(0, trigger.startPos);
  // query 의 길이만큼 + @ 1자 = trigger.startPos + 1 + query.length
  const queryEnd = trigger.startPos + 1 + trigger.query.length;
  const after = text.slice(queryEnd);
  const token = `@${candidate.email}`;
  const newText = `${before}${token} ${after}`;
  const cursorPos = before.length + token.length + 1;
  return { text: newText, cursorPos, mentionToken: token };
}
