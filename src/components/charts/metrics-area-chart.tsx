"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface MetricsAreaChartProps {
  data: { timestamp: number; value: number }[];
  dataKey?: string;
  color: string;
  title: string;
  unit: string; // "%" 또는 "GB" 등
}

/** 타임스탬프 → 시:분 형식 */
function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** 타임스탬프 → 날짜 + 시간 형식 (툴팁용) */
function formatFull(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** 커스텀 툴팁 */
function CustomTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: { value: number; payload: { timestamp: number } }[];
  unit: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0];
  return (
    <div className="bg-surface-300 border border-border rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-gray-500">{formatFull(item.payload.timestamp)}</p>
      <p className="text-sm font-medium text-gray-900">
        {item.value.toFixed(1)}{unit}
      </p>
    </div>
  );
}

export function MetricsAreaChart({ data, color, title, unit }: MetricsAreaChartProps) {
  const gradientId = `gradient-${color.replace("#", "")}`;

  return (
    <div className="bg-surface-200 border border-border rounded-lg p-5">
      <h3 className="text-sm font-medium text-gray-700 mb-4">{title}</h3>
      {data.length === 0 ? (
        <div className="h-[240px] flex items-center justify-center text-gray-500 text-sm">
          데이터가 없습니다
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2e2e2e" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatTime}
              tick={{ fill: "#a0a0a0", fontSize: 11 }}
              axisLine={{ stroke: "#2e2e2e" }}
              tickLine={{ stroke: "#2e2e2e" }}
              minTickGap={40}
            />
            <YAxis
              tick={{ fill: "#a0a0a0", fontSize: 11 }}
              axisLine={{ stroke: "#2e2e2e" }}
              tickLine={{ stroke: "#2e2e2e" }}
              tickFormatter={(v: number) => `${v}${unit}`}
              width={55}
            />
            <Tooltip content={<CustomTooltip unit={unit} />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 4, fill: color, stroke: "#1a1a1a", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
