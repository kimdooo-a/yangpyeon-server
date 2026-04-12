"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";

interface ChannelInfo {
  channel: string;
  subscribers: number;
  lastActive: number;
}

interface LogLine {
  id: number;
  at: string;
  channel: string;
  event: string;
  payload: unknown;
}

export default function RealtimePage() {
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [joinInput, setJoinInput] = useState("");
  const [subscribedChannel, setSubscribedChannel] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [broadcastForm, setBroadcastForm] = useState({
    channel: "",
    event: "message",
    payload: '{"text":"hello"}',
  });
  const esRef = useRef<EventSource | null>(null);
  const logIdRef = useRef(0);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/realtime/channels");
      const json = await res.json();
      if (json.success) setChannels(json.data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchChannels();
    const t = setInterval(fetchChannels, 10_000);
    return () => clearInterval(t);
  }, [fetchChannels]);

  useEffect(() => {
    return () => {
      if (esRef.current) esRef.current.close();
    };
  }, []);

  function joinChannel(name: string) {
    const ch = name.trim();
    if (!ch) return;
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    const es = new EventSource(`/api/sse/realtime/channel/${encodeURIComponent(ch)}`);
    esRef.current = es;
    setSubscribedChannel(ch);
    setLogs([]);
    setBroadcastForm((f) => ({ ...f, channel: f.channel || ch }));

    es.addEventListener("ready", () => {
      toast.success(`채널 "${ch}" 구독 시작`);
    });
    es.addEventListener("message", (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        setLogs((prev) => {
          logIdRef.current += 1;
          const next: LogLine = {
            id: logIdRef.current,
            at: new Date(data.timestamp ?? Date.now()).toLocaleTimeString("ko-KR"),
            channel: data.channel,
            event: data.event,
            payload: data.payload,
          };
          return [next, ...prev].slice(0, 100);
        });
      } catch {
        // malformed — skip
      }
    });
    es.onerror = () => {
      toast.error("SSE 연결 오류");
    };
  }

  function leaveChannel() {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setSubscribedChannel(null);
  }

  async function handleBroadcast() {
    let payload: unknown = null;
    try {
      payload = broadcastForm.payload.trim() ? JSON.parse(broadcastForm.payload) : null;
    } catch {
      toast.error("payload JSON 파싱 실패");
      return;
    }
    const res = await fetch("/api/v1/realtime/broadcast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel: broadcastForm.channel,
        event: broadcastForm.event,
        payload,
      }),
    });
    const json = await res.json();
    if (json.success) {
      toast.success("브로드캐스트 완료");
      fetchChannels();
    } else {
      toast.error(json.error?.message ?? "실패");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Realtime Channels"
        description="프로세스 내 EventEmitter 기반 경량 실시간 채널 (MANAGER+)"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-medium">Broadcast</h2>
          <div className="space-y-2 text-sm">
            <div>
              <label className="mb-1 block text-xs font-medium">Channel</label>
              <input
                className="w-full rounded-md border bg-background px-2 py-1"
                value={broadcastForm.channel}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, channel: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Event</label>
              <input
                className="w-full rounded-md border bg-background px-2 py-1"
                value={broadcastForm.event}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, event: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Payload JSON</label>
              <textarea
                className="h-20 w-full rounded-md border bg-background p-2 font-mono text-xs"
                value={broadcastForm.payload}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, payload: e.target.value })}
              />
            </div>
            <Button size="sm" onClick={handleBroadcast}>
              발송
            </Button>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-medium">Join 채널</h2>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-md border bg-background px-2 py-1 text-sm"
              placeholder="채널명 입력"
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
            />
            <Button size="sm" onClick={() => joinChannel(joinInput)}>
              Join
            </Button>
            {subscribedChannel && (
              <Button size="sm" variant="ghost" onClick={leaveChannel}>
                Leave
              </Button>
            )}
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            구독 중: {subscribedChannel ?? "없음"}
          </div>

          <h3 className="mt-4 mb-2 text-xs font-medium">활성 채널</h3>
          {channels.length === 0 ? (
            <div className="text-xs text-muted-foreground">없음</div>
          ) : (
            <ul className="space-y-1 text-xs">
              {channels.map((c) => (
                <li key={c.channel} className="flex items-center justify-between">
                  <button
                    className="text-primary underline-offset-2 hover:underline"
                    onClick={() => joinChannel(c.channel)}
                  >
                    {c.channel}
                  </button>
                  <span className="text-muted-foreground">
                    subs {c.subscribers} · {c.lastActive ? new Date(c.lastActive).toLocaleTimeString("ko-KR") : "-"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3 text-sm font-medium">실시간 로그 (최대 100건)</div>
        {logs.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground">메시지 없음</div>
        ) : (
          <ul className="divide-y">
            {logs.map((l) => (
              <li key={l.id} className="px-4 py-2 text-xs">
                <div className="flex justify-between">
                  <span className="font-medium">
                    [{l.channel}] {l.event}
                  </span>
                  <span className="text-muted-foreground">{l.at}</span>
                </div>
                <pre className="mt-1 whitespace-pre-wrap text-muted-foreground">
                  {JSON.stringify(l.payload, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
