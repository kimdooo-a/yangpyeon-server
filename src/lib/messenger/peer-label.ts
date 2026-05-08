/**
 * Peer label pure logic — F2-5 (M4 Phase 2).
 *
 * Conversation 의 표시명 derivation:
 *   - DIRECT: peer 의 user.name → user.email → userId 8자 prefix → "DM" fallback
 *   - GROUP/CHANNEL: title → "(제목 없음)" fallback
 *
 * `ConversationList.tsx` 의 file-local `derivePeerLabel` 을 분리해 단위 테스트 가능하게 함.
 */

export interface PeerLabelMember {
  userId: string;
  user?: { email?: string | null; name?: string | null } | null;
}

export interface PeerLabelInput {
  kind: "DIRECT" | "GROUP" | "CHANNEL";
  title: string | null;
  members?: PeerLabelMember[];
}

export function derivePeerLabel(
  conv: PeerLabelInput,
  currentUserId: string | undefined,
): string {
  if (conv.kind !== "DIRECT") {
    return conv.title ?? "(제목 없음)";
  }
  const members = conv.members ?? [];
  if (members.length === 0) return "DM";

  // peer = self 가 아닌 첫 멤버. self 식별 실패 시 첫 멤버를 peer 로 간주.
  const peer =
    members.find((m) => m.userId !== currentUserId) ??
    (currentUserId === undefined ? members[0] : undefined);
  if (!peer) return "DM";

  const name = peer.user?.name?.trim();
  if (name) return name;
  const email = peer.user?.email?.trim();
  if (email) return email;
  return peer.userId.slice(0, 8);
}
