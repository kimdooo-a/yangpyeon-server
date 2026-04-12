import { EventEmitter } from "node:events";
import type { RealtimeMessage } from "@/lib/types/supabase-clone";

/**
 * 세션 14 Cluster B: Realtime Channels — 프로세스 내 EventEmitter 싱글턴.
 *
 * 용도: MANAGER 이상 관리자가 운영 중인 페이지/이벤트를 서로 브로드캐스트.
 * 스코프: 단일 Node 프로세스. 다중 인스턴스 확장은 v2에서 Redis pub/sub 검토.
 */

interface RealtimeBus {
  emitter: EventEmitter;
  /** 채널별 최근 활동 시각(ms) */
  lastActive: Map<string, number>;
  /** 채널별 활성 구독자 수 */
  subscribers: Map<string, number>;
}

declare global {
  // eslint-disable-next-line no-var
  var __realtimeBus: RealtimeBus | undefined;
}

function getBus(): RealtimeBus {
  if (!globalThis.__realtimeBus) {
    const em = new EventEmitter();
    em.setMaxListeners(0);
    globalThis.__realtimeBus = {
      emitter: em,
      lastActive: new Map(),
      subscribers: new Map(),
    };
  }
  return globalThis.__realtimeBus;
}

function channelEvent(channel: string): string {
  return `ch:${channel}`;
}

export function subscribe(
  channel: string,
  cb: (message: RealtimeMessage) => void
): () => void {
  const bus = getBus();
  const key = channelEvent(channel);
  bus.emitter.on(key, cb);
  bus.subscribers.set(channel, (bus.subscribers.get(channel) ?? 0) + 1);
  bus.lastActive.set(channel, Date.now());

  return () => {
    bus.emitter.off(key, cb);
    const next = (bus.subscribers.get(channel) ?? 1) - 1;
    if (next <= 0) {
      bus.subscribers.delete(channel);
    } else {
      bus.subscribers.set(channel, next);
    }
  };
}

export function publish(channel: string, event: string, payload: unknown): RealtimeMessage {
  const bus = getBus();
  const message: RealtimeMessage = {
    channel,
    event,
    payload,
    timestamp: Date.now(),
  };
  bus.emitter.emit(channelEvent(channel), message);
  bus.lastActive.set(channel, message.timestamp);
  return message;
}

export interface ChannelInfo {
  channel: string;
  subscribers: number;
  lastActive: number;
}

/** 최근 활동 채널 리스트(최신순) */
export function listChannels(): ChannelInfo[] {
  const bus = getBus();
  const names = new Set<string>([
    ...bus.lastActive.keys(),
    ...bus.subscribers.keys(),
  ]);
  return Array.from(names)
    .map<ChannelInfo>((name) => ({
      channel: name,
      subscribers: bus.subscribers.get(name) ?? 0,
      lastActive: bus.lastActive.get(name) ?? 0,
    }))
    .sort((a, b) => b.lastActive - a.lastActive);
}
